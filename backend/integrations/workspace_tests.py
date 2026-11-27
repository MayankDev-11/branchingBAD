"""Lock and evaluate user-approved comparisons using local daily check-ins."""

import json
import sqlite3
from contextlib import closing
from datetime import date
from fractions import Fraction
from typing import Annotated, Literal
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StrictBool

from backend.ai.knowledge_catalog import TOPICS, URINARY
from backend.auth.dependencies import CurrentUser, get_current_user
from backend.integrations.branch_evidence import workspace_outcome, workspace_test_questions
from backend.privacy.questions import is_red_flag

router = APIRouter(prefix="/api/branches", tags=["workspace tests"])
User = Annotated[CurrentUser, Depends(get_current_user)]
MINIMUM_DAYS = 7
MINIMUM_DAYS_PER_GROUP = 3
THRESHOLD_POINTS = 10


class StartTest(BaseModel):
    rank: int = Field(ge=1)
    expected_factor: str | None = Field(default=None, max_length=300)


class CheckIn(BaseModel):
    date: date
    exposed: StrictBool
    outcome: StrictBool


class TestCounts(BaseModel):
    exposed_days: int
    unexposed_days: int
    exposed_outcomes: int
    unexposed_outcomes: int


class TestResult(BaseModel):
    direction: Literal["supported", "weakened", "inconclusive"]
    difference_points: float
    exposed_rate: float
    unexposed_rate: float
    summary: str


class WorkspaceTest(BaseModel):
    id: str
    branch_id: str
    rank: int
    factor: str
    factor_question: str
    outcome_label: str
    outcome_question: str
    plan: str
    start_date: date
    latest_date: date
    status: Literal["active", "completed", "cancelled"]
    check_ins: list[CheckIn]
    minimum_days: int
    minimum_days_per_group: int
    threshold_points: int
    counts: TestCounts
    can_finish: bool
    result: TestResult | None
    finished_date: date | None


class TestProposal(BaseModel):
    rank: int
    factor: str
    factor_question: str
    outcome_question: str
    plan: str


class TestProtocol(BaseModel):
    minimum_days: int
    minimum_days_per_group: int
    threshold_points: int
    proposals: list[TestProposal]


SCHEMA = """
    CREATE TABLE IF NOT EXISTS workspace_experiment_tests (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        branch_id TEXT NOT NULL REFERENCES workspace_branches(id),
        hypothesis_rank INTEGER NOT NULL,
        factor TEXT NOT NULL,
        factor_question TEXT NOT NULL,
        outcome_label TEXT NOT NULL,
        outcome_question TEXT NOT NULL,
        plan TEXT NOT NULL,
        start_date TEXT NOT NULL,
        minimum_days INTEGER NOT NULL,
        minimum_days_per_group INTEGER NOT NULL,
        threshold_points INTEGER NOT NULL,
        finished_date TEXT,
        result TEXT,
        CHECK (result IS NULL OR finished_date IS NOT NULL)
    );
    CREATE INDEX IF NOT EXISTS workspace_experiment_tests_branch
        ON workspace_experiment_tests (user_id, branch_id);
    CREATE UNIQUE INDEX IF NOT EXISTS workspace_experiment_tests_one_active
        ON workspace_experiment_tests (user_id, branch_id) WHERE finished_date IS NULL;

    CREATE TABLE IF NOT EXISTS workspace_experiment_check_ins (
        test_id TEXT NOT NULL REFERENCES workspace_experiment_tests(id),
        date TEXT NOT NULL,
        exposed INTEGER NOT NULL CHECK (exposed IN (0, 1)),
        outcome INTEGER NOT NULL CHECK (outcome IN (0, 1)),
        PRIMARY KEY (test_id, date)
    );

    CREATE TRIGGER IF NOT EXISTS workspace_test_lock_plan
        BEFORE UPDATE OF id, user_id, branch_id, hypothesis_rank, factor, factor_question,
            outcome_label, outcome_question, plan, start_date, minimum_days,
            minimum_days_per_group, threshold_points ON workspace_experiment_tests
        BEGIN SELECT RAISE(ABORT, 'Workspace test plan is locked'); END;
    CREATE TRIGGER IF NOT EXISTS workspace_test_lock_result
        BEFORE UPDATE OF finished_date, result ON workspace_experiment_tests
        WHEN OLD.finished_date IS NOT NULL
        BEGIN SELECT RAISE(ABORT, 'Workspace test result is locked'); END;
    CREATE TRIGGER IF NOT EXISTS workspace_test_lock_check_in
        BEFORE UPDATE ON workspace_experiment_check_ins
        BEGIN SELECT RAISE(ABORT, 'Workspace check-in is locked'); END;
"""


def _today() -> date:
    return date.today()


def _connection() -> sqlite3.Connection:
    # The workspace router can include this router without a module import cycle.
    from backend.integrations.branches import _connect

    conn = _connect()
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        initialized = conn.execute(
            "SELECT 1 FROM sqlite_schema WHERE type = 'trigger' AND name = 'workspace_test_lock_check_in'"
        ).fetchone()
        if initialized is None:
            conn.executescript("BEGIN IMMEDIATE;\n" + SCHEMA + "\nCOMMIT;")
    except BaseException:
        conn.close()
        raise
    return conn


def _active_test(conn: sqlite3.Connection, user_id: str, branch_id: str) -> sqlite3.Row | None:
    return conn.execute(
        "SELECT * FROM workspace_experiment_tests WHERE user_id = ? AND branch_id = ? AND finished_date IS NULL",
        (user_id, branch_id),
    ).fetchone()


def has_active_workspace_test(conn: sqlite3.Connection, user_id: str, branch_id: str) -> bool:
    """Check for a locked plan in an existing workspace transaction."""
    table = conn.execute(
        "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = 'workspace_experiment_tests'"
    ).fetchone()
    return table is not None and _active_test(conn, user_id, branch_id) is not None


def cancel_active_workspace_test(conn: sqlite3.Connection, user_id: str, branch_id: str) -> None:
    """Archive an unfinished test in the workspace branch closure transaction."""
    if has_active_workspace_test(conn, user_id, branch_id):
        conn.execute(
            "UPDATE workspace_experiment_tests SET finished_date = ? "
            "WHERE user_id = ? AND branch_id = ? AND finished_date IS NULL",
            (_today().isoformat(), user_id, branch_id),
        )


def _branch_payload(conn: sqlite3.Connection, user_id: str, branch_id: str, *, write: bool = False) -> dict:
    row = conn.execute(
        "SELECT payload FROM workspace_branches WHERE user_id = ? AND id = ?", (user_id, branch_id),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Workspace branch not found.")
    payload = json.loads(row["payload"])
    if write and payload.get("lifecycle", "open") != "open":
        raise HTTPException(409, "This branch is closed. Its tests are read-only.")
    return payload


def _test_row(conn: sqlite3.Connection, user_id: str, branch_id: str, test_id: str) -> sqlite3.Row:
    row = conn.execute(
        "SELECT * FROM workspace_experiment_tests WHERE user_id = ? AND branch_id = ? AND id = ?",
        (user_id, branch_id, test_id),
    ).fetchone()
    if row is None:
        raise HTTPException(404, "Workspace test not found.")
    return row


def _counts(check_ins: list[CheckIn]) -> TestCounts:
    return TestCounts(
        exposed_days=sum(item.exposed for item in check_ins),
        unexposed_days=sum(not item.exposed for item in check_ins),
        exposed_outcomes=sum(item.exposed and item.outcome for item in check_ins),
        unexposed_outcomes=sum(not item.exposed and item.outcome for item in check_ins),
    )


def _view(conn: sqlite3.Connection, row: sqlite3.Row, today: date, *, branch_open: bool = True) -> WorkspaceTest:
    inputs = conn.execute(
        "SELECT date, exposed, outcome FROM workspace_experiment_check_ins WHERE test_id = ? ORDER BY date",
        (row["id"],),
    ).fetchall()
    check_ins = [CheckIn(date=record["date"], exposed=bool(record["exposed"]), outcome=bool(record["outcome"]))
                 for record in inputs]
    counts = _counts(check_ins)
    result = TestResult.model_validate_json(row["result"]) if row["result"] else None
    status = "active" if row["finished_date"] is None else "completed" if result else "cancelled"
    has_enough_days = (
        len(check_ins) >= row["minimum_days"]
        and min(counts.exposed_days, counts.unexposed_days) >= row["minimum_days_per_group"]
    )
    return WorkspaceTest(
        id=row["id"], branch_id=row["branch_id"], rank=row["hypothesis_rank"], factor=row["factor"],
        factor_question=row["factor_question"], outcome_label=row["outcome_label"],
        outcome_question=row["outcome_question"], plan=row["plan"], start_date=row["start_date"],
        latest_date=today, status=status, check_ins=check_ins, counts=counts,
        minimum_days=row["minimum_days"], minimum_days_per_group=row["minimum_days_per_group"],
        threshold_points=row["threshold_points"], can_finish=branch_open and status == "active" and has_enough_days,
        result=result, finished_date=row["finished_date"],
    )


def _compare(counts: TestCounts, threshold: int) -> TestResult:
    exposed = Fraction(counts.exposed_outcomes * 100, counts.exposed_days)
    unexposed = Fraction(counts.unexposed_outcomes * 100, counts.unexposed_days)
    diff = exposed - unexposed
    if diff >= threshold:
        direction = "supported"
        explanation = "The outcome was more common on days with the factor."
    elif diff <= -threshold:
        direction = "weakened"
        explanation = "The outcome was less common on days with the factor."
    else:
        direction = "inconclusive"
        explanation = "The difference was smaller than the locked comparison threshold."
    return TestResult(
        direction=direction,
        difference_points=float(round(diff, 1)),
        exposed_rate=float(round(exposed, 1)),
        unexposed_rate=float(round(unexposed, 1)),
        summary=f"{explanation} These check-ins describe an association. Other factors could explain the difference.",
    )


def _proposals(branch_id: str, payload: dict, outcome: str) -> list[TestProposal]:
    from backend.integrations.branches import _detail

    if (payload.get("lifecycle", "open") != "open" or payload["branch_type"] != "investigation"
            or outcome not in TOPICS or outcome == URINARY or is_red_flag(payload["title"])):
        return []
    proposals = []
    for hypothesis in _detail(branch_id, payload)["hypotheses"]:
        questions = workspace_test_questions(payload, hypothesis)
        if questions and hypothesis.get("test"):
            factor_question, outcome_question = questions
            proposals.append(TestProposal(
                rank=hypothesis["rank"], factor=hypothesis["label"], plan=hypothesis["test"],
                factor_question=factor_question, outcome_question=outcome_question,
            ))
    return proposals


@router.get("/{branch_id}/tests", response_model=list[WorkspaceTest])
def list_workspace_tests(branch_id: str, user: User) -> list[WorkspaceTest]:
    today = _today()
    with closing(_connection()) as conn, conn:
        conn.execute("BEGIN")
        payload = _branch_payload(conn, user.id, branch_id)
        rows = conn.execute(
            "SELECT * FROM workspace_experiment_tests WHERE user_id = ? AND branch_id = ? ORDER BY rowid DESC",
            (user.id, branch_id),
        ).fetchall()
        return [_view(conn, row, today, branch_open=payload.get("lifecycle", "open") == "open") for row in rows]


@router.get("/{branch_id}/tests/protocol", response_model=TestProtocol)
def workspace_test_protocol(branch_id: str, user: User) -> TestProtocol:
    with closing(_connection()) as conn:
        payload = _branch_payload(conn, user.id, branch_id)
    return TestProtocol(
        minimum_days=MINIMUM_DAYS, minimum_days_per_group=MINIMUM_DAYS_PER_GROUP,
        threshold_points=THRESHOLD_POINTS, proposals=_proposals(branch_id, payload, workspace_outcome(payload)),
    )


@router.post("/{branch_id}/tests", response_model=WorkspaceTest)
def start_workspace_test(branch_id: str, body: StartTest, user: User) -> WorkspaceTest:
    today = _today()
    with closing(_connection()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        payload = _branch_payload(conn, user.id, branch_id, write=True)
        active = _active_test(conn, user.id, branch_id)
        if active is not None:
            if active["hypothesis_rank"] == body.rank and body.expected_factor in (None, active["factor"]):
                return _view(conn, active, today)
            raise HTTPException(409, "Finish or cancel the active test before starting another one.")
        outcome = workspace_outcome(payload)
        proposal = next((item for item in _proposals(branch_id, payload, outcome) if item.rank == body.rank), None)
        if proposal is None:
            raise HTTPException(422, "Choose a current hypothesis with measurable factor and outcome questions.")
        if body.expected_factor not in (None, proposal.factor):
            raise HTTPException(409, "The hypothesis changed. Refresh the branch and review the proposed test again.")
        test_id = f"wtest_{uuid4().hex}"
        conn.execute("""
            INSERT INTO workspace_experiment_tests (
                id, user_id, branch_id, hypothesis_rank, factor, factor_question, outcome_label,
                outcome_question, plan, start_date, minimum_days, minimum_days_per_group, threshold_points
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (test_id, user.id, branch_id, proposal.rank, proposal.factor, proposal.factor_question, TOPICS[outcome].label,
              proposal.outcome_question, proposal.plan, today.isoformat(), MINIMUM_DAYS,
              MINIMUM_DAYS_PER_GROUP, THRESHOLD_POINTS))
        return _view(conn, _test_row(conn, user.id, branch_id, test_id), today)


@router.post("/{branch_id}/tests/{test_id}/check-ins", response_model=WorkspaceTest)
def save_workspace_check_in(branch_id: str, test_id: str, body: CheckIn, user: User) -> WorkspaceTest:
    today = _today()
    day = body.date.isoformat()
    with closing(_connection()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        _branch_payload(conn, user.id, branch_id, write=True)
        row = _test_row(conn, user.id, branch_id, test_id)
        if day < row["start_date"] or body.date > today:
            raise HTTPException(422, "Choose a date from the start of this test through today.")
        existing = conn.execute(
            "SELECT exposed, outcome FROM workspace_experiment_check_ins WHERE test_id = ? AND date = ?",
            (test_id, day),
        ).fetchone()
        if existing is not None:
            if (existing["exposed"], existing["outcome"]) == (body.exposed, body.outcome):
                return _view(conn, row, today)
            raise HTTPException(409, "A check-in for that date is already saved. Choose another date.")
        if row["finished_date"] is not None:
            raise HTTPException(409, "This test is closed. Its check-ins are read-only.")
        conn.execute(
            "INSERT INTO workspace_experiment_check_ins (test_id, date, exposed, outcome) VALUES (?, ?, ?, ?)",
            (test_id, day, body.exposed, body.outcome),
        )
        return _view(conn, row, today)


@router.post("/{branch_id}/tests/{test_id}/finish", response_model=WorkspaceTest)
def finish_workspace_test(branch_id: str, test_id: str, user: User) -> WorkspaceTest:
    return _close_workspace_test(branch_id, test_id, user.id, cancel=False)


@router.post("/{branch_id}/tests/{test_id}/cancel", response_model=WorkspaceTest)
def cancel_workspace_test(branch_id: str, test_id: str, user: User) -> WorkspaceTest:
    return _close_workspace_test(branch_id, test_id, user.id, cancel=True)


def _close_workspace_test(branch_id: str, test_id: str, user_id: str, *, cancel: bool) -> WorkspaceTest:
    today = _today()
    with closing(_connection()) as conn, conn:
        conn.execute("BEGIN IMMEDIATE")
        _branch_payload(conn, user_id, branch_id, write=True)
        row = _test_row(conn, user_id, branch_id, test_id)
        test = _view(conn, row, today)
        if test.status != "active":
            if (test.status == "cancelled") == cancel:
                return test
            raise HTTPException(409, "This test is already closed.")
        if not cancel and not test.can_finish:
            raise HTTPException(409, f"Log at least {test.minimum_days} days with {test.minimum_days_per_group} days in each group before comparing results.")
        result = None if cancel else _compare(test.counts, test.threshold_points).model_dump_json()
        conn.execute("UPDATE workspace_experiment_tests SET finished_date = ?, result = ? WHERE id = ?",
                     (today.isoformat(), result, test_id))
        return _view(conn, _test_row(conn, user_id, branch_id, test_id), today)
