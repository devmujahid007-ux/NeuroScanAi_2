from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.db import SessionLocal
from app.models.medical import MRIScan, Diagnosis, Report
from app.security.jwt import get_current_user

router = APIRouter(prefix="/api/stats", tags=["Stats"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/summary")
def summary(db: Session = Depends(get_db), current = Depends(get_current_user)):
    # Count distinct patients assigned to this doctor
    my_patients = db.query(MRIScan.patient_id).filter(MRIScan.doctor_id == current.id).distinct().count()

    # Count reports generated for this doctor's scans
    q = db.query(Report).join(Diagnosis, Report.diagnosis_id == Diagnosis.id).join(MRIScan, Diagnosis.scan_id == MRIScan.id)
    reports_generated = q.filter(MRIScan.doctor_id == current.id).count()

    return {"my_patients": my_patients, "reports_generated": reports_generated}
