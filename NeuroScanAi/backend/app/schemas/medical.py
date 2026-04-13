from pydantic import BaseModel, ConfigDict
from typing import Optional
from datetime import datetime
from app.models.medical import DiseaseType, ScanStatus

class MRIScanCreate(BaseModel):
    patient_id: Optional[int] = None
    doctor_id: Optional[int] = None
    file_path: str
    upload_date: Optional[datetime] = None

class MRIScanOut(BaseModel):
    id: int
    patient_id: Optional[int] = None
    doctor_id: Optional[int] = None
    file_path: str
    status: ScanStatus
    upload_date: datetime
    sent_date: Optional[datetime] = None
    model_config = ConfigDict(from_attributes=True)

class DiagnosisCreate(BaseModel):
    scan_id: int
    disease_type: DiseaseType
    prediction: str
    confidence: float
    model_version: str

class DiagnosisOut(BaseModel):
    id: int
    scan_id: int
    disease_type: DiseaseType
    prediction: str
    confidence: float
    model_version: str
    model_config = ConfigDict(from_attributes=True)
