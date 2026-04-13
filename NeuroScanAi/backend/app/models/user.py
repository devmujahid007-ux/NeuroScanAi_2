from sqlalchemy import Column, Integer, String, DateTime, func
from app.database.db import Base

class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password = Column(String(255), nullable=False)
    role = Column(String(50), nullable=False, default="patient")  # patient | doctor | admin | superadmin
    # optional profile fields for patients
    name = Column(String(255), nullable=True)
    age = Column(Integer, nullable=True)
    phone = Column(String(50), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
