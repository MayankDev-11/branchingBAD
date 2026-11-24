"""Personal baselines: the 30-day rolling median and MAD of a metric."""

import sqlite3

from backend.analysis.series import days, iso, load_series, to_date

WINDOW_DAYS = 30
MIN_OBSERVATIONS = 7  # "no baseline under 7 observations"


def mad(values) -> float:
    """Median absolute deviation (unscaled)."""
    med = values.median()
    return float((values - med).abs().median())


def get_baseline(conn: sqlite3.Connection, metric: str, on_date, respect_changes: bool = True, clock=None) -> dict | None:
    """The user's normal for `metric` just before `on_date`.

    Uses the 30 days before `on_date` (never past the demo clock). When a change event for this
    metric started inside that window, only days since the change count ("the new normal").
    Returns None when there are fewer than 7 readings: "not enough data yet".
    """
    on = to_date(on_date)
    last = on - days(1)
    if clock is not None and to_date(clock) < last:
        last = to_date(clock)
    start = on - days(WINDOW_DAYS)
    if respect_changes:
        row = conn.execute(
            "SELECT MAX(date) AS d FROM change_events WHERE metric = ? AND date < ?",
            (metric, iso(on)),
        ).fetchone()
        if row and row["d"] and to_date(row["d"]) > start:
            start = to_date(row["d"])
    values, ids = load_series(conn, metric, start, last)
    if len(values) < MIN_OBSERVATIONS:
        return None
    return {
        "metric": metric,
        "date": iso(on),
        "window_start": iso(values.index.min()),
        "window_end": iso(values.index.max()),
        "median": round(float(values.median()), 1),
        "mad": round(mad(values), 1),
        "mean": round(float(values.mean()), 1),
        "n": int(len(values)),
        "record_ids": ids.tolist(),
    }
