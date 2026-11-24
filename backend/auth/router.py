import os
import secrets
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel, Field

from .database import get_connection, utc_now_iso
from .dependencies import SESSION_COOKIE_NAME, CurrentUser, get_current_user
from .rate_limit import login_rate_limiter
from .security import (
    generate_session_id,
    hash_password,
    normalize_email,
    validate_email,
    validate_password_policy,
    verify_password,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])

SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7  # 7 days
DEMO_EMAIL = "demo@roottrace.local"


class RegisterRequest(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=120)
    email: str = Field(..., min_length=3, max_length=254)
    password: str = Field(..., min_length=1, max_length=256)
    data_source: Optional[str] = Field(default=None, max_length=80)


class LoginRequest(BaseModel):
    email: str = Field(..., min_length=1, max_length=254)
    password: str = Field(..., min_length=1, max_length=256)


class AuthResponse(BaseModel):
    user: CurrentUser


def _set_no_store(response: Response) -> None:
    response.headers["Cache-Control"] = "no-store"
    response.headers["Pragma"] = "no-cache"


def _issue_session_cookie(response: Response, user_id: str) -> str:
    session_id = generate_session_id()
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(seconds=SESSION_MAX_AGE_SECONDS)).isoformat()
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO sessions (session_id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
            (session_id, user_id, now.isoformat(), expires_at),
        )

    is_prod = os.getenv("ENV", "development").lower() == "production"
    response.set_cookie(
        key=SESSION_COOKIE_NAME,
        value=session_id,
        httponly=True,
        samesite="lax",
        secure=is_prod,
        path="/",
        max_age=SESSION_MAX_AGE_SECONDS,
    )
    return session_id


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, response: Response) -> AuthResponse:
    _set_no_store(response)
    email = normalize_email(payload.email)
    full_name = payload.full_name.strip()

    if not full_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Full name is required.")
    if not validate_email(email):
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Please enter a valid email address.")

    ok, err_msg = validate_password_policy(payload.password)
    if not ok:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=err_msg)

    user_id = str(uuid.uuid4())
    pw_hash = hash_password(payload.password)
    created_at = utc_now_iso()

    try:
        with get_connection() as conn:
            conn.execute(
                """
                INSERT INTO users (id, full_name, email, password_hash, data_source, is_demo, created_at)
                VALUES (?, ?, ?, ?, ?, 0, ?)
                """,
                (user_id, full_name, email, pw_hash, payload.data_source, created_at),
            )
    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )

    _issue_session_cookie(response, user_id)
    return AuthResponse(
        user=CurrentUser(
            id=user_id,
            full_name=full_name,
            email=email,
            data_source=payload.data_source,
            is_demo=False,
        )
    )


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, request: Request, response: Response) -> AuthResponse:
    _set_no_store(response)
    email = normalize_email(payload.email)
    client_ip = request.client.host if request.client else "unknown"

    blocked, retry_after = login_rate_limiter.is_blocked(client_ip, email)
    if blocked:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed sign-in attempts. Please wait a minute and try again.",
            headers={"Retry-After": str(retry_after), "Cache-Control": "no-store"},
        )

    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, full_name, email, password_hash, data_source, is_demo FROM users WHERE email = ?",
            (email,),
        ).fetchone()

    # Identical 401 message whether user is missing OR password mismatches (prevents email enumeration)
    if row is None or not verify_password(payload.password, row["password_hash"]):
        login_rate_limiter.record_failure(client_ip, email)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
            headers={"Cache-Control": "no-store"},
        )

    login_rate_limiter.clear(client_ip, email)
    _issue_session_cookie(response, row["id"])

    return AuthResponse(
        user=CurrentUser(
            id=row["id"],
            full_name=row["full_name"],
            email=row["email"],
            data_source=row["data_source"],
            is_demo=bool(row["is_demo"]),
        )
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    roottrace_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> Response:
    _set_no_store(response)
    if roottrace_session:
        with get_connection() as conn:
            conn.execute("DELETE FROM sessions WHERE session_id = ?", (roottrace_session,))

    is_prod = os.getenv("ENV", "development").lower() == "production"
    response.delete_cookie(
        key=SESSION_COOKIE_NAME,
        path="/",
        httponly=True,
        samesite="lax",
        secure=is_prod,
    )
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=AuthResponse)
def me(response: Response, current_user: CurrentUser = Depends(get_current_user)) -> AuthResponse:
    _set_no_store(response)
    return AuthResponse(user=current_user)


@router.post("/demo", response_model=AuthResponse)
def demo_login(response: Response) -> AuthResponse:
    """Seeds/reuses a sandbox demo user and issues a real HttpOnly session cookie."""
    _set_no_store(response)
    with get_connection() as conn:
        row = conn.execute(
            "SELECT id, full_name, email, data_source, is_demo FROM users WHERE email = ?",
            (DEMO_EMAIL,),
        ).fetchone()

        if row is None:
            demo_id = str(uuid.uuid4())
            # Unusable high-entropy random password hashed with Argon2id
            demo_hash = hash_password(f"Demo!{secrets.token_urlsafe(24)}9")
            conn.execute(
                """
                INSERT INTO users (id, full_name, email, password_hash, data_source, is_demo, created_at)
                VALUES (?, ?, ?, ?, ?, 1, ?)
                """,
                (demo_id, "Judge Demo Workspace", DEMO_EMAIL, demo_hash, "Apple Health", utc_now_iso()),
            )
            demo_user = CurrentUser(
                id=demo_id,
                full_name="Judge Demo Workspace",
                email=DEMO_EMAIL,
                data_source="Apple Health",
                is_demo=True,
            )
        else:
            demo_user = CurrentUser(
                id=row["id"],
                full_name=row["full_name"],
                email=row["email"],
                data_source=row["data_source"],
                is_demo=bool(row["is_demo"]),
            )

    _issue_session_cookie(response, demo_user.id)
    return AuthResponse(user=demo_user)
