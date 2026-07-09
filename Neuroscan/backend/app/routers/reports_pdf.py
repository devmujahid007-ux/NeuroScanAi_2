"""
Authenticated PDF report listing and inline/attachment download via GET /reports.
"""
from __future__ import annotations

import os
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import or_
from sqlalchemy.orm import Session, joinedload

from app.database.db import SessionLocal
from app.models.medical import Diagnosis, MRIScan, Report, ScanStatus
from app.models.user import User
from app.security.jwt import get_current_user, get_user_from_access_token

router = APIRouter(prefix="/reports", tags=["Report PDFs"])
_optional_bearer = HTTPBearer(auto_error=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _report_disk_path(report: Report) -> str | None:
    return report.file_path or report.pdf_path


def _assert_can_access_pdf(report: Report, scan: MRIScan, user: User) -> None:
    role = (user.role or "").lower()
    if role in ("admin", "superadmin"):
        return
    if role == "doctor" and report.doctor_id == user.id:
        return
    if role == "patient" and scan.patient_id == user.id and scan.status == ScanStatus.reported:
        return
    raise HTTPException(status_code=403, detail="Not allowed to access this report")


@router.get("")
def list_reports(db: Session = Depends(get_db), current: User = Depends(get_current_user)) -> list[dict[str, Any]]:
    """Reports visible to the current user: doctors see theirs; patients see delivered (reported) only."""
    role = (current.role or "").lower()
    if role not in ("patient", "doctor", "admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")

    q = (
        db.query(Report)
        .options(joinedload(Report.diagnosis).joinedload(Diagnosis.scan))
        .filter(or_(Report.pdf_path.isnot(None), Report.file_path.isnot(None)))
    )
    if role == "patient":
        q = (
            q.join(Diagnosis, Report.diagnosis_id == Diagnosis.id)
            .join(MRIScan, Diagnosis.scan_id == MRIScan.id)
            .filter(
                Report.patient_id == current.id,
                MRIScan.status == ScanStatus.reported,
            )
        )
    elif role == "doctor":
        q = q.filter(Report.doctor_id == current.id)

    rows = q.order_by(Report.created_at.desc(), Report.id.desc()).all()
    out: list[dict[str, Any]] = []
    for r in rows:
        path = _report_disk_path(r)
        if not path:
            continue
        diagnosis = r.diagnosis
        scan = diagnosis.scan if diagnosis else None
        if not scan:
            continue
        patient_u = db.query(User).filter(User.id == r.patient_id).first() if r.patient_id else None
        doctor_u = db.query(User).filter(User.id == r.doctor_id).first() if r.doctor_id else None
        out.append(
            {
                "id": r.id,
                "patient_id": r.patient_id,
                "doctor_id": r.doctor_id,
                "file_path": path,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "scan_id": scan.id,
                "scan_status": scan.status.value if scan.status else None,
                "sent_to_patient": scan.status == ScanStatus.reported,
                "patient_name": (patient_u.name or patient_u.email) if patient_u else None,
                "doctor_name": (doctor_u.name or doctor_u.email) if doctor_u else None,
                "prediction": diagnosis.prediction if diagnosis else None,
                "confidence": diagnosis.confidence if diagnosis else None,
                "summary": r.summary or "",
                "recommendation": r.recommendation or "",
            }
        )
    return out


@router.get("/{report_id}")
def get_report_pdf(
    report_id: int,
    download: bool = Query(False, description="If true, send Content-Disposition: attachment"),
    access_token: str | None = Query(None, description="JWT for browser navigation (window.open)"),
    credentials: HTTPAuthorizationCredentials | None = Depends(_optional_bearer),
    db: Session = Depends(get_db),
):
    """
    Serve stored PDF with inline disposition by default (Chrome PDF viewer).
    Use ``?download=true`` for attachment. Authenticate via Authorization: Bearer or ``access_token`` query.
    """
    token = (credentials.credentials if credentials else None) or access_token
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    user = get_user_from_access_token(db, token)

    report = db.query(Report).filter(Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    diagnosis = db.query(Diagnosis).filter(Diagnosis.id == report.diagnosis_id).first()
    if not diagnosis:
        raise HTTPException(status_code=404, detail="Diagnosis not found")
    scan = db.query(MRIScan).filter(MRIScan.id == diagnosis.scan_id).first()
    if not scan:
        raise HTTPException(status_code=404, detail="Scan not found")

    _assert_can_access_pdf(report, scan, user)

    path = _report_disk_path(report)
    if not path or not os.path.isfile(path):
        raise HTTPException(status_code=404, detail="PDF file not found on server")

    fname = os.path.basename(path) or f"report_{report_id}.pdf"
    disp = f'attachment; filename="{fname}"' if download else "inline"
    headers = {
        "Content-Disposition": disp,
        "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
        "Pragma": "no-cache",
    }
    return FileResponse(path, media_type="application/pdf", headers=headers)
