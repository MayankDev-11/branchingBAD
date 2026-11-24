"""Bring derived data up to date with the demo clock.

Run after the clock moves: recompute change events, decide experiments that just ended,
and refresh each branch's evidence links.
"""

import sqlite3

from backend.analysis.change_detection import refresh_change_events
from backend.analysis.experiments import branch_window, conclude_finished
from backend.analysis.patterns import find_patterns
from backend.analysis.series import OPS, load_series


def branch_patterns(conn: sqlite3.Connection, branch, clock) -> list[dict]:
    hyps = [dict(h) for h in conn.execute("SELECT * FROM hypotheses WHERE branch_id = ? ORDER BY id", (branch["id"],))]
    start, end = branch_window(conn, branch, clock)
    return find_patterns(conn, dict(branch), hyps, start, end)


def refresh_evidence(conn: sqlite3.Connection, clock) -> None:
    """Evidence = the bad days themselves, plus the readings of the top two explanations on those days."""
    conn.execute("DELETE FROM evidence")
    for branch in conn.execute("SELECT * FROM branches").fetchall():
        start, end = branch_window(conn, branch, clock)
        vals, ids = load_series(conn, branch["outcome_metric"], start, end)
        bad_ids = ids[OPS[branch["outcome_op"]](vals, branch["outcome_threshold"])].tolist()
        rows = [(branch["id"], None, oid, "supporting") for oid in bad_ids]
        for result in branch_patterns(conn, branch, clock)[:2]:
            rows += [(branch["id"], result["hypothesis_id"], oid, "supporting") for oid in result["supporting_ids"]]
            rows += [(branch["id"], result["hypothesis_id"], oid, "counterexample") for oid in result["counterexample_ids"]]
        conn.executemany(
            "INSERT OR IGNORE INTO evidence (branch_id, hypothesis_id, observation_id, relation) VALUES (?, ?, ?, ?)",
            rows,
        )


def refresh_state(conn: sqlite3.Connection, clock) -> None:
    refresh_change_events(conn, clock)
    conclude_finished(conn, clock)
    refresh_evidence(conn, clock)
