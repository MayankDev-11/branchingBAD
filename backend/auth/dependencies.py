from datetime import datetime, timezone
from typing import Optional

from fastapi import Cookie, HTTPException, status
from pydantic import BaseModel

from .database import get_connection

SESSION_COOKIE_NAME = "roottrace_session"


class CurrentUser(BaseModel):
    id: str
    full_name: str
    email: str
    data_source: Optional[str] = None
    is_demo: bool = False


def get_current_user(
    roottrace_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> CurrentUser:
    """Reusable FastAPI dependency guarding existing dashboard routes."""
    if not roottrace_session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required.",
        )

    now_iso = datetime.now(timezone.utc).isoformat()
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT u.id, u.full_name, u.email, u.data_source, u.is_demo, s.expires_at
            FROM sessions s
            JOIN users u ON u.id = s.user_id
            WHERE s.session_id = ?
            """,
            (roottrace_session,),
        ).fetchone()

        if row is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session invalid or expired.",
            )

        if row["expires_at"] <= now_iso:
            conn.execute("DELETE FROM sessions WHERE session_id = ?", (roottrace_session,))
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired.",
            )

        return CurrentUser(
            id=row["id"],
            full_name=row["full_name"],
            email=row["email"],
            data_source=row["data_source"],
            is_demo=bool(row["is_demo"]),
        )
