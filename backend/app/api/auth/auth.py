from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies.db import get_db
from app.schemas.user import UserCreate, UserLogin
from app.services.auth import register_user, authenticate_user, login_user

auth_router = APIRouter(prefix="/auth", tags=["auth"])


@auth_router.post("/register")
def register(data: UserCreate, db: Session = Depends(get_db)):
    user = register_user(db, data.email, data.password, data.full_name)
    return {"id": user.id, "email": user.email, "full_name": user.full_name}


@auth_router.post("/login")
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = authenticate_user(db, data.email, data.password)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    return login_user(user)