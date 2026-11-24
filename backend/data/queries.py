"""Build the API responses from SQLite, in exactly the shapes of contracts/sample_*.json.

Nothing after the demo clock is ever returned: the clock is "today".
"""

import sqlite3
from datetime import date

from backend.analysis.experiments import progress
from backend.analysis.series import iso, to_date
from backend.analysis.state import branch_patterns
from backend.data.db import loads
from backend.data.metrics import METRICS, TRUNK_METRICS, num


def build_graph(conn: sqlite3.Connection, clock: date, range_start: date) -> dict:
    clock_s = iso(clock)
    rows = conn.execute(
        "SELECT date, metric, value FROM observations"
        " WHERE is_excluded = 0 AND date <= ? AND metric IN ('sleep_min', 'steps', 'water_ml', 'headache')"
        " ORDER BY date",
        (clock_s,),
    ).fetchall()
    by_day: dict[str, dict] = {}
    for r in rows:
        by_day.setdefault(r["date"], {})[r["metric"]] = r["value"]
    trunk = [
        {
            "date": d,
            "sleep_min": int(v["sleep_min"]),
            "steps": int(v["steps"]),
            "water_ml": int(v["water_ml"]),
            "headache": bool(v["headache"]),
        }
        for d, v in by_day.items()
        if all(k in v for k in ("sleep_min", "steps", "water_ml", "headache"))
    ]
    placeholders = ",".join("?" * len(TRUNK_METRICS))
    change_events = [
        {
            "id": r["id"],
            "metric": r["metric"],
            "date": r["date"],
            "delta": int(r["delta"]),
            "label": r["label"],
            "record_ids": loads(r["record_ids"], []),
        }
        for r in conn.execute(
            f"SELECT * FROM change_events WHERE metric IN ({placeholders}) AND date <= ? ORDER BY date, id",
            (*TRUNK_METRICS, clock_s),
        )
    ]
    branches = [
        {
            "id": r["id"],
            "title": r["title"],
            "status": r["status"],
            "start_date": r["start_date"],
            "end_date": r["end_date"],
            "lane": int(r["lane"]),
        }
        for r in conn.execute("SELECT * FROM branches WHERE start_date <= ? ORDER BY start_date", (clock_s,))
    ]
    knowledge = [
        {"id": r["id"], "date": r["date"], "statement": r["statement"], "confidence": r["confidence"]}
        for r in conn.execute(
            "SELECT * FROM knowledge WHERE date <= ? AND invalidated_at IS NULL ORDER BY date, id", (clock_s,)
        )
    ]
    return {
        "range": {"start": iso(range_start), "end": clock_s},
        "trunk": trunk,
        "change_events": change_events,
        "branches": branches,
        "knowledge": knowledge,
    }


def build_experiment(conn: sqlite3.Connection, exp, clock: date, hypothesis_rank: int) -> dict:
    prog = progress(conn, exp, clock)
    return {
        "id": exp["id"],
        "hypothesis_rank": hypothesis_rank,
        "description": exp["description"],
        "start_date": exp["start_date"],
        "duration_days": int(exp["duration_days"]),
        "days_elapsed": prog["days_elapsed"],
        "adherence_pct": prog["adherence_pct"],
        "success_criterion": exp["success_criterion"],
        "locked": bool(exp["locked"]),
        "locked_at": exp["locked_at"],
        "status": exp["status"],
    }


def experiment_rank(conn: sqlite3.Connection, exp, clock: date) -> int:
    branch = conn.execute("SELECT * FROM branches WHERE id = ?", (exp["branch_id"],)).fetchone()
    for result in branch_patterns(conn, branch, clock):
        if result["hypothesis_id"] == exp["hypothesis_id"]:
            return result["rank"]
    return 1


def build_branch(conn: sqlite3.Connection, branch_id: str, clock: date) -> dict | None:
    branch = conn.execute("SELECT * FROM branches WHERE id = ? AND start_date <= ?", (branch_id, iso(clock))).fetchone()
    if branch is None:
        return None
    change_event = None
    if branch["change_event_id"]:
        ce = conn.execute("SELECT * FROM change_events WHERE id = ?", (branch["change_event_id"],)).fetchone()
        if ce:
            when = to_date(ce["date"]).strftime("%b %d").replace(" 0", " ")
            change_event = {"id": ce["id"], "label": f"{ce['label']} on {when}", "record_ids": loads(ce["record_ids"], [])}

    patterns = branch_patterns(conn, branch, clock)
    hyp_rows = {h["id"]: h for h in conn.execute("SELECT * FROM hypotheses WHERE branch_id = ?", (branch_id,))}
    hypotheses = [
        {
            "rank": p["rank"],
            "label": p["label"],
            "confidence": p["confidence"],
            "claims": p["claims"],
            "test": hyp_rows[p["hypothesis_id"]]["test"],
            "test_days": int(hyp_rows[p["hypothesis_id"]]["test_days"]),
        }
        for p in patterns
    ]
    rank_of = {p["hypothesis_id"]: p["rank"] for p in patterns}

    experiment = None
    exp = conn.execute("SELECT * FROM experiments WHERE branch_id = ? ORDER BY start_date DESC", (branch_id,)).fetchone()
    if exp:
        experiment = build_experiment(conn, exp, clock, rank_of.get(exp["hypothesis_id"], 1))

    evidence_rows = conn.execute(
        "SELECT DISTINCT o.* FROM evidence e JOIN observations o ON o.id = e.observation_id"
        " WHERE e.branch_id = ? AND o.date <= ? ORDER BY o.date DESC, o.metric LIMIT 20",
        (branch_id, iso(clock)),
    ).fetchall()
    evidence = [
        {
            "id": o["id"],
            "date": o["date"],
            "metric": o["metric"],
            "value": num(o["value"]),
            "label": METRICS[o["metric"]].label(o["value"]),
            "device": o["device"],
            "source_id": o["source_id"],
        }
        for o in sorted(evidence_rows, key=lambda o: (o["date"], o["metric"]))
    ]
    return {
        "id": branch["id"],
        "title": branch["title"],
        "status": branch["status"],
        "start_date": branch["start_date"],
        "change_event": change_event,
        "hypotheses": hypotheses,
        "experiment": experiment,
        "evidence": evidence,
    }


def build_record(conn: sqlite3.Connection, record_id: str, clock: date) -> dict | None:
    o = conn.execute("SELECT * FROM observations WHERE id = ? AND date <= ?", (record_id, iso(clock))).fetchone()
    if o is None:
        return None
    m = METRICS[o["metric"]]
    return {
        "id": o["id"],
        "metric": o["metric"],
        "value": num(o["value"]),
        "unit": o["unit"],
        "display": m.display(o["value"]),
        "date": o["date"],
        "time": o["time"],
        "device": o["device"],
        "source_id": o["source_id"],
        "source_file": o["source_file"],
        "data_quality": float(o["data_quality"]),
        "normalization": o["normalization"],
    }


def get_records(conn: sqlite3.Connection, record_ids: list[str], clock: date) -> list[dict]:
    """Several raw records at once (for the AI's get_records tool)."""
    return [r for r in (build_record(conn, rid, clock) for rid in record_ids) if r is not None]
