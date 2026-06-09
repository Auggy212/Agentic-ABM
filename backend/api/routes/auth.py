"""
Authentication routes.

POST /api/auth/signup              - register new user, send OTP
POST /api/auth/verify-email        - confirm OTP, activate account
POST /api/auth/resend-verification - send fresh OTP
POST /api/auth/login               - login (requires verified email)
"""

from __future__ import annotations

from typing import Optional

import os
import random
import secrets
import smtplib
import string
from datetime import datetime, timedelta, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import bcrypt
from fastapi import APIRouter, Depends, HTTPException, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.orm import Session

from sqlalchemy import update
from backend.db.models import (
    UserRecord,
    IntakeDraftRecord,
    MasterContextRecord,
    ICPAccountRecord,
    ICPRunRecord,
    BuyerProfileRecord,
    BuyerIntelRunRecord,
)
from backend.db.session import get_db

router = APIRouter(prefix="/api/auth", tags=["auth"])

_SECRET_KEY = os.environ.get("SECRET_KEY", "change-me-in-production-" + secrets.token_hex(16))
_signer = URLSafeTimedSerializer(_SECRET_KEY)

_SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
_SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
_SMTP_USER = os.environ.get("SMTP_USER", "")
_SMTP_PASS = os.environ.get("SMTP_PASSWORD", "")
_SMTP_FROM = os.environ.get("SMTP_FROM", _SMTP_USER) or "noreply@abmengine.com"

_OTP_TTL_MINUTES = 15
_TOKEN_MAX_AGE = 86400 * 30  # 30 days


# â”€â”€ helpers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def _hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def _check_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode(), hashed.encode())


def _make_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


def _make_token(user_id: str) -> str:
    return _signer.dumps(user_id, salt="abm-auth")


def _read_token(token: str) -> str:
    try:
        return _signer.loads(token, salt="abm-auth", max_age=_TOKEN_MAX_AGE)
    except SignatureExpired:
        raise HTTPException(status_code=401, detail="Session expired â€” please log in again.")
    except BadSignature:
        raise HTTPException(status_code=401, detail="Invalid token.")


def _send_otp_email(to_email: str, name: str, code: str) -> None:
    if not _SMTP_USER or not _SMTP_PASS:
        print(f"[ABM Auth] Verification code for {to_email}: {code}")
        return

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Your ABM Engine verification code"
    msg["From"] = _SMTP_FROM
    msg["To"] = to_email

    plain = (
        f"Hi {name},\n\n"
        f"Your ABM Engine verification code is: {code}\n\n"
        f"This code expires in {_OTP_TTL_MINUTES} minutes.\n\n"
        "If you didn't sign up for ABM Engine, you can safely ignore this email."
    )
    html = f"""<!DOCTYPE html>
<html><body style="font-family:sans-serif;color:#111;max-width:480px;margin:0 auto;padding:32px">
  <div style="font-size:20px;font-weight:700;margin-bottom:24px">ABM Engine</div>
  <p>Hi {name},</p>
  <p>Use the code below to verify your email address. It expires in {_OTP_TTL_MINUTES} minutes.</p>
  <div style="font-size:36px;font-weight:700;letter-spacing:10px;padding:24px;background:#f4f4f5;border-radius:8px;text-align:center;margin:24px 0">{code}</div>
  <p style="color:#888;font-size:13px">If you didn't sign up for ABM Engine, you can safely ignore this email.</p>
</body></html>"""

    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(_SMTP_HOST, _SMTP_PORT) as server:
            server.starttls()
            server.login(_SMTP_USER, _SMTP_PASS)
            server.sendmail(_SMTP_FROM, to_email, msg.as_string())
    except Exception as exc:
        print(f"[ABM Auth] Email send failed ({exc}); code for {to_email}: {code}")


# â”€â”€ schemas â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class SignupRequest(BaseModel):
    email: EmailStr
    name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8)


class VerifyEmailRequest(BaseModel):
    email: EmailStr
    code: str = Field(..., min_length=6, max_length=6)


class ResendRequest(BaseModel):
    email: EmailStr


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    prev_client_id: Optional[str] = None


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    client_id: str
    initials: str


class AuthResponse(BaseModel):
    token: str
    user: UserOut


# â”€â”€ routes â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

@router.post("/signup", status_code=status.HTTP_201_CREATED)
def signup(body: SignupRequest, db: Session = Depends(get_db)) -> dict:
    existing = db.query(UserRecord).filter(UserRecord.email == body.email).first()
    if existing:
        if existing.is_verified:
            raise HTTPException(status_code=409, detail="An account with this email already exists.")
        # Unverified duplicate â€” resend a fresh code
        _refresh_otp(existing, db, body.name)
        return {"message": "Verification code sent.", "email": body.email}

    user = UserRecord(
        email=body.email,
        name=body.name,
        password_hash=_hash_password(body.password),
        is_verified=False,
    )
    _refresh_otp(user, db, body.name, commit=False)
    db.add(user)
    db.commit()
    return {"message": "Verification code sent.", "email": body.email}


@router.post("/verify-email")
def verify_email(body: VerifyEmailRequest, db: Session = Depends(get_db)) -> dict:
    user = db.query(UserRecord).filter(UserRecord.email == body.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Account not found.")

    if user.is_verified:
        return {"message": "Email already verified."}

    now = datetime.now(tz=timezone.utc)
    if not user.verification_code or user.verification_code != body.code:
        raise HTTPException(status_code=400, detail="Invalid verification code.")
    expires = user.verification_code_expires_at
    # SQLite returns naive datetimes â€” treat them as UTC for comparison
    if expires and expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if not expires or expires < now:
        raise HTTPException(status_code=400, detail="Verification code has expired. Please request a new one.")

    user.is_verified = True
    user.verification_code = None
    user.verification_code_expires_at = None
    db.commit()
    return {"message": "Email verified. You can now log in."}


@router.post("/resend-verification")
def resend_verification(body: ResendRequest, db: Session = Depends(get_db)) -> dict:
    user = db.query(UserRecord).filter(UserRecord.email == body.email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Account not found.")
    if user.is_verified:
        return {"message": "Email already verified."}
    _refresh_otp(user, db, user.name)
    return {"message": "Verification code resent.", "email": body.email}


@router.post("/login", response_model=AuthResponse)
def login(body: LoginRequest, db: Session = Depends(get_db)) -> AuthResponse:
    user = db.query(UserRecord).filter(UserRecord.email == body.email).first()
    if not user or not _check_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user.is_verified:
        raise HTTPException(
            status_code=403,
            detail="Email not verified. Please check your inbox for the verification code.",
        )

    if body.prev_client_id and body.prev_client_id != user.client_id:
        _migrate_client_data(db, old_id=body.prev_client_id, new_id=user.client_id)

    token = _make_token(user.id)
    initials = "".join(w[0].upper() for w in user.name.split() if w)[:2]
    return AuthResponse(
        token=token,
        user=UserOut(
            id=user.id,
            email=user.email,
            name=user.name,
            client_id=user.client_id,
            initials=initials,
        ),
    )


# â”€â”€ internal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

_MIGRATABLE_MODELS = [
    IntakeDraftRecord,
    MasterContextRecord,
    ICPAccountRecord,
    ICPRunRecord,
    BuyerProfileRecord,
    BuyerIntelRunRecord,
]


def _migrate_client_data(db: Session, *, old_id: str, new_id: str) -> None:
    """Reassign all data rows from old_id to new_id (pre-login anonymous session -> real user)."""
    for model in _MIGRATABLE_MODELS:
        try:
            db.execute(
                update(model)
                .where(model.client_id == old_id)
                .values(client_id=new_id)
            )
        except Exception:
            pass
    try:
        db.commit()
    except Exception:
        db.rollback()


def _refresh_otp(user: UserRecord, db: Session, name: str, *, commit: bool = True) -> None:
    code = _make_otp()
    user.verification_code = code
    user.verification_code_expires_at = datetime.now(tz=timezone.utc) + timedelta(minutes=_OTP_TTL_MINUTES)
    if commit:
        db.commit()
    _send_otp_email(user.email, name, code)

