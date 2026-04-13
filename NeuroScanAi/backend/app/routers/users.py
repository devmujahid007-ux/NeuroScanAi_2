from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database.db import SessionLocal
from app.models.user import User
from app.schemas.user import UserOut
from app.security.jwt import role_required

router = APIRouter(prefix="/users", tags=["Users"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.get("/", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db), current = Depends(role_required("admin"))):
    return db.query(User).all()
