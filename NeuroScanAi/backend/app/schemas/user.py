from pydantic import BaseModel, EmailStr

class UserBase(BaseModel):
    email: EmailStr

class UserCreate(UserBase):
    password: str
    role: str | None = "patient"
    name: str | None = None
    age: int | None = None
    phone: str | None = None

class UserLogin(UserBase):
    password: str

class UserOut(BaseModel):
    id: int
    email: EmailStr
    role: str
    name: str | None = None
    age: int | None = None
    phone: str | None = None

    class Config:
        orm_mode = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenPayload(BaseModel):
    sub: str
    role: str
