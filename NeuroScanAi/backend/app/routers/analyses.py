import asyncio
import base64
import json
import math
import os
from datetime import datetime
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.database.db import SessionLocal
from app.models.medical import MRIScan, Diagnosis, Report, ScanStatus, DiseaseType
from app.models.user import User
from app.inference import analyze_image, predict_segmentation_with_confidence
from app.ml.alzheimer_inference import predict_alzheimer_from_image_path
from app.ml.inference_engine import (
    InferenceError,
    get_inference_status,
    probs_to_json,
    get_loaded_model_or_error,
)
from app.ml.monai_preprocess import (
    _build_file_map,
    _validate_file_map,
    resolve_modality_workspace,
)
from app.model_loader import get_brats_bundle_predictor
from app.preprocessing import load_mri_images, preprocess
from app.visualization import best_axial_slice_index, save_mri_axial_slice_png, save_overlay
from app.reports.pdf_generator import render_segmentation_report_pdf
from app.reports.segmentation_metrics import compute_tumor_metrics, voxel_volume_mm3_from_scan_folder
from app.security.jwt import role_required, get_current_user

router = APIRouter(prefix="/api/analyses", tags=["Analyses"])
api_router = APIRouter(prefix="/api", tags=["Analyses"])
core_router = APIRouter(prefix="/api", tags=["Reports"])

# Simple in-memory broadcaster for SSE (sufficient for single-process dev)
_subscribers: list[asyncio.Queue] = []
REPORTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "reports"))
os.makedirs(REPORTS_DIR, exist_ok=True)
RESULTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "results"))
os.makedirs(RESULTS_DIR, exist_ok=True)
UPLOADS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class GenerateReportBody(BaseModel):
    scan_id: int = Field(..., description="MRI scan to segment and summarize")
    patient_id: int = Field(..., description="Must match the scan's patient_id")
    patient_name: str | None = None
    age: int | None = None
    gender: str | None = None


class SendReportBody(BaseModel):
    report_id: int
    patient_id: int


def _png_file_data_uri(path: str) -> str:
    with open(path, "rb") as handle:
        b64 = base64.standard_b64encode(handle.read()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def _image_file_data_uri(path: str) -> str | None:
    if not path or not os.path.isfile(path):
        return None
    low = path.lower()
    mime = "png"
    if low.endswith((".jpg", ".jpeg")):
        mime = "jpeg"
    with open(path, "rb") as handle:
        b64 = base64.standard_b64encode(handle.read()).decode("ascii")
    return f"data:image/{mime};base64,{b64}"


def _publish(event: dict):
    # non-async fire-and-forget: put into all subscriber queues
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except Exception:
            pass


def _latest_diagnosis_for_scan(db: Session, scan_id: int) -> Diagnosis | None:
    return (
        db.query(Diagnosis)
        .filter(Diagnosis.scan_id == scan_id)
        .order_by(Diagnosis.id.desc())
        .first()
    )


def _uploads_url_from_abs_path(abs_path: str) -> str | None:
    if not abs_path:
        return None
    candidate = os.path.abspath(abs_path)
    try:
        rel = os.path.relpath(candidate, UPLOADS_DIR)
    except Exception:
        return None
    if rel.startswith(".."):
        return None
    rel_web = rel.replace("\\", "/")
    return f"/uploads/{rel_web}"


def _scan_preview_url(scan: MRIScan, segmentation_meta: dict | None) -> str | None:
    if segmentation_meta:
        overlay = segmentation_meta.get("overlay_image")
        if isinstance(overlay, str) and overlay.strip():
            return overlay
        ref_png = segmentation_meta.get("reference_mri_png")
        if isinstance(ref_png, str) and ref_png.strip():
            return ref_png

    path = (scan.file_path or "").strip()
    if not path:
        return None

    image_ext = (".png", ".jpg", ".jpeg", ".webp", ".gif")
    if os.path.isfile(path) and path.lower().endswith(image_ext):
        return _uploads_url_from_abs_path(path)

    if os.path.isdir(path):
        try:
            for name in sorted(os.listdir(path)):
                p = os.path.join(path, name)
                if os.path.isfile(p) and name.lower().endswith(image_ext):
                    return _uploads_url_from_abs_path(p)
        except Exception:
            return None
    return None


def _write_report_file(scan: MRIScan, diagnosis: Diagnosis, report: Report) -> str:
    filename = f"report_scan_{scan.id}_diagnosis_{diagnosis.id}.txt"
    output_path = os.path.join(REPORTS_DIR, filename)
    patient_name = getattr(scan.patient, "name", None) or getattr(scan.patient, "email", "Patient")
    doctor_name = getattr(scan.doctor, "name", None) or getattr(scan.doctor, "email", "Doctor")
    lines = [
        "NeuroScan AI Report",
        "===================",
        f"Report ID: {report.id}",
        f"Scan ID: {scan.id}",
        f"Patient: {patient_name}",
        f"Doctor: {doctor_name}",
        f"Uploaded: {scan.upload_date.isoformat() if scan.upload_date else ''}",
        f"Prediction: {diagnosis.prediction}",
        f"Confidence: {diagnosis.confidence}%",
        "",
        "Summary:",
        report.summary or "",
        "",
        "Recommendation:",
        report.recommendation or "",
        "",
    ]
    with open(output_path, "w", encoding="utf-8") as handle:
        handle.write("\n".join(lines))
    return output_path


def _inference_http_exception(exc: InferenceError) -> HTTPException:
    if exc.code == "volume_load_failed":
        return HTTPException(status_code=400, detail=exc.message)
    if exc.code in ("model_unavailable", "pytorch_missing", "model_unreliable"):
        return HTTPException(status_code=503, detail=exc.message)
    return HTTPException(status_code=500, detail=exc.message)


def _fetch_accessible_scan(scan_id: int, db: Session, current) -> MRIScan:
    scan = db.query(MRIScan).filter(MRIScan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if scan.doctor_id != current.id and (current.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized: You are not assigned to this scan")
    return scan


def _scan_modality_folder(scan: MRIScan) -> str:
    raw = (scan.file_path or "").strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Scan has no file_path")
    try:
        return resolve_modality_workspace(raw)
    except FileNotFoundError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e


@router.get("/model-status")
def model_status(current=Depends(role_required("doctor", "admin"))):
    """Report whether PyTorch and weights are available (no inference on a volume)."""
    return get_inference_status()


def _serialize_analysis(diagnosis: Diagnosis, report: Report | None, scan: MRIScan) -> dict:
    filename = os.path.basename(scan.file_path or "")
    doctor = getattr(scan, "doctor", None)
    patient = getattr(scan, "patient", None)
    report_download_url = None
    if report and (report.pdf_path or report.file_path):
        report_download_url = f"/reports/{report.id}"
    segmentation_meta = None
    if diagnosis.model_meta:
        try:
            raw = json.loads(diagnosis.model_meta)
            if isinstance(raw, dict) and raw.get("report_type") == "segmentation_pdf":
                segmentation_meta = {
                    "tumor_detected": raw.get("tumor_detected"),
                    "tumor_volume_cm3": raw.get("tumor_volume_cm3"),
                    "tumor_volume_mm3": raw.get("tumor_volume_mm3"),
                    "tumor_location": raw.get("tumor_location"),
                    "severity": raw.get("severity"),
                    "model_name": raw.get("model_name"),
                    "scan_date": raw.get("scan_date"),
                    "overlay_image": raw.get("overlay_image"),
                    "reference_mri_png": raw.get("reference_mri_png"),
                }
        except json.JSONDecodeError:
            segmentation_meta = None
    preview_url = _scan_preview_url(scan, segmentation_meta)
    return {
        "id": report.id if report else f"D-{diagnosis.id}",
        "diagnosis_id": diagnosis.id,
        "scan_id": scan.id,
        "patient": {
            "name": getattr(patient, "name", None) or getattr(patient, "email", "patient"),
            "email": getattr(patient, "email", None),
            "age": getattr(patient, "age", None),
            "patientId": scan.patient_id,
        },
        "doctor": {
            "id": doctor.id,
            "name": doctor.name,
            "email": doctor.email,
            "phone": doctor.phone,
        } if doctor else None,
        "date": diagnosis.scan.upload_date.isoformat() if diagnosis.scan and diagnosis.scan.upload_date else datetime.utcnow().isoformat(),
        "imageUrl": preview_url,
        "fileName": filename,
        "prediction": diagnosis.prediction,
        "label": diagnosis.prediction,
        "confidence": diagnosis.confidence,
        "explanation": report.summary if report else "Automated analysis summary",
        "suggestedNextSteps": (report.recommendation.split("\n") if report and report.recommendation else []),
        "reportDownloadUrl": report_download_url,
        "segmentation": segmentation_meta,
        "related": [],
    }


def _view_alzheimer_model_result(scan: MRIScan) -> dict:
    """Inference on a stored Alzheimer image scan (separate from tumor BraTS pipeline)."""
    path = (scan.file_path or "").strip()
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="Alzheimer scan image missing on server")
    try:
        out = predict_alzheimer_from_image_path(path)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Alzheimer inference failed: {e}") from e

    img_url = _uploads_url_from_abs_path(path)
    preview_at = datetime.utcnow().isoformat() + "Z"
    return {
        "scan_id": scan.id,
        "prediction": out["prediction"],
        "confidence": float(out["confidence"]),
        "model_version": out.get("model_version"),
        "probs": out.get("probs"),
        "tumor_volume": None,
        "tumor_volume_mm3": None,
        "output_image_url": img_url,
        "preview_run_at": preview_at,
        "source": "stored_scan_alzheimer",
        "scan_kind": "alzheimer",
    }


def _generate_alzheimer_report_pdf(
    body: GenerateReportBody,
    scan: MRIScan,
    patient: User,
    db: Session,
    current,
) -> JSONResponse:
    path = (scan.file_path or "").strip()
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=400, detail="Alzheimer scan image missing on server")
    try:
        out = predict_alzheimer_from_image_path(path)
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Alzheimer inference failed: {e}") from e

    display_name = (body.patient_name or patient.name or patient.email or f"Patient {patient.id}").strip()
    display_age = body.age if body.age is not None else patient.age
    age_str = str(display_age) if display_age is not None else "Not provided"
    gender_str = (body.gender or "Not provided").strip()
    scan_date = scan.upload_date.isoformat() if scan.upload_date else datetime.utcnow().isoformat()
    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    run_generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")

    prediction = out["prediction"]
    conf_pct = float(out["confidence"])
    conf_display = f"{conf_pct:.2f}" if math.isfinite(conf_pct) else "N/A"
    probs = out.get("probs") or {}
    probs_paragraph = "; ".join(f"{k}: {v}%" for k, v in probs.items()) if probs else "N/A"
    num_classes = int(out.get("num_classes") or 0)
    model_name = str(out.get("model_version") or "Alzheimer classifier")

    findings_paragraph = (
        f"The classifier's top prediction is {prediction} with estimated confidence {conf_display}% "
        f"across {num_classes} output classes. This is an AI screening aid only."
    )
    disclaimer_text = "AI-generated report. Not a substitute for professional diagnosis."

    input_data_uri = _image_file_data_uri(path)
    template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "templates"))
    pdf_name = f"alz_{body.patient_id}_{ts}.pdf"
    pdf_path = os.path.join(REPORTS_DIR, pdf_name)

    jinja_ctx = {
        "generated_at": run_generated_at,
        "report_db_id": "pending",
        "patient_name": display_name,
        "patient_id": str(body.patient_id),
        "age": age_str,
        "gender": gender_str,
        "scan_date": scan_date,
        "model_name": model_name,
        "prediction_label": prediction,
        "confidence_score": conf_display,
        "num_classes": str(num_classes),
        "probs_paragraph": probs_paragraph,
        "findings_paragraph": findings_paragraph,
        "input_image_data_uri": input_data_uri,
        "disclaimer_text": disclaimer_text,
    }

    meta_obj = {
        "report_type": "alzheimer_pdf",
        "prediction": prediction,
        "confidence": conf_pct,
        "probs": probs,
        "model_name": model_name,
        "generated_at_utc": run_generated_at,
        "input_image": _uploads_url_from_abs_path(path),
    }
    meta_json = json.dumps(meta_obj)

    summary_lines = [
        f"Prediction: {prediction}",
        f"Confidence (top class): {conf_display}%",
        f"Model: {model_name}",
        f"Classes: {num_classes}",
        f"Report run (UTC): {run_generated_at}",
    ]
    summary_text = "\n".join(summary_lines)
    recommendation_text = (
        "AI-assisted screening only. Clinical correlation and standard diagnostics are required.\n" + disclaimer_text
    )

    diagnosis = Diagnosis(
        scan_id=scan.id,
        disease_type=DiseaseType.alzheimer,
        prediction=prediction,
        confidence=conf_pct if math.isfinite(conf_pct) else None,
        model_version=model_name[:250],
        model_meta=meta_json,
        result_payload=meta_json,
        result_image_path=_uploads_url_from_abs_path(path),
        analyzed_at=datetime.utcnow(),
    )
    db.add(diagnosis)
    db.commit()
    db.refresh(diagnosis)

    report = Report(
        diagnosis_id=diagnosis.id,
        patient_id=body.patient_id,
        doctor_id=current.id,
        summary=summary_text,
        recommendation=recommendation_text,
        pdf_path=None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    jinja_ctx["report_db_id"] = str(report.id)

    try:
        render_segmentation_report_pdf(
            jinja_ctx,
            template_dir=template_dir,
            template_name="alzheimer_report.html",
            output_path=pdf_path,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF rendering failed: {e}") from e

    report.pdf_path = pdf_path
    report.file_path = pdf_path
    db.add(report)
    scan.status = ScanStatus.analyzed
    db.add(scan)
    db.commit()
    db.refresh(report)

    payload = _serialize_analysis(diagnosis, report, scan)
    _publish({"type": "analysis.created", "analysis": payload})

    return JSONResponse(
        status_code=200,
        content={
            "report_id": report.id,
            "diagnosis_id": diagnosis.id,
            "message": "Report generated successfully",
            "prediction": prediction,
            "confidence_pct": conf_pct,
            "confidence_display": conf_display,
            "generated_at_utc": run_generated_at,
            "scan_kind": "alzheimer",
        },
    )


@router.post("/view-result")
def view_model_result(
    payload: dict,
    db: Session = Depends(get_db),
    current=Depends(role_required("doctor", "admin")),
):
    """Run BraTS segmentation on the **stored patient scan** using the same stack as ``POST /predict``."""
    scan_id = payload.get("scan_id")
    if not scan_id:
        raise HTTPException(status_code=400, detail="scan_id required")

    scan = _fetch_accessible_scan(scan_id, db, current)
    sk = (getattr(scan, "scan_kind", None) or "mri").lower()
    if sk == "alzheimer":
        return _view_alzheimer_model_result(scan)

    scan_root = _scan_modality_folder(scan)

    try:
        file_map = _build_file_map(scan_root)
        _validate_file_map(file_map)
        vis_image = load_mri_images(file_map)
        image_prep = preprocess(np.ascontiguousarray(vis_image))
        model, device, _ = get_brats_bundle_predictor()
        seg, conf_pct = predict_segmentation_with_confidence(model, image_prep, device)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Stored-scan inference failed: {e}") from e

    vol_shape = tuple(int(x) for x in np.asarray(seg).shape)
    try:
        voxel_mm3 = voxel_volume_mm3_from_scan_folder(scan_root)
        metrics = compute_tumor_metrics(seg, vol_shape, voxel_mm3)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not compute tumor metrics: {e}") from e

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    preview_name = f"preview_{scan.id}_{ts}.png"
    out_path = os.path.join(RESULTS_DIR, preview_name)
    try:
        save_overlay(vis_image, seg, out_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save overlay PNG: {e}") from e

    with open(out_path, "rb") as f:
        png_b64 = base64.standard_b64encode(f.read()).decode("ascii")

    seg_np = np.asarray(seg)
    unique_vals, unique_counts = np.unique(seg_np, return_counts=True)
    label_counts = {str(int(v)): int(c) for v, c in zip(unique_vals, unique_counts)}
    tumor_flag = bool(metrics["tumor_detected"])
    prediction = "Tumor Detected" if tumor_flag else "No Tumor Detected"
    vol_mm3 = float(metrics["tumor_volume_mm3"])
    vol_cm3 = float(metrics["tumor_volume_cm3"])
    tvox = int(metrics.get("tumor_positive_voxels") or 0)
    preview_at = datetime.utcnow().isoformat() + "Z"

    return {
        "scan_id": scan.id,
        "prediction": prediction,
        "confidence": conf_pct if math.isfinite(conf_pct) else None,
        "model_version": "MONAI BraTS SegResNet (same pipeline as POST /predict)",
        "probs": label_counts,
        "has_colored_region": tumor_flag,
        "tumor_volume_mm3": round(vol_mm3, 2),
        "tumor_volume_cm3": round(vol_cm3, 4),
        "tumor_positive_voxels": tvox,
        "tumor_volume": f"{vol_mm3:.2f} mm³ (spacing-calibrated)",
        "visualization_png_base64": png_b64,
        "mask_image_path": out_path,
        "mask_image_base64": png_b64,
        "output_image_url": f"/uploads/results/{preview_name}",
        "preview_run_at": preview_at,
        "source": "stored_scan",
    }


@api_router.post("/analyze/{scan_id}")
def analyze_scan_with_segmentation(
    scan_id: int,
    db: Session = Depends(get_db),
    current=Depends(role_required("doctor", "admin")),
):
    """
    End-to-end analyze flow:
      1) load scan folder
      2) load 4 modalities
      3) apply preprocessing
      4) run sliding-window inference
      5) generate tumor mask image
      6) save and return result
    """
    scan = _fetch_accessible_scan(scan_id, db, current)
    scan_root = _scan_modality_folder(scan)

    try:
        file_map = _build_file_map(scan_root)
        _validate_file_map(file_map)
        vis_image = load_mri_images(file_map)
        image_prep = preprocess(np.ascontiguousarray(vis_image))
        model, device, _ = get_brats_bundle_predictor()
        seg, conf_pct = predict_segmentation_with_confidence(model, image_prep, device)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Segmentation inference failed: {e}") from e

    mask_name = f"{scan.id}_mask.png"
    out_path = os.path.join(RESULTS_DIR, mask_name)
    try:
        save_overlay(vis_image, seg, out_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not save overlay PNG: {e}") from e

    with open(out_path, "rb") as f:
        mask_b64 = base64.standard_b64encode(f.read()).decode("ascii")

    prediction = "Tumor Detected" if bool(np.any(np.asarray(seg) > 0)) else "No Tumor Detected"
    return {
        "status": "success",
        "prediction": prediction,
        "confidence": round(float(conf_pct) / 100.0, 4),
        "mask_image": mask_b64,
        "download_url": f"/uploads/results/{mask_name}",
    }


@router.post("/run")
def run_analysis(payload: dict, db: Session = Depends(get_db), current = Depends(role_required("doctor", "admin"))):
    """Run neural network analysis for a previously uploaded scan and persist diagnosis + report.
    Body: { "scan_id": int }
    Doctor only.
    """
    scan_id = payload.get("scan_id")
    if not scan_id:
        raise HTTPException(status_code=400, detail="scan_id required")

    scan = db.query(MRIScan).filter(MRIScan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    
    if scan.doctor_id != current.id and (current.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized: You are not assigned to this scan")

    try:
        result = analyze_image(scan.file_path)
    except InferenceError as e:
        raise _inference_http_exception(e) from e
    disease_type = (
        DiseaseType.alzheimer if result.get("disease_type") == "alzheimer" else DiseaseType.tumor
    )
    meta_json = probs_to_json(result.get("probs"))

    diagnosis = _latest_diagnosis_for_scan(db, scan.id)
    if diagnosis:
        diagnosis.disease_type = disease_type
        diagnosis.prediction = result["label"]
        diagnosis.confidence = result["confidence"]
        diagnosis.model_version = (result.get("model_version") or "unknown")[:250]
        diagnosis.model_meta = meta_json
        diagnosis.result_payload = meta_json
        diagnosis.analyzed_at = datetime.utcnow()
        db.add(diagnosis)
        db.commit()
        db.refresh(diagnosis)
    else:
        diagnosis = Diagnosis(
            scan_id=scan.id,
            disease_type=disease_type,
            prediction=result["label"],
            confidence=result["confidence"],
            model_version=(result.get("model_version") or "unknown")[:250],
            model_meta=meta_json,
            result_payload=meta_json,
            analyzed_at=datetime.utcnow(),
        )
        db.add(diagnosis)
        db.commit()
        db.refresh(diagnosis)

    summary = f"Prediction: {result['label']}\nConfidence: {result['confidence']}%\nModel: {result.get('model_version', 'n/a')}"
    if result.get("probs"):
        summary += "\n" + "\n".join(f"{k}: {v}%" for k, v in result["probs"].items())
    recommendation = "Physician review required."

    report = db.query(Report).filter(Report.diagnosis_id == diagnosis.id).first()
    if report:
        report.summary = summary
        report.recommendation = recommendation
        report.patient_id = scan.patient_id
        report.doctor_id = scan.doctor_id
    else:
        report = Report(
            diagnosis_id=diagnosis.id,
            patient_id=scan.patient_id,
            doctor_id=scan.doctor_id,
            summary=summary,
            recommendation=recommendation,
            pdf_path=None,
        )
        db.add(report)
        db.commit()
        db.refresh(report)

    report.pdf_path = _write_report_file(scan, diagnosis, report)
    report.file_path = report.pdf_path
    db.add(report)
    db.commit()
    db.refresh(report)
    
    # Update scan status to analyzed
    scan.status = ScanStatus.analyzed
    db.commit()

    # Prepare event payload
    payload = _serialize_analysis(diagnosis, report, scan)
    _publish({"type": "analysis.created", "analysis": payload})

    return {"status": "ok", "analysis": payload}


@router.get("/recent")
def recent_analyses(limit: int = 6, db: Session = Depends(get_db)):
    # Join diagnoses -> scans -> report (latest diagnoses first)
    q = db.query(Diagnosis).order_by(Diagnosis.id.desc()).limit(limit).all()
    out = []
    for d in q:
        scan = db.query(MRIScan).filter(MRIScan.id == d.scan_id).first()
        report = db.query(Report).filter(Report.diagnosis_id == d.id).first()
        out.append(_serialize_analysis(d, report, scan))
    return out


@router.get("/stream")
def stream_analyses():
    async def event_stream():
        q: asyncio.Queue = asyncio.Queue()
        _subscribers.append(q)
        try:
            while True:
                evt = await q.get()
                yield f"data: {json.dumps(evt)}\n\n"
        finally:
            try:
                _subscribers.remove(q)
            except ValueError:
                pass

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.post("/send-report/{scan_id}")
def send_report(
    scan_id: int,
    db: Session = Depends(get_db),
    current = Depends(role_required("doctor", "admin"))
):
    """Doctor sends the generated report back to the patient."""
    scan = db.query(MRIScan).filter(MRIScan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    if scan.doctor_id != current.id and (current.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized: You are not assigned to this scan")

    diagnosis = _latest_diagnosis_for_scan(db, scan.id)
    if not diagnosis:
        raise HTTPException(status_code=404, detail="No analysis found for this scan")

    report = db.query(Report).filter(Report.diagnosis_id == diagnosis.id).first()
    if not report:
        raise HTTPException(status_code=404, detail="No report found for this analysis")

    if not report.pdf_path:
        report.pdf_path = _write_report_file(scan, diagnosis, report)
        report.file_path = report.pdf_path
        db.add(report)

    # Update scan status to reported
    scan.status = ScanStatus.reported
    if not scan.sent_date:
        scan.sent_date = datetime.utcnow()
    report.delivered_at = datetime.utcnow()
    db.add(report)
    db.add(scan)
    db.commit()

    return {
        "message": "Report sent to patient",
        "scan_id": scan.id,
        "status": scan.status.value if hasattr(scan.status, "value") else scan.status,
        "report_id": report.id,
        "download_url": f"/reports/{report.id}" if (report.pdf_path or report.file_path) else None,
    }


@router.get("/patient-reports")
def get_patient_reports(
    db: Session = Depends(get_db),
    current = Depends(role_required("patient"))
):
    """Get all reports sent to the current patient."""
    scans_with_reports = (
        db.query(MRIScan)
        .filter(
            MRIScan.patient_id == current.id,
            MRIScan.status == ScanStatus.reported
        )
        .order_by(MRIScan.sent_date.desc(), MRIScan.id.desc())
        .all()
    )

    reports_data = []
    for scan in scans_with_reports:
        diagnosis = _latest_diagnosis_for_scan(db, scan.id)
        if not diagnosis:
            continue

        report = db.query(Report).filter(Report.diagnosis_id == diagnosis.id).first()
        if not report:
            continue

        file_name = os.path.basename(scan.file_path or "")
        reports_data.append({
            "report_id": report.id,
            "scan_id": scan.id,
            "doctor_id": scan.doctor_id,
            "doctor": {
                "id": scan.doctor.id,
                "name": scan.doctor.name,
                "email": scan.doctor.email,
                "phone": scan.doctor.phone,
            } if scan.doctor else None,
            "sent_date": scan.sent_date.isoformat() if scan.sent_date else None,
            "prediction": diagnosis.prediction,
            "confidence": diagnosis.confidence,
            "summary": report.summary,
            "recommendation": report.recommendation,
            "file_name": file_name,
            "file_url": f"/uploads/{file_name}" if file_name else None,
            "download_url": f"/reports/{report.id}" if report and (report.pdf_path or report.file_path) else None,
        })

    return reports_data


@router.get("/{report_id}")
def get_analysis(report_id: int, db: Session = Depends(get_db), current = Depends(get_current_user)):
    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    diagnosis = db.query(Diagnosis).filter(Diagnosis.id == report.diagnosis_id).first()
    scan = db.query(MRIScan).filter(MRIScan.id == diagnosis.scan_id).first()
    r = (current.role or "").lower()
    if r == "patient" and scan.patient_id != current.id:
        raise HTTPException(status_code=403, detail="Unauthorized")
    if r == "doctor" and scan.doctor_id != current.id:
        raise HTTPException(status_code=403, detail="Unauthorized")
    return _serialize_analysis(diagnosis, report, scan)


@core_router.post("/generate-report")
def generate_segmentation_report_pdf_endpoint(
    body: GenerateReportBody,
    db: Session = Depends(get_db),
    current=Depends(role_required("doctor", "admin")),
):
    """
    Segment the stored scan with the same clinic pipeline as ``POST /api/analyses/view-result``
    (same BraTS pipeline as ``POST /predict``: ``load_mri_images`` + ``preprocess`` + bundle SegResNet), then render the PDF.
    """
    scan = _fetch_accessible_scan(body.scan_id, db, current)
    if scan.patient_id != body.patient_id:
        raise HTTPException(status_code=400, detail="patient_id does not match this scan")

    patient = db.query(User).filter(User.id == body.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    sk = (getattr(scan, "scan_kind", None) or "mri").lower()
    if sk == "alzheimer":
        return _generate_alzheimer_report_pdf(body, scan, patient, db, current)

    display_name = (body.patient_name or patient.name or patient.email or f"Patient {patient.id}").strip()
    display_age = body.age if body.age is not None else patient.age
    age_str = str(display_age) if display_age is not None else "Not provided"
    gender_str = (body.gender or "Not provided").strip()

    scan_root = _scan_modality_folder(scan)
    try:
        file_map = _build_file_map(scan_root)
        _validate_file_map(file_map)
        vis_image = load_mri_images(file_map)
        image_prep = preprocess(np.ascontiguousarray(vis_image))
        model, device, _ = get_brats_bundle_predictor()
        seg, conf_pct = predict_segmentation_with_confidence(model, image_prep, device)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Segmentation inference failed: {e}") from e

    confidence_display = f"{conf_pct:.2f}" if math.isfinite(conf_pct) else "N/A"
    conf_for_db = conf_pct if math.isfinite(conf_pct) else None
    vol_shape = tuple(int(x) for x in np.asarray(seg).shape)
    try:
        voxel_mm3 = voxel_volume_mm3_from_scan_folder(scan_root)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not read voxel spacing: {e}") from e

    try:
        metrics = compute_tumor_metrics(seg, vol_shape, voxel_mm3)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not compute tumor metrics: {e}") from e

    ts = datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    overlay_name = f"report_{scan.id}_{ts}_overlay.png"
    mri_name = f"report_{scan.id}_{ts}_mri.png"
    overlay_path = os.path.join(RESULTS_DIR, overlay_name)
    mri_path = os.path.join(RESULTS_DIR, mri_name)
    try:
        save_overlay(vis_image, seg, overlay_path)
        slice_idx = best_axial_slice_index(np.asarray(seg))
        save_mri_axial_slice_png(vis_image, slice_idx, mri_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not export report images: {e}") from e

    model_name = "MONAI BraTS SegResNet (same pipeline as POST /predict)"
    tumor_flag = bool(metrics["tumor_detected"])
    vol_cm3 = float(metrics["tumor_volume_cm3"])
    vol_mm3 = float(metrics["tumor_volume_mm3"])
    tumor_voxels = int(metrics.get("tumor_positive_voxels") or 0)
    location = str(metrics["tumor_location"])
    severity = str(metrics["severity"])
    label_hist = json.dumps(metrics.get("label_voxel_counts") or {}, sort_keys=True)

    if tumor_flag:
        findings_paragraph = (
            f"A tumor-associated signal abnormality is detected in the {location} with an estimated volume of "
            f"{vol_cm3:.2f} cm³. The lesion is categorized as {severity.lower()}-sized under the automated volume policy."
        )
        analysis_paragraph = (
            "The quantitative summary reflects voxel-wise label assignments produced by the segmentation model "
            f"(mean class confidence {confidence_display}%). Histogram entries count voxels per discrete label id in the "
            "model output space."
        )
        conclusion_paragraph = (
            f"The automated read is positive for tumor-associated voxels with {severity.lower()} estimated burden. "
            "Correlation with clinical findings and standard-of-care imaging is recommended."
        )
    else:
        findings_paragraph = (
            "No contiguous tumor-associated cluster was segmented above background on this volume with the current "
            f"model thresholding (estimated volume {vol_cm3:.2f} cm³)."
        )
        analysis_paragraph = (
            f"The model did not assign positive tumor labels to a clinically meaningful region (mean class confidence "
            f"{confidence_display}%). Histogram entries summarize the full label distribution, including background."
        )
        conclusion_paragraph = (
            "The automated read did not identify a positive tumor segmentation burden on this scan. "
            "Clinical correlation remains indicated if suspicion persists."
        )

    disclaimer_text = "AI-generated report. Not a substitute for professional diagnosis."

    template_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "templates"))
    pdf_name = f"{body.patient_id}_{ts}.pdf"
    pdf_path = os.path.join(REPORTS_DIR, pdf_name)

    scan_date = scan.upload_date.isoformat() if scan.upload_date else datetime.utcnow().isoformat()
    scan_folder_label = os.path.basename((scan.file_path or "").rstrip(os.sep)) or str(scan.id)

    run_generated_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M UTC")
    prediction = "Tumor Detected" if tumor_flag else "No Tumor Detected"
    jinja_ctx = {
        "generated_at": run_generated_at,
        "report_db_id": "pending",
        "patient_name": display_name,
        "patient_id": str(body.patient_id),
        "age": age_str,
        "gender": gender_str,
        "scan_date": scan_date,
        "model_name": model_name,
        "scan_folder_label": scan_folder_label,
        "prediction_label": prediction,
        "tumor_positive_voxels": str(tumor_voxels),
        "findings_paragraph": findings_paragraph,
        "tumor_volume_cm3": f"{vol_cm3:.2f}",
        "tumor_volume_mm3": f"{vol_mm3:.2f}",
        "tumor_location": location,
        "severity": severity,
        "confidence_score": confidence_display,
        "analysis_paragraph": analysis_paragraph,
        "label_histogram": label_hist,
        "mri_image_data_uri": _png_file_data_uri(mri_path),
        "overlay_image_data_uri": _png_file_data_uri(overlay_path),
        "conclusion_paragraph": conclusion_paragraph,
        "disclaimer_text": disclaimer_text,
    }

    meta_obj = {
        "report_type": "segmentation_pdf",
        "prediction": prediction,
        "tumor_detected": tumor_flag,
        "tumor_positive_voxels": tumor_voxels,
        "tumor_volume_cm3": round(vol_cm3, 4),
        "tumor_volume_mm3": round(vol_mm3, 4),
        "tumor_location": location,
        "severity": severity,
        "confidence_score": conf_for_db,
        "confidence_display": confidence_display,
        "model_name": model_name,
        "scan_date": scan_date,
        "generated_at_utc": run_generated_at,
        "label_voxel_counts": metrics.get("label_voxel_counts") or {},
        "overlay_image": f"/uploads/results/{overlay_name}",
        "reference_mri_png": f"/uploads/results/{mri_name}",
    }
    meta_json = json.dumps(meta_obj)

    summary_lines = [
        f"Prediction: {prediction}",
        f"Positive tumor voxels (segmentation mask): {tumor_voxels}",
        f"Estimated tumor volume: {vol_cm3:.2f} cm³ ({vol_mm3:.2f} mm³)",
        f"Model-indicated location: {location}",
        f"Severity (volume rules): {severity}",
        f"Mean class confidence: {confidence_display}%",
        f"AI model: {model_name}",
        f"Report run (UTC): {run_generated_at}",
    ]
    summary_text = "\n".join(summary_lines)
    recommendation_text = (
        "AI-assisted segmentation only. Correlate with clinical examination, institutional protocols, and "
        "standard-of-care imaging.\n"
        + disclaimer_text
    )

    diagnosis = Diagnosis(
        scan_id=scan.id,
        disease_type=DiseaseType.tumor,
        prediction=prediction,
        confidence=conf_for_db,
        model_version=model_name[:250],
        model_meta=meta_json,
        result_payload=meta_json,
        result_image_path=f"/uploads/results/{overlay_name}",
        analyzed_at=datetime.utcnow(),
    )
    db.add(diagnosis)
    db.commit()
    db.refresh(diagnosis)

    report = Report(
        diagnosis_id=diagnosis.id,
        patient_id=body.patient_id,
        doctor_id=current.id,
        summary=summary_text,
        recommendation=recommendation_text,
        pdf_path=None,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    jinja_ctx["report_db_id"] = str(report.id)

    try:
        render_segmentation_report_pdf(
            jinja_ctx,
            template_dir=template_dir,
            template_name="segmentation_report.html",
            output_path=pdf_path,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"PDF rendering failed: {e}") from e

    report.pdf_path = pdf_path
    report.file_path = pdf_path
    db.add(report)
    scan.status = ScanStatus.analyzed
    db.add(scan)
    db.commit()
    db.refresh(report)

    payload = _serialize_analysis(diagnosis, report, scan)
    _publish({"type": "analysis.created", "analysis": payload})

    return JSONResponse(
        status_code=200,
        content={
            "report_id": report.id,
            "diagnosis_id": diagnosis.id,
            "message": "Report generated successfully",
            "prediction": prediction,
            "confidence_pct": conf_for_db,
            "confidence_display": confidence_display,
            "tumor_volume_mm3": round(vol_mm3, 2),
            "tumor_volume_cm3": round(vol_cm3, 4),
            "tumor_positive_voxels": tumor_voxels,
            "generated_at_utc": run_generated_at,
        },
    )


@core_router.post("/send-report")
def send_report_to_patient(
    body: SendReportBody,
    db: Session = Depends(get_db),
    current=Depends(role_required("doctor", "admin")),
):
    """Link a finalized PDF report to the patient's dashboard by marking the scan as reported."""
    report = db.query(Report).filter(Report.id == body.report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")

    diagnosis = db.query(Diagnosis).filter(Diagnosis.id == report.diagnosis_id).first()
    if not diagnosis:
        raise HTTPException(status_code=404, detail="Diagnosis not found for this report")

    scan = db.query(MRIScan).filter(MRIScan.id == diagnosis.scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    if scan.patient_id != body.patient_id:
        raise HTTPException(status_code=400, detail="patient_id does not match the scan tied to this report")

    if scan.doctor_id != current.id and (current.role or "").lower() != "admin":
        raise HTTPException(status_code=403, detail="Unauthorized: You are not assigned to this scan")

    disk_path = report.file_path or report.pdf_path
    if not disk_path or not os.path.isfile(disk_path):
        raise HTTPException(status_code=400, detail="Report PDF is not available on disk")

    report.patient_id = body.patient_id
    report.doctor_id = current.id
    report.delivered_at = datetime.utcnow()
    db.add(report)

    scan.status = ScanStatus.reported
    if not scan.sent_date:
        scan.sent_date = datetime.utcnow()
    db.add(scan)
    db.commit()

    return {
        "message": "Report linked to patient dashboard",
        "report_id": report.id,
        "scan_id": scan.id,
        "patient_id": body.patient_id,
        "file_url": f"/reports/{report.id}",
    }
