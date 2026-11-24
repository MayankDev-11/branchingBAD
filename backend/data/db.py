"""SQLite connection helpers. Plain sqlite3, no ORM."""

import json
import sqlite3
from pathlib import Path

SCHEMA_PATH = Path(__file__).with_name("schema.sql")


def connect(path: str | Path) -> sqlite3.Connection:
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))


def loads(value: str | None, default=None):
    return json.loads(value) if value else default


def dumps(value) -> str:
    return json.dumps(value, separators=(",", ":"))
