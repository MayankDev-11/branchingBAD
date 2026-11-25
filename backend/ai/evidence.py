"""Prepare read-only, aggregate evidence from the seeded demo database."""

from contextlib import closing
from functools import lru_cache

from backend.analysis.baselines import get_baseline
from backend.analysis.patterns import compare_periods, summarize_metric
from backend.analysis.series import days
from backend.analysis.state import refresh_state
from backend.data import generate_demo
from backend.data.db import connect, loads
from backend.data.queries import build_branch
from backend.data.store import store

TOOLS = {
    "branch_patterns": "Ranked candidate hypotheses, exact claim text, citations and experiment proposals.",
    "recent_summary": "Aggregate recent sleep, hydration and late screen time.",
    "personal_baseline": "Personal sleep baseline.",
    "period_comparison": "Compare the last two weeks of sleep.",
    "change_events": "Observed shifts in the demo timeline.",
    "experiment_status": "Python-computed experiment status and adherence.",
}
SAFE_TESTS = {
    "sleep_min": "Keep a consistent bedtime and log sleep and symptoms each morning.",
    "water_ml": "Log water intake and symptoms consistently to check whether the pattern repeats.",
    "screen_late_min": "Try a consistent screen-free wind-down and log sleep and symptoms.",
    "caffeine_pm": "Track caffeine timing and compare it with your sleep log.",
    "steps": "Log activity and sleep to see whether the pattern repeats.",
}
DEFAULT_TEST = "Log the suspected factor and outcome to see whether the pattern repeats."


class UnknownBranch(ValueError):
    pass


def _branch_hypotheses(conn, branch_id, clock):
    branch = build_branch(conn, branch_id, clock) if branch_id else None
    if branch_id and branch is None:
        raise UnknownBranch(branch_id)
    if branch is None:
        return None, []
    metrics = {
        row["label"]: row["metric"]
        for row in conn.execute("SELECT label, metric FROM hypotheses WHERE branch_id = ?", (branch_id,))
    }
    return branch, [
        {
            "rank": item["rank"], "text": item["label"], "claims": item["claims"],
            "test": SAFE_TESTS.get(metrics.get(item["label"]), DEFAULT_TEST),
        }
        for item in branch["hypotheses"] if item["claims"]
    ]


def _valid_record_ids(conn, clock, hypotheses):
    cited = {record for h in hypotheses for claim in h["claims"] for record in claim["record_ids"]}
    if not cited:
        return set()
    placeholders = ",".join("?" for _ in cited)
    return {
        row["id"] for row in conn.execute(
            f"SELECT id FROM observations WHERE id IN ({placeholders}) AND date <= ? AND is_excluded = 0",
            (*cited, clock.isoformat()),
        )
    }


@lru_cache(maxsize=8)
def synthetic_hypotheses(branch_id, clock):
    """Create Gemini evidence from the generator alone, independent of workspace data."""
    with closing(connect(":memory:")) as conn:
        generate_demo.build(conn)
        if clock != generate_demo.CLOCK_START:
            refresh_state(conn, clock)
        _, hypotheses = _branch_hypotheses(conn, branch_id, clock)
        return hypotheses, _valid_record_ids(conn, clock, hypotheses)


def collect_evidence(branch_id: str | None, question: str) -> tuple[dict, set[str]]:
    with store.connection() as conn:
        clock = store.clock
        if branch_id is None:
            outcome = "headache" if "headache" in question.casefold() else "sleep_min"
            row = conn.execute(
                "SELECT id FROM branches WHERE start_date <= ? "
                "ORDER BY (outcome_metric = ?) DESC, (status = 'open') DESC, start_date DESC LIMIT 1",
                (clock.isoformat(), outcome),
            ).fetchone()
            branch_id = row["id"] if row else None
        branch, hypotheses = _branch_hypotheses(conn, branch_id, clock)
        experiment = branch["experiment"] if branch else None
        evidence = {
            "branch_patterns": hypotheses,
            "recent_summary": [
                summarize_metric(conn, metric, clock - days(6), clock)
                for metric in ("sleep_min", "water_ml", "screen_late_min")
            ],
            "personal_baseline": get_baseline(conn, "sleep_min", clock + days(1), clock=clock),
            "period_comparison": compare_periods(
                conn, "sleep_min", (clock - days(13), clock - days(7)), (clock - days(6), clock)
            ),
            "change_events": [
                {"metric": row["metric"], "date": row["date"], "delta": row["delta"],
                 "record_ids": loads(row["record_ids"], [])}
                for row in conn.execute(
                    "SELECT metric, date, delta, record_ids FROM change_events "
                    "WHERE date <= ? AND detected_on <= ? ORDER BY date DESC LIMIT 6",
                    (clock.isoformat(), clock.isoformat()),
                )
            ],
            "experiment_status": {
                key: experiment[key]
                for key in ("status", "locked", "duration_days", "days_elapsed", "adherence_pct")
            } if experiment else None,
        }
        valid = _valid_record_ids(conn, clock, hypotheses)
    return evidence, valid
