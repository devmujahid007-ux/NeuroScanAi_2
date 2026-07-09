from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from werkzeug.security import generate_password_hash, check_password_hash
from app.database.db import SessionLocal
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserOut, Token
from app.security.jwt import create_access_token, get_current_user, role_required

router = APIRouter(prefix="/auth", tags=["Auth"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@router.post("/register", response_model=UserOut)
def register(user: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == user.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = generate_password_hash(user.password)
    # Disallow creating privileged accounts (admin / superadmin) via public registration.
    requested_role = (user.role or "patient").lower()
    if requested_role in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Creating admin or superadmin accounts is not allowed via public registration")

    new_user = User(
        email=user.email,
        password=hashed,
        role=requested_role,
        name=user.name,
        age=user.age,
        phone=user.phone,
    )
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user


@router.post("/create-admin", response_model=UserOut)
def create_admin(payload: UserCreate, current=Depends(role_required("superadmin")), db: Session = Depends(get_db)):
    """Create an admin account — only callable by a superadmin."""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    hashed = generate_password_hash(payload.password)
    new_user = User(email=payload.email, password=hashed, role="admin")
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=Token)
def login(creds: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == creds.email).first()
    if not db_user or not check_password_hash(db_user.password, creds.password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    token = create_access_token({"sub": db_user.email, "role": db_user.role})
    return {"access_token": token, "token_type": "bearer"}

@router.get("/me", response_model=UserOut)
def me(current = Depends(get_current_user)):
    return current
