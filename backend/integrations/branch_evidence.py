"""Build workspace branch evidence using the existing demo analysis."""

from datetime import date, timedelta

from backend.ai.knowledge_catalog import (
    DEMO_OUTCOMES,
    TOPICS,
    URINARY,
    prospective_test,
    question_outcome,
    suggested_factors,
)
from backend.analysis.patterns import find_patterns
from backend.analysis.series import load_series
from backend.data.metrics import METRICS
from backend.privacy.questions import is_red_flag

LEGACY_DEFAULT = ["Prior-night sleep debt", "Low water intake", "Late-night screen"]
FACTOR_LABELS = {
    "sleep_min": "Short sleep",
    "water_ml": "Low water intake",
    "steps": "Low daytime activity",
    "headache": "Headache days",
    "screen_late_min": "Late screen time",
    "caffeine_pm": "Late caffeine",
}
LABEL_ALIASES = {
    "sleep_min": {"prior-night sleep debt", "accumulated sleep debt"},
    "water_ml": {"low daytime hydration"},
    "screen_late_min": {"late-night screen", "screen light before bed"},
}


def workspace_outcome(payload):
    return question_outcome(payload["title"], payload.get("outcome", "auto"))


def workspace_metrics(payload, outcome):
    if outcome == URINARY or is_red_flag(payload["title"]):
        return []
    if (not any(metric != outcome for metric in payload["metrics"]) and payload["branch_type"] == "investigation"
            and payload["hypotheses"] in ([], LEGACY_DEFAULT)):
        return suggested_factors(payload["title"], outcome)
    return payload["metrics"]


def _snapshot(conn, metric_key, end):
    metric = METRICS[metric_key]
    values, ids = load_series(conn, metric_key, end - timedelta(days=6), end)
    if values.empty:
        return []
    if metric.binary:
        summary = f"{metric.title} recorded on {int(values.sum())} of {len(values)} linked demo days."
    elif metric_key == "sleep_min":
        summary = f"Linked sleep averaged {metric.display(values.mean())} across {len(values)} demo readings."
    elif metric_key in {"water_ml", "steps", "screen_late_min"}:
        summary = f"Linked {metric.title.lower()} averaged {values.mean():,.0f} {metric.unit} across {len(values)} demo readings."
    else:
        summary = f"Latest linked reading: {metric.display(values.iloc[-1])} on {values.index[-1].date()}."
        ids = ids.iloc[-1:]
    return [{"text": summary, "record_ids": ids.tolist()}]


def workspace_hypotheses(conn, payload, clock):
    outcome = workspace_outcome(payload)
    if outcome == URINARY or is_red_flag(payload["title"]):
        return []
    metrics = workspace_metrics(payload, outcome)
    factors = [metric for metric in metrics if metric != outcome]
    draft_checks = {draft["label"]: draft["test"] for draft in payload.get("ai_drafts", [])}
    manual_labels = [] if payload["hypotheses"] == LEGACY_DEFAULT else payload["hypotheses"]
    labels = list(dict.fromkeys([*draft_checks, *manual_labels]))
    if not labels:
        if payload["branch_type"] == "habit":
            labels = [f"Track {METRICS[metric].title.lower()}" for metric in metrics[:3]]
        elif outcome != "untracked":
            labels = [FACTOR_LABELS.get(metric, METRICS[metric].title) for metric in factors[:3]]
        else:
            labels = []
    end = min(date.fromisoformat(payload["start_date"]), clock)
    source = DEMO_OUTCOMES.get(outcome) if payload["branch_type"] == "investigation" else None
    matched_metrics = {
        key: {FACTOR_LABELS.get(key, METRICS[key].title).casefold(),
              f"track {METRICS[key].title.casefold()}"} | LABEL_ALIASES.get(key, set())
        for key in metrics
    }
    definitions = {}
    if source:
        template = conn.execute("SELECT * FROM branches WHERE id = ?", (source,)).fetchone()
        if template is not None:
            definitions = {
                row["metric"]: dict(row)
                for row in conn.execute("SELECT * FROM hypotheses WHERE branch_id = ?", (source,))
            }
            for key, definition in definitions.items():
                if key in matched_metrics:
                    matched_metrics[key].add(definition["label"].casefold())
            results = {
                result["metric"]: result
                for result in find_patterns(
                    conn, dict(template), [definitions[key] for key in factors if key in definitions],
                    end - timedelta(days=20), end,
                )
                if result["claims"] and 0 < result["k"] + result["j"] < result["n"] + result["m"]
            }
        else:
            results = {}
    else:
        results = {}

    hypotheses = []
    for label in labels:
        metric = next((key for key, aliases in matched_metrics.items() if label.casefold() in aliases), None)
        result = results.get(metric)
        if result is not None:
            hypotheses.append({
                "label": label, "confidence": result["confidence"], "claims": result["claims"],
                "test": draft_checks.get(label, "Track the same factor and outcome together to see whether this pattern repeats."),
            })
            continue
        if source and metric in definitions:
            guidance = "More matched days with and without this factor and outcome are needed to score the pattern."
        elif payload["branch_type"] == "habit":
            guidance = "Use the linked readings as a starting point and log whether you completed the habit."
        elif outcome in TOPICS:
            guidance = prospective_test(outcome, METRICS[metric].title.lower() if metric else "this factor")
        else:
            guidance = "Choose a logged outcome and a measurable factor to test this draft."
        hypotheses.append({
            "label": label, "claims": _snapshot(conn, metric, end) if metric else [],
            "test": draft_checks.get(label, guidance),
        })
    if not draft_checks:
        hypotheses.sort(key=lambda item: item.get("confidence", -1), reverse=True)
    return [{"rank": rank, **item} for rank, item in enumerate(hypotheses, 1)]
