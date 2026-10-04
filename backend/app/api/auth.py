import time
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import get_settings
from app.core.security import DUMMY_HASH, create_access_token, verify_password
from app.db.models import User
from app.db.session import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

MAX_FAILURES = 5
WINDOW_SECONDS = 15 * 60
_failures: dict[str, list[float]] = defaultdict(list)  # in-memory; use Redis in production


class LoginRequest(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=256)


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str
    job_title: str | None


def _recent_failures(key: str) -> list[float]:
    cutoff = time.time() - WINDOW_SECONDS
    _failures[key] = [t for t in _failures[key] if t > cutoff]
    return _failures[key]


@router.post("/login", response_model=UserOut)
def login(body: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    email = body.email.strip().lower()
    key = f"{email}|{request.client.host if request.client else 'unknown'}"
    if len(_recent_failures(key)) >= MAX_FAILURES:
        raise HTTPException(status_code=429, detail="Too many failed attempts. Try again in a few minutes.")

    user = db.scalar(select(User).where(User.email == email))
    password_ok = verify_password(user.password_hash if user else DUMMY_HASH, body.password)
    if not (user and password_ok and user.is_active):
        _failures[key].append(time.time())
        raise HTTPException(status_code=401, detail="Invalid email or password")

    _failures.pop(key, None)
    s = get_settings()
    response.set_cookie(
        key=s.cookie_name,
        value=create_access_token(user.id),
        max_age=s.jwt_expire_minutes * 60,
        httponly=True,  # not readable from JavaScript
        secure=s.cookie_secure,
        samesite="lax",  # not sent on cross-site POSTs (CSRF defence)
        path="/",
    )
    return user


@router.post("/logout")
def logout(response: Response) -> dict:
    response.delete_cookie(get_settings().cookie_name, path="/")
    return {"status": "signed out"}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user