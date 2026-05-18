from sqlalchemy.orm import Session
from app.models.user import User
from app.security.password import hash_password, verify_password
from app.security.jwt import create_access_token, create_refresh_token


def register_user(db: Session, email: str, password: str, full_name: str):
    user = User(
        email=email,
        password_hash=hash_password(password),
        full_name=full_name
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str):
    user = db.query(User).filter(User.email == email).first()
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None
    return user


def login_user(user: User):
    return {
        "access_token": create_access_token({"sub": str(user.id)}),
        "refresh_token": create_refresh_token({"sub": str(user.id)}),
    }