"""Experiments: lock the success criterion, track progress, decide the result.

The result is decided here, in Python, by comparing the data with the locked criterion.
Never by the AI. Result values:
Criterion kinds: count_days (metric beats a threshold on at least N days), mean_above
(average beats a threshold), mean_change (average moved by at least N vs the frozen baseline).

  supported          the criterion was met
  not_supported      the criterion was not met
  insufficient_data  adherence under 70% or fewer than 7 days with data ("not enough data")
"""

import sqlite3
from datetime import datetime, timezone

from backend.analysis.baselines import get_baseline
from backend.analysis.patterns import find_patterns, fmt
from backend.analysis.series import OPS, days, iso, load_series, to_date
from backend.data.db import dumps, loads

MIN_ADHERENCE_PCT = 70
MIN_DAYS = 7


class ExperimentError(Exception):
    def __init__(self, status_code: int, detail: str):
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def window(exp) -> tuple:
    start = to_date(exp["start_date"])
    return start, start + days(int(exp["duration_days"]) - 1)


def branch_window(conn: sqlite3.Connection, branch, clock) -> tuple:
    """The period a branch's patterns are measured over: from its change event (or 30 days
    before the question) up to the day before its experiment starts (or the clock)."""
    clock = to_date(clock)
    start = to_date(branch["start_date"]) - days(30)
    if branch["change_event_id"]:
        ce = conn.execute("SELECT date FROM change_events WHERE id = ?", (branch["change_event_id"],)).fetchone()
        if ce:
            start = to_date(ce["date"])
    first = conn.execute("SELECT MIN(date) AS d FROM observations").fetchone()["d"]
    if first and to_date(first) > start:
        start = to_date(first)
    end = clock
    exp = conn.execute("SELECT start_date FROM experiments WHERE branch_id = ?", (branch["id"],)).fetchone()
    if exp and to_date(exp["start_date"]) <= clock:
        end = to_date(exp["start_date"]) - days(1)
    return start, max(start, end)


def progress(conn: sqlite3.Connection, exp, clock) -> dict:
    """Days elapsed and adherence so far (never looking past the clock)."""
    start, end = window(exp)
    last = min(to_date(clock), end)
    elapsed = max(0, (last - start).days + 1)
    rule = loads(exp["adherence_rule"])
    adherent = 0
    adherence_ids: list[str] = []
    if elapsed:
        vals, ids = load_series(conn, rule["metric"], start, last)
        ok = OPS[rule["op"]](vals, rule["threshold"])
        adherent = int(ok.sum())
        adherence_ids = ids[ok].tolist()
    return {
        "days_elapsed": elapsed,
        "adherent_days": adherent,
        "adherence_pct": int(round(100 * adherent / elapsed)) if elapsed else 0,
        "adherence_ids": adherence_ids,
    }


def evaluate(conn: sqlite3.Connection, exp, clock) -> dict:
    """Score a finished experiment against its locked criterion."""
    start, end = window(exp)
    crit = loads(exp["criterion"])
    baseline = loads(exp["frozen_baseline"], {})
    vals, ids = load_series(conn, crit["metric"], start, min(end, to_date(clock)))
    prog = progress(conn, exp, clock)
    out = {
        "days_with_data": int(len(vals)),
        "adherent_days": prog["adherent_days"],
        "adherence_pct": prog["adherence_pct"],
        "baseline_median": baseline.get("median"),
        "record_ids": ids.tolist(),
    }
    if len(vals):
        out["mean_during"] = round(float(vals.mean()), 1)
    if crit["kind"] == "count_days":
        meeting = OPS[crit["op"]](vals, crit["threshold"])
        out["days_meeting"] = int(meeting.sum())
        met = out["days_meeting"] >= crit["min_days"]
    elif crit["kind"] == "mean_above":
        met = bool(len(vals)) and out["mean_during"] > crit["threshold"]
    elif crit["kind"] == "mean_change":
        change = (out.get("mean_during", 0) - (baseline.get("median") or 0)) if len(vals) else 0
        out["change"] = round(change, 1)
        met = change >= crit["min_change"] if crit["min_change"] >= 0 else change <= crit["min_change"]
    else:
        raise ValueError(f"unknown criterion kind {crit['kind']!r}")

    if out["days_with_data"] < MIN_DAYS or out["adherence_pct"] < MIN_ADHERENCE_PCT:
        out["result"] = "insufficient_data"
    else:
        out["result"] = "supported" if met else "not_supported"
    return out


def lock_experiment(conn: sqlite3.Connection, exp_id: str, clock, locked_at: str | None = None):
    """Freeze the baseline and lock the criterion. The database trigger keeps it locked forever."""
    exp = conn.execute("SELECT * FROM experiments WHERE id = ?", (exp_id,)).fetchone()
    if exp is None:
        raise ExperimentError(404, f"Experiment '{exp_id}' not found")
    if exp["locked"]:
        return exp  # already locked: nothing changes
    start, _ = window(exp)
    if to_date(clock) >= start:
        raise ExperimentError(409, "The criterion must be locked before the experiment starts")
    crit = loads(exp["criterion"])
    baseline = get_baseline(conn, crit["metric"], start, clock=clock)
    if baseline is None:
        raise ExperimentError(409, "Not enough data yet for a baseline: log at least 7 days first")
    locked_at = locked_at or datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    conn.execute(
        "UPDATE experiments SET frozen_baseline = ?, locked = 1, locked_at = ?, status = 'active' WHERE id = ?",
        (dumps(baseline), locked_at, exp_id),
    )
    return conn.execute("SELECT * FROM experiments WHERE id = ?", (exp_id,)).fetchone()


def conclude_finished(conn: sqlite3.Connection, clock) -> list[str]:
    """Decide every locked experiment whose last day has passed; close its branch and save the lesson."""
    clock = to_date(clock)
    concluded = []
    rows = conn.execute("SELECT * FROM experiments WHERE locked = 1 AND status = 'active' ORDER BY start_date").fetchall()
    for exp in rows:
        start, end = window(exp)
        if clock < end:
            continue
        outcome = evaluate(conn, exp, clock)
        branch = conn.execute("SELECT * FROM branches WHERE id = ?", (exp["branch_id"],)).fetchone()
        outcome.update(_context(conn, exp, branch, clock, outcome))
        result = outcome["result"]
        conn.execute("UPDATE experiments SET status = ?, outcome = ? WHERE id = ?", (result, dumps(outcome), exp["id"]))

        when = iso(min(clock, end + days(1)))
        branch_status = "inconclusive" if result == "insufficient_data" else "concluded"
        conn.execute("UPDATE branches SET status = ?, end_date = ? WHERE id = ?", (branch_status, when, branch["id"]))
        template = loads(exp["knowledge_template"], {}).get(result)
        if template:
            n = conn.execute("SELECT COUNT(*) AS c FROM knowledge").fetchone()["c"]
            confidence = (
                "high" if result == "supported" and outcome["adherence_pct"] >= 85 and int(exp["duration_days"]) >= 10
                else "medium" if result == "supported" else "low"
            )
            conn.execute(
                "INSERT INTO knowledge (id, branch_id, experiment_id, date, statement, confidence, record_ids)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (f"kn_{n + 1}", branch["id"], exp["id"], when, template.format(**outcome), confidence,
                 dumps(outcome["record_ids"][:10])),
            )
        concluded.append(exp["id"])
    return concluded


def _context(conn, exp, branch, clock, outcome) -> dict:
    """Extra numbers the lesson's wording may use. All computed here."""
    start, end = window(exp)
    crit = loads(exp["criterion"])
    ctx = {"n_days": outcome["days_with_data"]}
    if "mean_during" in outcome:
        ctx["mean_during_fmt"] = fmt(crit["metric"], outcome["mean_during"])
    vals, _ = load_series(conn, branch["outcome_metric"], start - days(int(exp["duration_days"])), end)
    bad = OPS[branch["outcome_op"]](vals, branch["outcome_threshold"])
    ctx["bad_before"] = int(bad[vals.index < str(start)].sum())
    ctx["bad_during"] = int(bad[vals.index >= str(start)].sum())
    hyp = conn.execute("SELECT * FROM hypotheses WHERE id = ?", (exp["hypothesis_id"],)).fetchone()
    w_start, w_end = branch_window(conn, branch, clock)
    pattern = find_patterns(conn, dict(branch), [dict(hyp)], w_start, w_end)[0]
    if pattern["effect"] is not None:
        ctx["effect_round5"] = int(5 * round(abs(pattern["effect"]) / 5))
    return ctx
