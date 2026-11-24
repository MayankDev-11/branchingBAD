"""Rules 5 and 6 are enforced by SQLite triggers, not just by the API."""

import sqlite3

import pytest

from backend.data.db import connect, init_schema

TABLES = {
    "source_records", "observations", "notes", "change_events", "branches",
    "hypotheses", "experiments", "evidence", "knowledge",
}


def test_schema_has_the_nine_tables():
    conn = connect(":memory:")
    init_schema(conn)
    names = {r["name"] for r in conn.execute("SELECT name FROM sqlite_master WHERE type = 'table'")}
    assert TABLES <= names
    assert len(names - {"sqlite_sequence"}) == 9


def test_schema_is_idempotent():
    conn = connect(":memory:")
    init_schema(conn)
    init_schema(conn)


# Rule 5: observations are never edited --------------------------------------------------

def test_observation_value_cannot_be_edited(demo_conn):
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        demo_conn.execute("UPDATE observations SET value = 480 WHERE id = 'sl_0071'")


@pytest.mark.parametrize("column, value", [("date", "2026-01-01"), ("metric", "steps"), ("device", "Fake"), ("data_quality", 1.0)])
def test_no_observation_field_can_be_edited(demo_conn, column, value):
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        demo_conn.execute(f"UPDATE observations SET {column} = ? WHERE id = 'sl_0071'", (value,))


def test_observation_can_be_excluded_with_a_reason(demo_conn):
    demo_conn.execute("SAVEPOINT s")
    demo_conn.execute(
        "UPDATE observations SET is_excluded = 1, exclusion_reason = 'watch was off the wrist' WHERE id = 'sl_0010'"
    )
    row = demo_conn.execute("SELECT value, is_excluded, exclusion_reason FROM observations WHERE id = 'sl_0010'").fetchone()
    assert row["is_excluded"] == 1 and row["exclusion_reason"] == "watch was off the wrist"
    demo_conn.execute("ROLLBACK TO s")


def test_exclusion_needs_a_reason(demo_conn):
    with pytest.raises(sqlite3.IntegrityError):
        demo_conn.execute("UPDATE observations SET is_excluded = 1 WHERE id = 'sl_0010'")


def test_raw_source_records_cannot_be_edited(demo_conn):
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        demo_conn.execute("UPDATE source_records SET raw_value = '999' WHERE rowid = 1")


# Rule 6: a locked success criterion never changes -------------------------------------

@pytest.mark.parametrize(
    "assignment",
    [
        "success_criterion = 'Sleep must exceed 6 hours on 1 of 10 nights'",
        "criterion = '{}'",
        "adherence_rule = '{}'",
        "frozen_baseline = '{}'",
        "start_date = '2026-11-20'",
        "duration_days = 3",
        "locked = 0",
        "locked_at = '2026-11-19T00:00:00Z'",
    ],
)
def test_locked_experiment_cannot_change(demo_conn, assignment):
    with pytest.raises(sqlite3.IntegrityError, match="locked"):
        demo_conn.execute(f"UPDATE experiments SET {assignment} WHERE id = 'exp_1'")


def test_locked_experiment_cannot_be_deleted(demo_conn):
    with pytest.raises(sqlite3.IntegrityError, match="locked"):
        demo_conn.execute("DELETE FROM experiments WHERE id = 'exp_1'")


def test_locked_experiment_can_still_record_its_result(demo_conn):
    demo_conn.execute("SAVEPOINT s")
    demo_conn.execute("UPDATE experiments SET status = 'supported', outcome = '{}' WHERE id = 'exp_1'")
    demo_conn.execute("ROLLBACK TO s")


def test_cannot_lock_without_a_frozen_baseline(demo_conn):
    demo_conn.execute("SAVEPOINT s")
    demo_conn.execute(
        "INSERT INTO experiments (id, branch_id, hypothesis_id, description, start_date, duration_days,"
        " success_criterion, criterion, adherence_rule, knowledge_template)"
        " VALUES ('exp_t', 'br_1', 'hy_12', 'Drink 2 L', '2026-12-01', 10, 'x', '{}', '{}', '{}')"
    )
    with pytest.raises(sqlite3.IntegrityError, match="frozen baseline"):
        demo_conn.execute("UPDATE experiments SET locked = 1 WHERE id = 'exp_t'")
    demo_conn.execute("ROLLBACK TO s")


def test_draft_experiment_can_still_be_edited(demo_conn):
    demo_conn.execute("SAVEPOINT s")
    demo_conn.execute(
        "INSERT INTO experiments (id, branch_id, hypothesis_id, description, start_date, duration_days,"
        " success_criterion, criterion, adherence_rule, knowledge_template)"
        " VALUES ('exp_t', 'br_1', 'hy_12', 'Drink 2 L', '2026-12-01', 10, 'x', '{}', '{}', '{}')"
    )
    demo_conn.execute("UPDATE experiments SET success_criterion = 'y' WHERE id = 'exp_t'")
    demo_conn.execute("ROLLBACK TO s")
