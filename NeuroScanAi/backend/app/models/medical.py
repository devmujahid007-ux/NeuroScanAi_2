from sqlalchemy import Column, Integer, String, Float, Text, Enum, ForeignKey, TIMESTAMP
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
    file_path = Column(String(255))
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

    scan = relationship("MRIScan", back_populates="diagnosis")
    report = relationship("Report", back_populates="diagnosis", uselist=False)


# -------------------------
# REPORT
# -------------------------
class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    diagnosis_id = Column(Integer, ForeignKey("diagnoses.id"))
    summary = Column(Text)
    recommendation = Column(Text)
    pdf_path = Column(String(255))

    diagnosis = relationship("Diagnosis", back_populates="report")
