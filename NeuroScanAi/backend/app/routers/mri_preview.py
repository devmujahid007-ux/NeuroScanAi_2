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
from app.ml.volume_io import get_preview_png, load_volume_and_shape, resolve_scan_volume_paths

router = APIRouter(prefix="/mri", tags=["MRI"])


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
    path = scan.file_path
    if not path:
        raise HTTPException(status_code=404, detail="Scan file missing on server")
    if os.path.isdir(path):
        try:
            ordered_paths = resolve_scan_volume_paths(path)
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Could not prepare scan download: {e}") from e

        buf = io.BytesIO()
        with zipfile.ZipFile(buf, mode="w", compression=zipfile.ZIP_DEFLATED) as archive:
            for volume_path in ordered_paths:
                archive.write(volume_path, arcname=os.path.basename(volume_path))
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
