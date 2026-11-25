"""Persist account-owned resolution notes in the workspace SQLite database."""

import json
import sqlite3

from backend.ai.knowledge_catalog import question_outcome


def initialize_knowledge(conn: sqlite3.Connection) -> None:
    if conn.execute("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'workspace_knowledge'").fetchone():
        return
    with conn:
        conn.execute("BEGIN IMMEDIATE")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS workspace_knowledge (
                branch_id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                topic TEXT NOT NULL,
                title TEXT NOT NULL,
                closed_date TEXT NOT NULL,
                note TEXT NOT NULL
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS workspace_knowledge_owner
              ON workspace_knowledge(user_id, closed_date DESC, branch_id)
        """)
        rows = conn.execute("""
            SELECT id, user_id, payload FROM workspace_branches
            WHERE json_extract(payload, '$.lifecycle') = 'resolved'
        """)
        for row in rows:
            remember_resolution(conn, row["id"], row["user_id"], json.loads(row["payload"]))


def remember_resolution(conn: sqlite3.Connection, branch_id: str, user_id: str, payload: dict) -> None:
    conn.execute("""
        INSERT INTO workspace_knowledge(branch_id, user_id, topic, title, closed_date, note)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(branch_id) DO NOTHING
    """, (branch_id, user_id, question_outcome(payload["title"], payload.get("outcome", "auto")),
          payload["title"], payload["closed_date"], payload["resolution"]))


def knowledge_entries(conn: sqlite3.Connection, user_id: str, *, topic=None, exclude=None) -> list[dict]:
    fields = "branch_id AS id, topic, title, closed_date AS date, note"
    if topic is None:
        rows = conn.execute(f"""
            SELECT {fields} FROM workspace_knowledge WHERE user_id = ?
            ORDER BY closed_date DESC, branch_id
        """, (user_id,))
    else:
        rows = conn.execute(f"""
            SELECT {fields} FROM workspace_knowledge
            WHERE user_id = ? AND topic = ? AND branch_id != ?
            ORDER BY closed_date DESC, branch_id LIMIT 3
        """, (user_id, topic, exclude))
    return [dict(row) for row in rows]
