from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from werkzeug.security import generate_password_hash
import os, secrets

from app.database.db import SessionLocal
from app.models.user import User
from app.models.medical import MRIScan, Diagnosis, Report
from app.security.jwt import get_current_user

router = APIRouter(prefix="/api/patients", tags=["Patients"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.get("/")
def list_patients(db: Session = Depends(get_db), current = Depends(get_current_user)):
    # list all users with role 'patient'
    patients = db.query(User).filter(User.role == "patient").all()
    out = []
    for p in patients:
        out.append({
            "id": p.id,
            "email": p.email,
            "name": p.name,
            "age": p.age,
            "phone": p.phone,
            "role": p.role,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })
    return out


@router.get("/doctors")
def list_doctors(db: Session = Depends(get_db), current = Depends(get_current_user)):
    """List all doctors available for consultations."""
    doctors = db.query(User).filter(func.lower(User.role) == "doctor").all()
    out = []
    for d in doctors:
        out.append({
            "id": d.id,
            "email": d.email,
            "name": d.name,
            "phone": d.phone,
            "role": d.role,
            "created_at": d.created_at.isoformat() if d.created_at else None,
        })
    return out


@router.post("/")
def create_patient(payload: dict, db: Session = Depends(get_db), current = Depends(get_current_user)):
    # minimal validation
    email = payload.get("email")
    name = payload.get("name")
    age = payload.get("age")
    phone = payload.get("phone")

    if not name:
        raise HTTPException(status_code=400, detail="name is required")

    if email:
        existing = db.query(User).filter(User.email == email).first()
        if existing:
            raise HTTPException(status_code=400, detail="email already registered")

    # generate a hidden random password for the account (not returned)
    raw_password = secrets.token_urlsafe(8)
    hashed = generate_password_hash(raw_password)

    new_user = User(email=email or f"patient+{secrets.token_hex(6)}@local", password=hashed, role="patient", name=name, age=age, phone=phone)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    # do not expose generated password to the UI; receptionist can reset via admin flow
    return {"id": new_user.id, "email": new_user.email, "name": new_user.name, "age": new_user.age, "phone": new_user.phone}



@router.put("/{patient_id}")
def update_patient(patient_id: int, payload: dict, db: Session = Depends(get_db), current = Depends(get_current_user)):
    p = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")

    # allowed fields
    for k in ("name", "age", "phone", "email"):
        if k in payload:
            setattr(p, k, payload.get(k))

    db.add(p)
    db.commit()
    db.refresh(p)
    return {"id": p.id, "email": p.email, "name": p.name, "age": p.age, "phone": p.phone}


@router.delete("/{patient_id}")
def delete_patient(patient_id: int, db: Session = Depends(get_db), current = Depends(get_current_user)):
    p = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    db.delete(p)
    db.commit()
    return {"status": "deleted"}


@router.get("/{patient_id}")
def get_patient(patient_id: int, db: Session = Depends(get_db), current = Depends(get_current_user)):
    p = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")

    # gather reports for this patient via scans -> diagnoses -> reports
    scans = db.query(MRIScan).filter(MRIScan.patient_id == p.id).all()
    reports = []
    for s in scans:
        diag = db.query(Diagnosis).filter(Diagnosis.scan_id == s.id).first()
        if not diag:
            continue
        rep = db.query(Report).filter(Report.diagnosis_id == diag.id).first()
        if rep:
            reports.append({
                "report_id": rep.id,
                "diagnosis_id": diag.id,
                "scan_id": s.id,
                "summary": rep.summary,
                "pdf_path": rep.pdf_path,
            })

    return {
        "id": p.id,
        "email": p.email,
        "name": p.name,
        "age": p.age,
        "phone": p.phone,
        "reports": reports,
    }
