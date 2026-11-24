"""GET /api/insights: every number on the Insights, Profile and Data & help pages.

Rule 9: the frontend shows these numbers as they are and never invents its own.
Nothing after the demo clock is used.
"""

import sqlite3
from collections import defaultdict
from datetime import date

import pandas as pd

from backend.analysis.baselines import get_baseline
from backend.analysis.change_detection import K_MADS, MAD_SCALE, POST_WINDOW_DAYS
from backend.analysis.experiments import progress, window
from backend.analysis.series import OPS, days, iso, load_series, to_date
from backend.analysis.state import branch_patterns
from backend.data.db import loads
from backend.data.metrics import METRICS, num

CHART_DAYS = 28                      # days shown on the sleep chart and the scatter plot
CHART_METRICS = ("sleep_min", "water_ml", "screen_late_min", "headache")
COVERAGE_METRICS = ("sleep_min", "steps", "screen_late_min", "water_ml", "headache", "caffeine_pm", "lights_out", "mood")


def _change_event(conn: sqlite3.Connection, clock: date):
    return conn.execute(
        "SELECT * FROM change_events WHERE metric = 'sleep_min' AND date <= ? ORDER BY date DESC, id LIMIT 1",
        (iso(clock),),
    ).fetchone()


def _days(conn: sqlite3.Connection, start: date, clock: date) -> list[dict]:
    """One row per day: each chart metric's value and its record id (None when not logged)."""
    placeholders = ",".join("?" * len(CHART_METRICS))
    by_day: dict[str, dict] = defaultdict(dict)
    for r in conn.execute(
        f"SELECT id, date, metric, value FROM observations WHERE is_excluded = 0 AND date BETWEEN ? AND ?"
        f" AND metric IN ({placeholders}) ORDER BY date",
        (iso(start), iso(clock), *CHART_METRICS),
    ):
        by_day[r["date"]][r["metric"]] = (r["value"], r["id"])
    out = []
    for d in sorted(by_day):
        v = by_day[d]
        row = {"date": d}
        for metric, key in (("sleep_min", "sleep"), ("water_ml", "water"), ("screen_late_min", "screen"), ("headache", "headache")):
            value, rid = v.get(metric, (None, None))
            row[key] = None if value is None else (bool(value) if metric == "headache" else num(value))
            row[f"{key}_id"] = rid
        out.append(row)
    return out


def _sleep_shift(conn: sqlite3.Connection, ce, clock: date) -> dict | None:
    if ce is None:
        return None
    before = float(ce["baseline_median"])
    base = get_baseline(conn, "sleep_min", ce["date"], respect_changes=False, clock=clock)
    # The "normal range" is exactly what the change detector treats as normal:
    # the 30-day median ± 2 scaled MADs. Nights below it are the ones that get flagged.
    half_width = K_MADS * MAD_SCALE * base["mad"] if base else None
    return {
        "change_event_id": ce["id"],
        "date": ce["date"],
        "delta_min": int(ce["delta"]),
        # Rounded once, so before − after always shows the same minutes as delta_min.
        "before_median_min": int(round(before)),
        "after_median_min": int(round(before)) + int(ce["delta"]),
        "post_window_days": POST_WINDOW_DAYS,
        "normal_low_min": None if base is None else int(round(base["median"] - half_width)),
        "normal_high_min": None if base is None else int(round(base["median"] + half_width)),
        "normal_median_min": None if base is None else num(round(base["median"])),
        "baseline_days": None if base is None else base["n"],
        "record_ids": loads(ce["record_ids"], [])[:6],
    }


def _screen_weeks(conn: sqlite3.Connection, start: date, clock: date, change_date: str | None) -> dict:
    """Average late screen minutes per week, plus before vs since the sleep change."""
    vals, _ = load_series(conn, "screen_late_min", start, clock)
    weeks = []
    week_start = start
    while week_start <= clock:
        week_end = min(clock, week_start + days(6))
        chunk = vals[(vals.index >= pd.Timestamp(week_start)) & (vals.index <= pd.Timestamp(week_end))]
        if len(chunk):
            weeks.append({"week_start": iso(week_start), "avg_min": int(round(float(chunk.mean()))), "days": int(len(chunk))})
        week_start += days(7)
    out = {"weeks": weeks, "before_avg_min": None, "after_avg_min": None}
    if change_date:
        split = pd.Timestamp(change_date)
        before, after = vals[vals.index < split], vals[vals.index >= split]
        if len(before):
            out["before_avg_min"] = int(round(float(before.mean())))
        if len(after):
            out["after_avg_min"] = int(round(float(after.mean())))
    return out


def _hypotheses(conn: sqlite3.Connection, clock: date) -> list[dict]:
    out = []
    rows = {r["id"]: r for r in conn.execute("SELECT * FROM hypotheses")}
    for branch in conn.execute("SELECT * FROM branches WHERE start_date <= ? ORDER BY start_date", (iso(clock),)):
        for p in branch_patterns(conn, branch, clock):
            first = p["claims"][0] if p["claims"] else None
            h = rows[p["hypothesis_id"]]
            out.append({
                "branch_id": branch["id"],
                "branch_title": branch["title"],
                "rank": p["rank"],
                "label": p["label"],
                # The exposure rule Python tests ("sleep_min < 360"), so charts draw the same line.
                "metric": h["metric"],
                "op": h["op"],
                "threshold": num(h["threshold"]),
                "exposure_text": h["exposure_text"],
                "confidence": p["confidence"],
                "k": p.get("k"), "n": p.get("n"), "j": p.get("j"), "m": p.get("m"),
                "claim": first["text"] if first else "Not enough data yet",
                "record_ids": (first["record_ids"] if first else [])[:6],
            })
    return out


def _experiment(conn: sqlite3.Connection, clock: date) -> dict | None:
    exp = conn.execute(
        "SELECT * FROM experiments WHERE locked = 1 AND start_date <= ? ORDER BY start_date DESC LIMIT 1", (iso(clock),)
    ).fetchone()
    if exp is None:
        return None
    start, end = window(exp)
    crit = loads(exp["criterion"])
    vals, ids = load_series(conn, crit["metric"], start, min(end, clock))
    nights = []
    for i in range(int(exp["duration_days"])):
        d = iso(start + days(i))
        ts = pd.Timestamp(d)
        if ts in vals.index:
            value = float(vals[ts])
            # count_days criteria name their own comparison; mean_above means "above the threshold".
            hit = bool(OPS[crit["op"]](value, crit["threshold"])) if "op" in crit else value > crit["threshold"]
            nights.append({"date": d, "value": num(value), "record_id": ids[ts], "met": hit})
        else:
            nights.append({"date": d, "value": None, "record_id": None, "met": None})
    prog = progress(conn, exp, clock)
    return {
        "id": exp["id"],
        "branch_id": exp["branch_id"],
        "description": exp["description"],
        "success_criterion": exp["success_criterion"],
        "metric": crit["metric"],
        "threshold": crit["threshold"],
        "min_days": crit.get("min_days"),
        "duration_days": int(exp["duration_days"]),
        "days_elapsed": prog["days_elapsed"],
        "adherence_pct": prog["adherence_pct"],
        "status": exp["status"],
        "nights": nights,
        "nights_met": sum(1 for n in nights if n["met"]),
        "nights_logged": sum(1 for n in nights if n["met"] is not None),
    }


def _coverage(conn: sqlite3.Connection, range_start: date, clock: date) -> dict:
    n_days = (clock - range_start).days + 1
    metrics = []
    for metric in COVERAGE_METRICS:
        row = conn.execute(
            "SELECT COUNT(*) AS c, COUNT(DISTINCT date) AS d FROM observations WHERE metric = ? AND date <= ?",
            (metric, iso(clock)),
        ).fetchone()
        if row["c"]:
            metrics.append({
                "metric": metric,
                "title": METRICS[metric].title,
                "count": int(row["c"]),
                "coverage_pct": int(round(100 * row["d"] / n_days)),
            })
    sources = [
        {"source_file": r["source_file"], "device": r["device"], "count": int(r["c"])}
        for r in conn.execute(
            "SELECT source_file, device, COUNT(*) AS c FROM observations WHERE date <= ?"
            " GROUP BY source_file, device ORDER BY c DESC",
            (iso(clock),),
        )
    ]
    weekly = []
    week_start = range_start
    while week_start <= clock:
        week_end = min(clock, week_start + days(6))
        rows = conn.execute(
            "SELECT source_file, COUNT(*) AS c FROM observations WHERE date BETWEEN ? AND ? GROUP BY source_file",
            (iso(week_start), iso(week_end)),
        ).fetchall()
        by_file = {r["source_file"]: int(r["c"]) for r in rows}
        weekly.append({
            "week_start": iso(week_start),
            "apple_health": by_file.get("apple_health_export.xml", 0),
            "other": sum(c for f, c in by_file.items() if f != "apple_health_export.xml"),
        })
        week_start += days(7)
    total = conn.execute("SELECT COUNT(*) AS c FROM observations WHERE date <= ?", (iso(clock),)).fetchone()["c"]
    excluded = conn.execute(
        "SELECT COUNT(*) AS c FROM observations WHERE is_excluded = 1 AND date <= ?", (iso(clock),)
    ).fetchone()["c"]
    return {
        "total_observations": int(total),
        "excluded": int(excluded),
        "days": n_days,
        "metrics": metrics,
        "sources": sources,
        "weekly": weekly,
    }


def build_insights(conn: sqlite3.Connection, clock, range_start) -> dict:
    clock, range_start = to_date(clock), to_date(range_start)
    ce = _change_event(conn, clock)
    knowledge = conn.execute(
        "SELECT COUNT(*) AS c FROM knowledge WHERE date <= ? AND invalidated_at IS NULL", (iso(clock),)
    ).fetchone()["c"]
    return {
        "as_of": iso(clock),
        "sleep_shift": _sleep_shift(conn, ce, clock),
        "days": _days(conn, max(range_start, clock - days(CHART_DAYS - 1)), clock),
        "screen": _screen_weeks(conn, range_start, clock, ce["date"] if ce else None),
        "hypotheses": _hypotheses(conn, clock),
        "experiment": _experiment(conn, clock),
        "knowledge_count": int(knowledge),
        "coverage": _coverage(conn, range_start, clock),
    }
