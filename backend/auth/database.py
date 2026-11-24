"""Login database: users and sessions only. Kept apart from the health data (backend/data/roottrace.db).

File: $ROOTTRACE_AUTH_DB_PATH, or backend/data/roottrace_auth.db (git-ignored by *.db).
"""

import os
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterator

DEFAULT_DB_PATH = Path(__file__).resolve().parents[1] / "data" / "roottrace_auth.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    data_source TEXT,
    is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);
"""

# Paths whose tables already exist in this process, so the schema runs once per file.
_ready: set[str] = set()


def get_db_path() -> Path:
    custom = os.getenv("ROOTTRACE_AUTH_DB_PATH")
    return Path(custom) if custom else DEFAULT_DB_PATH


@contextmanager
def get_connection() -> Iterator[sqlite3.Connection]:
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(db_path), timeout=10.0)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    conn.execute("PRAGMA journal_mode = WAL;")
    if str(db_path) not in _ready:
        # Created lazily as well as at startup, so a TestClient without lifespan still works.
        conn.executescript(SCHEMA)
        _ready.add(str(db_path))
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def init_auth_db() -> None:
    """Create the users and sessions tables if they are missing; never touches other tables."""
    with get_connection():
        pass


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
