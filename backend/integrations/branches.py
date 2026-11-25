"""Account-scoped branches layered over the read-only demo timeline."""

import json
import os
import sqlite3
from contextlib import closing
from datetime import date
from pathlib import Path
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, StringConstraints, field_validator

from backend.auth.dependencies import CurrentUser, get_current_user
from backend.data.metrics import METRICS
from backend.data.queries import build_record
from backend.data.store import store
from backend.integrations.branch_evidence import workspace_hypotheses
from backend.routes.branches import get_branch as demo_branch
from backend.routes.experiments import AdvanceBody, advance as advance_demo, reset as reset_demo
from backend.routes.graph import get_graph as demo_graph

router = APIRouter(prefix="/api", tags=["workspace branches"])
User = Annotated[CurrentUser, Depends(get_current_user)]
Label = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
ALIASES = {"late_screen_min": "screen_late_min", "caffeine": "caffeine_pm"}
DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "roottrace_workspace.db"


class BranchInput(BaseModel):
    title: Label
    branch_type: Literal["investigation", "habit"]
    start_date: date
    metrics: list[str] = Field(max_length=12)
    outcome: Literal["auto", "headache", "sleep_min", "afternoon_energy", "untracked"] = "auto"
    hypotheses: list[Label] = Field(max_length=20)
    created_via: Literal["manual", "elevenlabs_voice"]
    voice_transcript: str | None = Field(default=None, max_length=16000, exclude=True)

    @field_validator("metrics")
    @classmethod
    def resolve_metrics(cls, values: list[str]) -> list[str]:
        metrics = list(dict.fromkeys(ALIASES.get(value, value) for value in values))
        if any(metric not in METRICS for metric in metrics):
            raise ValueError("Choose supported metrics.")
        return metrics


class BranchTransition(BaseModel):
    action: Literal["resolve", "dissolve"]
    resolution: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=450)] | None = None


def _connect() -> sqlite3.Connection:
    path = Path(os.environ.get("ROOTTRACE_WORKSPACE_DB", DEFAULT_DB))
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(path, timeout=10)
    conn.row_factory = sqlite3.Row
    conn.execute("""
        CREATE TABLE IF NOT EXISTS workspace_branches (
            sequence INTEGER PRIMARY KEY,
            id TEXT NOT NULL UNIQUE,
            user_id TEXT NOT NULL,
            payload TEXT NOT NULL
        )
    """)
    conn.execute("CREATE INDEX IF NOT EXISTS workspace_branch_owner ON workspace_branches(user_id, sequence)")
    return conn


def _summary(branch_id: str, payload: dict, lane: int) -> dict:
    return {
        "id": branch_id, "title": payload["title"], "status": _status(payload),
        "branch_type": payload["branch_type"], "start_date": payload["start_date"],
        "end_date": payload.get("closed_date"), "lane": lane,
    }


def _status(payload: dict) -> str:
    return {"resolved": "concluded", "dissolved": "inconclusive"}.get(payload.get("lifecycle"), "open")


def workspace_branch(user_id: str, branch_id: str) -> dict | None:
    with closing(_connect()) as conn:
        row = conn.execute(
            "SELECT id, payload FROM workspace_branches WHERE user_id = ? AND id = ?",
            (user_id, branch_id),
        ).fetchone()
    return json.loads(row["payload"]) if row else None


def _detail(branch_id: str, payload: dict) -> dict:
    readings = []
    with store.connection() as conn:
        clock = store.clock
        end = min(payload["start_date"], clock.isoformat())
        hypotheses = workspace_hypotheses(conn, payload, clock)
        for metric in payload["metrics"]:
            rows = conn.execute(
                "SELECT id FROM observations WHERE metric = ? AND date <= ? AND is_excluded = 0 "
                "ORDER BY date DESC, id DESC LIMIT 2",
                (metric, end),
            )
            for row in rows:
                record = build_record(conn, row["id"], clock)
                reading = {key: record[key] for key in ("id", "date", "metric", "value", "device", "source_id")}
                reading["label"] = METRICS[metric].label(record["value"])
                readings.append(reading)
    return {
        "id": branch_id, "title": payload["title"], "branch_type": payload["branch_type"],
        "status": _status(payload), "start_date": payload["start_date"], "change_event": None,
        "hypotheses": hypotheses, "experiment": None, "evidence": readings,
    }


def _workspace_entries(user_id: str) -> list[tuple[str, dict]]:
    with closing(_connect()) as conn:
        rows = conn.execute(
            "SELECT id, payload FROM workspace_branches WHERE user_id = ? ORDER BY sequence", (user_id,)
        ).fetchall()
    return [(row["id"], json.loads(row["payload"])) for row in rows]


def _with_workspace(graph: dict, user_id: str) -> dict:
    for lane, (branch_id, payload) in enumerate(_workspace_entries(user_id), 2):
        lifecycle = payload.get("lifecycle")
        if lifecycle == "dissolved":
            continue
        graph["branches"].append(_summary(branch_id, payload, lane))
        if lifecycle == "resolved":
            graph["knowledge"].append({
                "id": f"kn_{branch_id}", "date": payload["closed_date"],
                "statement": payload["resolution"], "confidence": "user note",
            })
    graph["knowledge"].sort(key=lambda item: item["date"])
    return graph


@router.post("/branches", status_code=201)
def create_branch(body: BranchInput, user: User, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    payload = body.model_dump(mode="json")
    branch_id = f"br_custom_{uuid4().hex}"
    detail = _detail(branch_id, payload)
    with closing(_connect()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        total = conn.execute(
            "SELECT COUNT(*) FROM workspace_branches WHERE user_id = ?", (user.id,)
        ).fetchone()[0]
        conn.execute(
            "INSERT INTO workspace_branches (id, user_id, payload) VALUES (?, ?, ?)",
            (branch_id, user.id, json.dumps(payload, ensure_ascii=False)),
        )
    return {
        "branch": _summary(branch_id, payload, total + 2),
        "detail": detail,
    }


@router.get("/graph")
def workspace_graph(user: User, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return _with_workspace(demo_graph(), user.id)


@router.get("/branches/history")
def workspace_history(user: User, response: Response) -> list[dict]:
    response.headers["Cache-Control"] = "no-store"
    return _history(user.id)


def _history(user_id: str) -> list[dict]:
    return [
        {"id": branch_id, "title": payload["title"], "start_date": payload["start_date"],
         "branch_type": payload["branch_type"], "lifecycle": payload.get("lifecycle", "open"),
         "closed_date": payload.get("closed_date"), "resolution": payload.get("resolution")}
        for branch_id, payload in _workspace_entries(user_id)
    ]


@router.post("/branches/{branch_id}/transition")
def transition_branch(branch_id: str, body: BranchTransition, user: User, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    if body.action == "resolve" and not body.resolution:
        raise HTTPException(422, "Add a resolution note before merging into the timeline.")
    lifecycle = "resolved" if body.action == "resolve" else "dissolved"
    resolution = body.resolution if lifecycle == "resolved" else None
    with closing(_connect()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        row = conn.execute(
            "SELECT payload FROM workspace_branches WHERE user_id = ? AND id = ?", (user.id, branch_id),
        ).fetchone()
        if row is None:
            raise HTTPException(404, "Workspace branch not found.")
        payload = json.loads(row["payload"])
        previous = payload.get("lifecycle", "open")
        if previous != "open" and (previous != lifecycle or payload.get("resolution") != resolution):
            raise HTTPException(409, "This branch is already closed.")
        if previous == "open":
            payload.update(lifecycle=lifecycle, closed_date=max(store.clock.isoformat(), payload["start_date"]),
                           resolution=resolution)
            conn.execute(
                "UPDATE workspace_branches SET payload = ? WHERE user_id = ? AND id = ?",
                (json.dumps(payload, ensure_ascii=False), user.id, branch_id),
            )
    return {"detail": _detail(branch_id, payload), "graph": _with_workspace(demo_graph(), user.id),
            "history": _history(user.id)}


@router.get("/branches/{branch_id}")
def branch_detail(branch_id: str, user: User, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    if not branch_id.startswith("br_custom_"):
        return demo_branch(branch_id)
    payload = workspace_branch(user.id, branch_id)
    if payload is None:
        raise HTTPException(404, "Branch not found.")
    return _detail(branch_id, payload)


@router.post("/demo/advance")
def workspace_advance(body: AdvanceBody, user: User, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return _with_workspace(advance_demo(body), user.id)


@router.post("/demo/reset")
def workspace_reset(user: User, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return _with_workspace(reset_demo(), user.id)
