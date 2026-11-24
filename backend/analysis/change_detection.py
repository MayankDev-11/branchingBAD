"""Change detection.

A day is "flagged" when it sits more than 2 MADs from the median of the 30 days before it.
The MAD is scaled by 1.4826 so it matches a standard deviation on normal data; the raw MAD
flagged about 1 day in 6 of pure noise and raised false alarms in tests.
A change fires when at least 5 of the last 7 days are flagged in the same direction.
ruptures (PELT) then pins the day the new level started, and a 14-day cooldown per metric
stops repeat alarms. After a change, the baseline only uses days since the change, so a
level that "stays there" is treated as the new normal instead of alarming again.
A change only suggests a branch; it never opens one.
"""

import math
import sqlite3

import numpy as np
import pandas as pd
import ruptures as rpt

from backend.analysis.baselines import MIN_OBSERVATIONS, WINDOW_DAYS, mad
from backend.analysis.series import days, iso, load_series
from backend.data.db import dumps
from backend.data.metrics import DETECT_METRICS, METRICS, TRUNK_METRICS, change_label

K_MADS = 2.0
MAD_SCALE = 1.4826
RUN_DAYS = 7
NEEDED_FLAGS = 5
COOLDOWN_DAYS = 14
POST_WINDOW_DAYS = 10      # the new level is measured over its first 10 days
MIN_SHIFT_SD = 0.5         # and must be more than half a standard deviation


def _pin_start(values: pd.Series, t: pd.Timestamp, seg_start: pd.Timestamp, flagged: list, sigma: float):
    """Use PELT to find where the new level began; fall back to the first flagged day."""
    seg = values[(values.index >= seg_start) & (values.index <= t)]
    fallback = flagged[0]
    if len(seg) < 6:
        return fallback
    sigma = sigma if sigma and sigma > 0 else float(seg.std(ddof=1) or 1.0)
    pen = 3 * math.log(len(seg)) * sigma**2
    bkps = rpt.Pelt(model="l2", min_size=2, jump=1).fit(seg.to_numpy().reshape(-1, 1)).predict(pen=pen)
    candidates = [seg.index[i] for i in bkps[:-1] if t - days(13) <= seg.index[i] <= t]
    if not candidates:
        return fallback
    return min(candidates, key=lambda d: abs((d - fallback).days))


def detect_changes(values: pd.Series) -> list[dict]:
    """Return the change events in a daily series (index = dates)."""
    values = values.sort_index()
    dates = values.index
    flags = pd.Series(0, index=dates, dtype=int)
    events: list[dict] = []
    reset_from = None
    cooldown_until = None

    for t in dates:
        lo = t - days(WINDOW_DAYS)
        if reset_from is not None and reset_from > lo:
            lo = reset_from
        hist = values[(dates >= lo) & (dates < t)]
        if len(hist) < MIN_OBSERVATIONS:
            continue
        med = float(hist.median())
        spread = MAD_SCALE * mad(hist) or float(hist.std(ddof=0)) or 1e-9
        dev = float(values[t]) - med
        flags[t] = int(np.sign(dev)) if abs(dev) > K_MADS * spread else 0

        if cooldown_until is not None and t <= cooldown_until:
            continue
        recent = flags[(dates > t - days(RUN_DAYS)) & (dates <= t)]
        for sign in (-1, 1):
            flagged = list(recent[recent == sign].index)
            if len(flagged) < NEEDED_FLAGS:
                continue
            start = _pin_start(values, t, lo, flagged, float(hist.std(ddof=1)))
            base_lo = start - days(WINDOW_DAYS)
            if reset_from is not None and reset_from > base_lo:
                base_lo = reset_from
            base = values[(dates >= base_lo) & (dates < start)]
            if len(base) < MIN_OBSERVATIONS:
                continue
            post = values[(dates >= start) & (dates < start + days(POST_WINDOW_DAYS))]
            delta = float(post.median()) - float(base.median())
            if abs(delta) <= MIN_SHIFT_SD * float(base.std(ddof=1)):
                continue
            events.append(
                {
                    "date": start,
                    "detected_on": t,
                    "delta": int(round(delta)),
                    "baseline_median": round(float(base.median()), 1),
                    "flagged_dates": flagged,
                }
            )
            reset_from = start
            cooldown_until = t + days(COOLDOWN_DAYS)
            break
    return events


def refresh_change_events(conn: sqlite3.Connection, clock) -> list[dict]:
    """Recompute every change event from observations up to the demo clock.

    Events for trunk metrics are numbered first (ce_1, ce_2, ...) in date order, so their ids
    stay stable as the clock moves forward: detection on day t only uses data up to t.
    """
    found = []
    for metric in DETECT_METRICS:
        if METRICS[metric].binary:
            continue
        values, ids = load_series(conn, metric, None, clock)
        for ev in detect_changes(values):
            ev["metric"] = metric
            ev["record_ids"] = [ids[d] for d in ev.pop("flagged_dates")]
            found.append(ev)

    order = {m: i for i, m in enumerate(DETECT_METRICS)}
    found.sort(key=lambda e: (e["metric"] not in TRUNK_METRICS, e["date"], order[e["metric"]]))
    conn.execute("DELETE FROM change_events")
    for i, ev in enumerate(found, start=1):
        ev["id"] = f"ce_{i}"
        ev["label"] = change_label(ev["metric"], ev["delta"])
        conn.execute(
            "INSERT INTO change_events (id, metric, date, detected_on, delta, baseline_median, label, record_ids)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (ev["id"], ev["metric"], iso(ev["date"]), iso(ev["detected_on"]), ev["delta"],
             ev["baseline_median"], ev["label"], dumps(ev["record_ids"])),
        )
    return found
