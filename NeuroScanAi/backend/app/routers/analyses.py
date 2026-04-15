import asyncio
import base64
import json
import os
from datetime import datetime
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database.db import SessionLocal
from app.models.medical import MRIScan, Diagnosis, Report, ScanStatus, DiseaseType
from app.inference import analyze_image
from app.ml.inference_engine import (
    InferenceError,
    get_inference_status,
    probs_to_json,
    get_loaded_model_or_error,
    get_loaded_segmentation_model_or_error,
    get_torch_device,
)
from app.ml.monai_preprocess import load_and_preprocess_modalities
from app.ml.tumor_visualization import create_segmentation_overlay
from app.security.jwt import role_required, get_current_user

router = APIRouter(prefix="/api/analyses", tags=["Analyses"])
api_router = APIRouter(prefix="/api", tags=["Analyses"])

# Simple in-memory broadcaster for SSE (sufficient for single-process dev)
_subscribers: list[asyncio.Queue] = []
REPORTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "reports"))
os.makedirs(REPORTS_DIR, exist_ok=True)
RESULTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "results"))
os.makedirs(RESULTS_DIR, exist_ok=True)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


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


def _run_brats_segmentation(image, model):
    """
    Run sliding-window segmentation with shape-safe padding and return:
      seg_mask (torch.Tensor[D,H,W]), confidence (float in [0, 1])
    """
    import torch
    import torch.nn.functional as F
    from monai.inferers import sliding_window_inference

    def _brats_segmentation_to_label(mask: torch.Tensor) -> torch.Tensor:
        if mask.ndim != 4 or mask.shape[0] != 3:
            raise ValueError("Expected 3-channel BRATS segmentation output.")
        out = torch.zeros(mask.shape[1:], dtype=torch.uint8, device=mask.device)
        ch0 = mask[0]
        ch1 = mask[1]
        ch2 = mask[2]
        out[ch2] = 4
        out[ch0 & ~ch2] = 1
        out[ch1 & ~ch0 & ~ch2] = 2
        return out

    device = get_torch_device()
    x = image.unsqueeze(0).float().to(device)  # (1, 4, D, H, W)
    orig_shape = tuple(int(s) for s in x.shape[-3:])

    # SegResNet uses multiple down/up sampling stages; pad to multiples of 16.
    target_shape = tuple(((s + 15) // 16) * 16 for s in orig_shape)
    pad_d = target_shape[0] - orig_shape[0]
    pad_h = target_shape[1] - orig_shape[1]
    pad_w = target_shape[2] - orig_shape[2]
    if pad_d or pad_h or pad_w:
        x = F.pad(x, (0, pad_w, 0, pad_h, 0, pad_d))

    spatial = tuple(int(s) for s in x.shape[-3:])
    default_roi = (240, 240, 160)
    roi_size = tuple(min(s, r) for s, r in zip(spatial, default_roi))

    with torch.no_grad():
        logits = sliding_window_inference(
            inputs=x,
            roi_size=roi_size,
            sw_batch_size=1,
            predictor=model,
            overlap=0.5,
        )
        if logits.ndim != 5:
            raise ValueError(f"Expected 5D model output for segmentation, got shape {tuple(logits.shape)}")
        if logits.shape[1] == 3:
            probs = torch.sigmoid(logits)
            seg_mask = _brats_segmentation_to_label(probs.squeeze(0) > 0.5)
        else:
            probs = torch.softmax(logits, dim=1)
            seg_mask = torch.argmax(probs, dim=1).squeeze(0)
        confidence = float(probs.max(dim=1).values.mean().item())

    # Crop back to original unpadded shape.
    seg_mask = seg_mask[: orig_shape[0], : orig_shape[1], : orig_shape[2]]
    return seg_mask, confidence


@router.get("/model-status")
def model_status(current=Depends(role_required("doctor", "admin"))):
    """Report whether PyTorch and weights are available (no inference on a volume)."""
    return get_inference_status()


def _serialize_analysis(diagnosis: Diagnosis, report: Report | None, scan: MRIScan) -> dict:
    filename = os.path.basename(scan.file_path or "")
    doctor = getattr(scan, "doctor", None)
    patient = getattr(scan, "patient", None)
    report_download_url = None
    if report and report.pdf_path:
        report_download_url = f"/uploads/reports/{os.path.basename(report.pdf_path)}"
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
        "imageUrl": f"/uploads/{filename}",
        "fileName": filename,
        "prediction": diagnosis.prediction,
        "label": diagnosis.prediction,
        "confidence": diagnosis.confidence,
        "explanation": report.summary if report else "Automated analysis summary",
        "suggestedNextSteps": (report.recommendation.split("\n") if report and report.recommendation else []),
        "reportDownloadUrl": report_download_url,
        "related": [],
    }


@router.post("/view-result")
def view_model_result(
    payload: dict,
    db: Session = Depends(get_db),
    current=Depends(role_required("doctor", "admin")),
):
    """Run BraTS segmentation model and return overlay visualization."""
    scan_id = payload.get("scan_id")
    if not scan_id:
        raise HTTPException(status_code=400, detail="scan_id required")

    scan = _fetch_accessible_scan(scan_id, db, current)

    try:
        image = load_and_preprocess_modalities(scan.file_path)  # (4, H, W, D)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not load/preprocess scan modalities: {e}") from e

    try:
        import torch
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Inference dependencies missing: {e}") from e

    device = get_torch_device()
    try:
        model = get_loaded_segmentation_model_or_error().to(device)
    except InferenceError as e:
        raise _inference_http_exception(e) from e

    try:
        seg_mask, confidence = _run_brats_segmentation(image, model)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sliding-window inference failed: {e}") from e

    try:
        mask_out = create_segmentation_overlay(
            scan_id=scan.id,
            file_path=scan.file_path,
            segmentation_output=seg_mask.detach().cpu(),
            output_root=RESULTS_DIR,
            output_filename="result.png",
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not generate/save tumor mask image: {e}") from e

    seg_np = seg_mask.detach().cpu().numpy()
    unique_vals, unique_counts = np.unique(seg_np, return_counts=True)
    label_counts = {str(int(v)): int(c) for v, c in zip(unique_vals, unique_counts)}
    has_region = bool((seg_np > 0).any())
    prediction = "Tumor Detected" if has_region else "No Tumor Detected"

    return {
        "scan_id": scan.id,
        "prediction": prediction,
        "confidence": round(confidence * 100.0, 2),
        "model_version": "MONAI BraTS SegResNet",
        "probs": label_counts,
        "has_colored_region": has_region,
        "visualization_png_base64": mask_out["image_base64"],
        "mask_image_path": mask_out["image_path"],
        "mask_image_base64": mask_out["image_base64"],
        "output_image_url": "/uploads/results/result.png",
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

    try:
        image = load_and_preprocess_modalities(scan.file_path)  # (4, H, W, D)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not load/preprocess scan modalities: {e}") from e

    try:
        import torch
        from monai.inferers import sliding_window_inference
    except ImportError as e:
        raise HTTPException(status_code=503, detail=f"Inference dependencies missing: {e}") from e

    device = get_torch_device()
    try:
        model = get_loaded_segmentation_model_or_error().to(device)
    except InferenceError as e:
        raise _inference_http_exception(e) from e
    try:
        seg_mask, confidence = _run_brats_segmentation(image, model)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Sliding-window inference failed: {e}") from e

    try:
        mask_out = create_segmentation_overlay(
            scan_id=scan.id,
            file_path=scan.file_path,
            segmentation_output=seg_mask.detach().cpu(),
            output_root=RESULTS_DIR,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Could not generate/save tumor mask image: {e}") from e

    prediction = "Tumor Detected" if bool((seg_mask > 0).any().item()) else "No Tumor Detected"
    return {
        "status": "success",
        "prediction": prediction,
        "confidence": round(confidence, 4),
        "mask_image": mask_out["image_base64"],
        "download_url": f"/uploads/results/{scan.id}_mask.png",
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
    else:
        report = Report(diagnosis_id=diagnosis.id, summary=summary, recommendation=recommendation, pdf_path=None)
        db.add(report)
        db.commit()
        db.refresh(report)

    report.pdf_path = _write_report_file(scan, diagnosis, report)
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
        db.add(report)

    # Update scan status to reported
    scan.status = ScanStatus.reported
    if not scan.sent_date:
        scan.sent_date = datetime.utcnow()
    db.add(scan)
    db.commit()

    return {
        "message": "Report sent to patient",
        "scan_id": scan.id,
        "status": scan.status.value if hasattr(scan.status, "value") else scan.status,
        "report_id": report.id,
        "download_url": f"/uploads/reports/{os.path.basename(report.pdf_path)}" if report.pdf_path else None,
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
            "download_url": f"/uploads/reports/{os.path.basename(report.pdf_path)}" if report.pdf_path else None,
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
