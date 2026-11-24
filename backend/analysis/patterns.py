"""Pattern finder and metric summaries. Every number comes with the record ids behind it.

Confidence of a hypothesis = how much more often the suspected cause showed up before
"bad" days than before other days, in percentage points:

    confidence = 100 x ( k/n  -  j/m ), never below 0

where k of n bad days and j of m other days had the exposure. Example: 4 of 5 headache days
followed short nights but only 1 of 5 headache-free days did: 100 x (0.8 - 0.2) = 60.
With fewer than 10 days or fewer than 3 bad days there are no claims: "not enough data yet".
"""

import sqlite3

import pandas as pd

from backend.analysis.series import OPS, days, iso, load_series, to_date
from backend.data.metrics import METRICS, clock_after_noon, hours_minutes

MIN_DAYS_FOR_CLAIMS = 10
MIN_OUTCOME_DAYS = 3


def fmt(metric: str, value: float) -> str:
    if metric == "sleep_min":
        return hours_minutes(value)
    if metric == "lights_out":
        return clock_after_noon(value)
    if metric == "water_ml":
        return f"{value:,.0f} ml"
    if metric == "steps":
        return f"{value:,.0f} steps"
    if metric == "screen_late_min":
        return f"{value:.0f} min"
    return f"{value:.1f}"


def summarize_metric(conn: sqlite3.Connection, metric: str, start, end) -> dict:
    """Average, spread and count of a metric over a period, with the record ids behind them."""
    values, ids = load_series(conn, metric, start, end)
    out = {"metric": metric, "start": iso(start), "end": iso(end), "count": int(len(values)), "record_ids": ids.tolist()}
    if len(values):
        out.update(
            mean=round(float(values.mean()), 1),
            median=round(float(values.median()), 1),
            min=round(float(values.min()), 1),
            max=round(float(values.max()), 1),
            sd=round(float(values.std(ddof=1)), 1) if len(values) > 1 else 0.0,
        )
    if len(values) < 7:
        out["warning"] = f"Only {len(values)} readings: not enough data yet for a reliable average."
    return out


def compare_periods(conn: sqlite3.Connection, metric: str, period_a: tuple, period_b: tuple) -> dict:
    """Compare a metric between two periods (each a (start, end) pair)."""
    a = summarize_metric(conn, metric, *period_a)
    b = summarize_metric(conn, metric, *period_b)
    out = {"metric": metric, "period_a": a, "period_b": b}
    if a["count"] and b["count"]:
        out["change_mean"] = round(b["mean"] - a["mean"], 1)
        out["change_median"] = round(b["median"] - a["median"], 1)
    warnings = [p["warning"] for p in (a, b) if "warning" in p]
    if warnings:
        out["warning"] = " ".join(warnings)
    return out


def find_patterns(conn: sqlite3.Connection, branch: dict, hypotheses: list[dict], start, end) -> list[dict]:
    """For each hypothesis, compare how often its exposure came before bad days vs other days.

    `branch` needs outcome_metric, outcome_op, outcome_threshold, outcome_text, control_text.
    Returns one result per hypothesis, best (highest confidence) first, each with claims
    whose record ids are real observation ids.
    """
    start, end = to_date(start), to_date(end)
    out_vals, out_ids = load_series(conn, branch["outcome_metric"], start, end)
    is_bad = OPS[branch["outcome_op"]](out_vals, branch["outcome_threshold"])
    outcome_binary = METRICS[branch["outcome_metric"]].binary

    results = []
    for h in hypotheses:
        lag = int(h["lag_days"])
        exp_vals, exp_ids = load_series(conn, h["metric"], start - days(lag), end - days(lag))
        rows = []
        for d in out_vals.index:
            src = d - pd.Timedelta(days=lag)
            if src not in exp_vals.index:
                continue
            rows.append(
                {
                    "date": d,
                    "bad": bool(is_bad[d]),
                    "exposed": bool(OPS[h["op"]](exp_vals[src], h["threshold"])),
                    "exp_value": float(exp_vals[src]),
                    "exp_id": exp_ids[src],
                    "out_value": float(out_vals[d]),
                    "out_id": out_ids[d],
                }
            )
        df = pd.DataFrame(rows)
        result = {
            "hypothesis_id": h["id"],
            "label": h["label"],
            "metric": h["metric"],
            "days": int(len(df)),
            "confidence": 0,
            "claims": [],
            "supporting_ids": [],
            "counterexample_ids": [],
            "effect": None,
        }
        if len(df) == 0:
            results.append(result)
            continue
        bad, good = df[df["bad"]], df[~df["bad"]]
        n, k = len(bad), int(bad["exposed"].sum())
        m, j = len(good), int(good["exposed"].sum())
        result.update(k=k, n=n, j=j, m=m)
        if not outcome_binary:
            exposed, unexposed = df[df["exposed"]], df[~df["exposed"]]
            if len(exposed) and len(unexposed):
                result["effect"] = round(float(unexposed["out_value"].mean() - exposed["out_value"].mean()), 1)

        if len(df) < MIN_DAYS_FOR_CLAIMS or n < MIN_OUTCOME_DAYS or m == 0:
            result["not_enough_data"] = True
            results.append(result)
            continue

        result["confidence"] = max(0, int(round(100 * (k / n - j / m))))
        bad_exposed = bad[bad["exposed"]]
        result["supporting_ids"] = bad_exposed["exp_id"].tolist() + bad_exposed["out_id"].tolist()
        result["counterexample_ids"] = bad[~bad["exposed"]]["exp_id"].tolist()

        claims = [
            {
                "text": h["claim_template"].format(k=k, n=n),
                "record_ids": _interleave(bad_exposed["exp_id"], bad_exposed["out_id"]) if k else bad["exp_id"].tolist()[:8],
            }
        ]
        control_ids = good[good["exposed"]]["exp_id"].tolist() or good["exp_id"].tolist()
        claims.append({"text": h["control_template"].format(j=j, m=m), "record_ids": control_ids[:8]})

        metric = h["metric"]
        if not METRICS[metric].binary and outcome_binary:
            claims.append(
                {
                    "text": f"{METRICS[metric].title} averaged {fmt(metric, bad['exp_value'].mean())} on "
                    f"{branch['outcome_text']} vs {fmt(metric, good['exp_value'].mean())} on {branch['control_text']}",
                    "record_ids": bad["exp_id"].tolist()[:8],
                }
            )
        elif result["effect"] is not None:
            om = branch["outcome_metric"]
            exposed, unexposed = df[df["exposed"]], df[~df["exposed"]]
            claims.append(
                {
                    "text": f"{METRICS[om].title} averaged {fmt(om, exposed['out_value'].mean())} after "
                    f"{h['exposure_text']} vs {fmt(om, unexposed['out_value'].mean())} otherwise",
                    "record_ids": _interleave(exposed["exp_id"], exposed["out_id"])[:8],
                }
            )
        result["claims"] = claims
        results.append(result)

    results.sort(key=lambda r: -r["confidence"])
    for rank, r in enumerate(results, start=1):
        r["rank"] = rank
    return results


def _interleave(a, b) -> list[str]:
    out = []
    for x, y in zip(list(a), list(b)):
        out.extend([x, y])
    return out
