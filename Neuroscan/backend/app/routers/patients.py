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


def _assert_admin_or_superadmin(current):
    role = (getattr(current, "role", "") or "").lower()
    if role not in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin permissions required")


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
    _assert_admin_or_superadmin(current)
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

    password_in = payload.get("password")
    if isinstance(password_in, str) and password_in.strip():
        raw_password = password_in.strip()
        if len(raw_password) < 6:
            raise HTTPException(status_code=400, detail="password must be at least 6 characters")
        hashed = generate_password_hash(raw_password)
    else:
        # legacy: auto-generated password (not returned; user cannot log in until reset)
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
    _assert_admin_or_superadmin(current)
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
    _assert_admin_or_superadmin(current)
    p = db.query(User).filter(User.id == patient_id, User.role == "patient").first()
    if not p:
        raise HTTPException(status_code=404, detail="Patient not found")
    linked_scans = db.query(MRIScan).filter(MRIScan.patient_id == patient_id).count()
    linked_reports = db.query(Report).filter(Report.patient_id == patient_id).count()
    if linked_scans > 0 or linked_reports > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete patient with linked scans/reports. Keep record for medical history.",
        )
    db.delete(p)
    db.commit()
    return {"status": "deleted"}


@router.post("/doctors")
def create_doctor(payload: dict, db: Session = Depends(get_db), current=Depends(get_current_user)):
    _assert_admin_or_superadmin(current)
    email = (payload.get("email") or "").strip().lower()
    name = (payload.get("name") or "").strip() or None
    phone = (payload.get("phone") or "").strip() or None
    password = payload.get("password") or secrets.token_urlsafe(10)
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="email already registered")
    new_user = User(
        email=email,
        password=generate_password_hash(password),
        role="doctor",
        name=name,
        phone=phone,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {
        "id": new_user.id,
        "email": new_user.email,
        "name": new_user.name,
        "phone": new_user.phone,
        "role": new_user.role,
        "temporary_password": None if payload.get("password") else password,
    }


@router.delete("/doctors/{doctor_id}")
def delete_doctor(doctor_id: int, db: Session = Depends(get_db), current=Depends(get_current_user)):
    _assert_admin_or_superadmin(current)
    d = db.query(User).filter(User.id == doctor_id, func.lower(User.role) == "doctor").first()
    if not d:
        raise HTTPException(status_code=404, detail="Doctor not found")
    linked_scans = db.query(MRIScan).filter(MRIScan.doctor_id == doctor_id).count()
    linked_reports = db.query(Report).filter(Report.doctor_id == doctor_id).count()
    if linked_scans > 0 or linked_reports > 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot delete doctor with linked scans/reports. Reassign records first.",
        )
    db.delete(d)
    db.commit()
    return {"status": "deleted"}


@router.post("/invite")
def invite_user(payload: dict, db: Session = Depends(get_db), current=Depends(get_current_user)):
    _assert_admin_or_superadmin(current)
    role = (payload.get("role") or "").strip().lower()
    if role not in ("patient", "doctor"):
        raise HTTPException(status_code=400, detail="role must be patient or doctor")
    email = (payload.get("email") or "").strip().lower()
    name = (payload.get("name") or "").strip() or None
    phone = (payload.get("phone") or "").strip() or None
    age = payload.get("age")
    if not email:
        raise HTTPException(status_code=400, detail="email is required")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="email already registered")

    temporary_password = secrets.token_urlsafe(10)
    user = User(
        email=email,
        password=generate_password_hash(temporary_password),
        role=role,
        name=name,
        phone=phone,
        age=age if role == "patient" else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return {
        "message": f"{role.capitalize()} invited successfully",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "phone": user.phone,
            "age": user.age,
        },
        "temporary_password": temporary_password,
    }


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
