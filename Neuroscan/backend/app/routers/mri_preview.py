"""Authenticated PNG previews of MRI volumes (axial slices) for doctors and patients."""

from __future__ import annotations

import io
import os
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, Response
from sqlalchemy.orm import Session

from app.database.db import SessionLocal
from app.models.medical import MRIScan
from app.models.user import User
from app.security.jwt import get_current_user
from app.ml.volume_io import collect_files_for_scan_download, get_preview_png, load_volume_and_shape

router = APIRouter(prefix="/mri", tags=["MRI"])
DATA_SCANS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "scans")
)
LEGACY_SCANS_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "uploads", "scans")
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _can_access_scan(scan: MRIScan, user: User) -> bool:
    role = (user.role or "").lower()
    if role in ("admin", "superadmin"):
        return True
    if role == "patient" and scan.patient_id == user.id:
        return True
    if role == "doctor" and scan.doctor_id == user.id:
        return True
    return False


def _resolve_scan_disk_path(scan: MRIScan) -> str:
    raw = (scan.file_path or "").strip()
    if raw and (os.path.isfile(raw) or os.path.isdir(raw)):
        return raw

    kind = "alzheimer" if (getattr(scan, "scan_kind", "") or "").lower() == "alzheimer" else "tumor"
    candidates = [
        os.path.join(DATA_SCANS_DIR, kind, str(scan.id)),   # new separated layout
        os.path.join(DATA_SCANS_DIR, str(scan.id)),         # transitional layout
        os.path.join(LEGACY_SCANS_DIR, str(scan.id)),       # legacy uploads layout
    ]

    for scan_dir in candidates:
        if not os.path.isdir(scan_dir):
            continue
        if raw:
            base = os.path.basename(raw)
            if base:
                candidate = os.path.join(scan_dir, base)
                if os.path.isfile(candidate):
                    return candidate
        return scan_dir

    # Legacy DB path remap fallback (e.g., .../uploads/scans/<id>/...)
    if raw:
        normalized = raw.replace("\\", "/")
        marker = "/uploads/scans/"
        idx = normalized.lower().find(marker)
        if idx != -1:
            suffix = normalized[idx + len(marker):].lstrip("/")
            remapped_candidates = [
                os.path.join(DATA_SCANS_DIR, kind, suffix),
                os.path.join(DATA_SCANS_DIR, suffix),
            ]
            for candidate in remapped_candidates:
                if os.path.isfile(candidate) or os.path.isdir(candidate):
                    return candidate
    return raw


@router.get("/scan/{scan_id}/preview-meta")
def mri_preview_meta(
    scan_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    scan = db.query(MRIScan).filter(MRIScan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if not _can_access_scan(scan, current):
        raise HTTPException(status_code=403, detail="Not allowed to view this scan")
    try:
        _, (d, h, w) = load_volume_and_shape(scan.file_path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Could not read volume: {e}") from e
    return {
        "scan_id": scan.id,
        "depth": d,
        "height": h,
        "width": w,
        "default_slice": int(max(0, d // 2)),
    }


@router.get("/scan/{scan_id}/preview")
def mri_preview_png(
    scan_id: int,
    slice_index: int | None = None,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    scan = db.query(MRIScan).filter(MRIScan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if not _can_access_scan(scan, current):
        raise HTTPException(status_code=403, detail="Not allowed to view this scan")
    try:
        png, used, depth = get_preview_png(scan.file_path, slice_index)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="Scan file missing on server")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    headers = {
        "X-Scan-Slice": str(used),
        "X-Scan-Depth": str(depth),
        "Cache-Control": "private, max-age=60",
    }
    return Response(content=png, media_type="image/png", headers=headers)


@router.get("/scan/{scan_id}/download")
def download_scan_volume(
    scan_id: int,
    db: Session = Depends(get_db),
    current: User = Depends(get_current_user),
):
    """Download the raw MRI file (for doctor to save locally and re-upload after QC)."""
    scan = db.query(MRIScan).filter(MRIScan.id == scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")
    if not _can_access_scan(scan, current):
        raise HTTPException(status_code=403, detail="Not allowed to download this scan")
    path = _resolve_scan_disk_path(scan)
    if not path:
        raise HTTPException(status_code=404, detail="Scan file missing on server")
    if os.path.isdir(path):
        try:
            files_to_zip = collect_files_for_scan_download(path)
        except FileNotFoundError as e:
            raise HTTPException(status_code=404, detail=str(e)) from e
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not prepare scan download: {e}") from e
        if not files_to_zip:
            raise HTTPException(
                status_code=400,
                detail="No MRI volume files (.nii, .nii.gz, .dcm) found under this scan folder.",
            )

        root_abs = os.path.abspath(path)
        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for volume_path in files_to_zip:
                vp_abs = os.path.abspath(volume_path)
                try:
                    arcname = os.path.relpath(vp_abs, root_abs)
                except ValueError:
                    arcname = os.path.basename(vp_abs)
                if arcname.startswith(".."):
                    arcname = os.path.basename(vp_abs)
                archive.write(vp_abs, arcname=arcname)
        headers = {
            "Content-Disposition": f'attachment; filename="scan_{scan_id}_modalities.zip"'
        }
        return Response(content=buf.getvalue(), media_type="application/zip", headers=headers)
    if not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="Scan file missing on server")
    name = os.path.basename(path) or f"scan_{scan_id}.dat"
    return FileResponse(
        path,
        filename=name,
        media_type="application/octet-stream",
        content_disposition_type="attachment",
    )
