from sqlalchemy import Column, Integer, String, Float, Text, Enum, ForeignKey, TIMESTAMP, DateTime, BigInteger, func
from sqlalchemy.orm import relationship
from app.database.db import Base
from app.models.user import User
import enum


# -------------------------
# ENUMS
# -------------------------
class RoleEnum(str, enum.Enum):
    admin = "admin"
    doctor = "doctor"
    patient = "patient"


class DiseaseType(str, enum.Enum):
    tumor = "tumor"
    alzheimer = "alzheimer"

class ScanStatus(str, enum.Enum):
    pending = "pending"  # Patient uploaded, waiting to send to doctor
    sent = "sent"  # Sent to doctor, awaiting analysis
    analyzed = "analyzed"  # Doctor ran analysis
    reported = "reported"  # Report generated and sent back

# -------------------------
# MRI SCAN
# -------------------------
class MRIScan(Base):
    __tablename__ = "mri_scans"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("users.id"))
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    file_path = Column(String(512))
    original_filename = Column(String(255), nullable=True)
    upload_source = Column(String(32), nullable=False, default="web")
    upload_size_bytes = Column(BigInteger, nullable=True)
    scan_kind = Column(String(32), nullable=False, default="mri")
    status = Column(Enum(ScanStatus), default=ScanStatus.pending)
    upload_date = Column(TIMESTAMP)
    sent_date = Column(TIMESTAMP, nullable=True)

    patient = relationship(User, foreign_keys=[patient_id])
    doctor = relationship(User, foreign_keys=[doctor_id])

    diagnosis = relationship("Diagnosis", back_populates="scan", uselist=False)


# -------------------------
# DIAGNOSIS
# -------------------------
class Diagnosis(Base):
    __tablename__ = "diagnoses"

    id = Column(Integer, primary_key=True, index=True)
    scan_id = Column(Integer, ForeignKey("mri_scans.id"))
    disease_type = Column(Enum(DiseaseType))
    prediction = Column(String(100))
    confidence = Column(Float)
    model_version = Column(String(255))
    model_meta = Column(Text, nullable=True)
    result_payload = Column(Text, nullable=True)
    result_image_path = Column(String(512), nullable=True)
    analyzed_at = Column(DateTime(timezone=True), server_default=func.now())

    scan = relationship("MRIScan", back_populates="diagnosis")
    report = relationship("Report", back_populates="diagnosis", uselist=False)


# -------------------------
# REPORT
# -------------------------
class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    diagnosis_id = Column(Integer, ForeignKey("diagnoses.id"))
    patient_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    doctor_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    summary = Column(Text)
    recommendation = Column(Text)
    pdf_path = Column(String(255))
    # Canonical stored path on disk (same as pdf_path for new reports; exposed as file_path in API)
    file_path = Column(String(512), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    diagnosis = relationship("Diagnosis", back_populates="report")
