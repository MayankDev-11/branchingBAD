"""Build workspace branch evidence using the existing demo analysis."""

from datetime import date, timedelta

from backend.ai.knowledge_catalog import (
    CHECK_INS,
    DEMO_OUTCOMES,
    TOPICS,
    URINARY,
    URINARY_GUIDANCE,
    URINARY_LABEL,
    around_lunch,
    medical_request,
    mentioned_metrics,
    off_topic_question,
    prospective_test,
    question_outcome,
    suggested_factors,
)
from backend.analysis.patterns import find_patterns
from backend.analysis.series import load_frame, load_series
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
RECENT_DAYS = 14
MIN_COMPARISON_GROUP = 3
SCORE_WINDOWS = (21, 60)
# These prompts use the same cutoffs as the demo comparisons they follow.
DEMO_FACTOR_QUESTIONS = {
    ("headache", "sleep_min"): "Did you sleep less than 6 hours last night?",
    ("headache", "water_ml"): "Did you drink less than 1 litre of water today?",
    ("headache", "screen_late_min"): "Did you spend more than 60 minutes on screens after 10 PM yesterday?",
    ("sleep_min", "screen_late_min"): "Did you spend more than 45 minutes on screens after 10 PM yesterday?",
    ("sleep_min", "steps"): "Did you take fewer than 6,000 steps yesterday?",
}
DEMO_OUTCOME_QUESTIONS = {"sleep_min": "Did you sleep less than 6 hours and 50 minutes last night?"}


def workspace_outcome(payload):
    return question_outcome(payload["title"], payload.get("outcome", "auto"))


def workspace_question_guidance(payload: dict) -> dict | None:
    title = payload["title"]
    outcome = workspace_outcome(payload)
    if is_red_flag(title):
        return {"title": "Seek medical help", "message": "See a doctor now, or call 112 in an emergency."}
    if outcome == URINARY:
        return {"title": URINARY_LABEL, "message": URINARY_GUIDANCE}
    if medical_request(title):
        return {
            "title": "This question needs clinical advice",
            "message": "RootTrace can compare tracking data. Ask a healthcare professional about diagnoses or treatment.",
        }
    if off_topic_question(title) or (
        payload["branch_type"] == "investigation" and outcome == "untracked"
        and not payload.get("metrics")
    ):
        return {
            "title": "No tracked outcome for this question",
            "message": (
                "Try a question about a change you can measure. For example, "
                "“Do I get more headaches after a short night?” or “Does late screen time go with worse sleep?”"
            ),
        }
    return None


def workspace_metrics(payload, outcome):
    if outcome == URINARY or is_red_flag(payload["title"]):
        return []
    chosen = payload["metrics"] if workspace_drafts_match(payload, outcome) else []
    if payload["branch_type"] == "habit":
        return chosen or mentioned_metrics(payload["title"])[:3]
    if any(metric != outcome for metric in chosen):
        return chosen
    manual = payload["hypotheses"]
    if manual and manual != LEGACY_DEFAULT:
        named = mentioned_metrics(" ".join(manual))
        return list(dict.fromkeys([*chosen, *(metric for metric in named if metric != outcome)]))[:3]
    return suggested_factors(payload["title"], outcome) or chosen


def _factor_metric(label: str, metrics: list[str]) -> str | None:
    canonical = label.strip().casefold()
    for key in metrics:
        name = FACTOR_LABELS.get(key, METRICS[key].title)
        if canonical in {name.casefold(), f"track {METRICS[key].title.casefold()}"} | LABEL_ALIASES.get(key, set()):
            return key
    matches = mentioned_metrics(label)
    return matches[0] if len(matches) == 1 and matches[0] in metrics else None


def workspace_drafts_match(payload: dict, outcome: str) -> bool:
    drafts = payload.get("ai_drafts", [])
    if not drafts:
        return True
    if "draft_outcome" in payload:
        return payload["draft_outcome"] == outcome
    # Legacy Gemini drafts stored all selected factors and appended the tracked outcome.
    metrics = payload["metrics"]
    return outcome not in METRICS or not metrics or (
        outcome in metrics and all(_factor_metric(item["label"], metrics) != outcome for item in drafts)
    )


def _prior_day(metric: str, outcome: str) -> bool:
    if metric == "steps" and outcome == "sleep_min":
        return True
    return metric in {"caffeine_pm", "screen_late_min"} and outcome in {
        "sleep_min", "sleep_quality", "headache", "mood", "afternoon_energy", "focus"
    }


def workspace_test_questions(payload: dict, hypothesis: dict) -> tuple[str, str] | None:
    if payload["branch_type"] != "investigation" or workspace_question_guidance(payload):
        return None
    outcome = workspace_outcome(payload)
    metric = _factor_metric(hypothesis.get("label", ""), workspace_metrics(payload, outcome))
    if not metric or metric == outcome or not CHECK_INS[metric].factor or outcome not in CHECK_INS:
        return None
    prior_day_prompts = {
        "caffeine_pm": "Did you have caffeine after 4 PM yesterday?",
        "screen_late_min": "Did you spend longer than usual on screens after 10 PM yesterday?",
        "steps": "Did you take fewer steps than usual yesterday?",
    }
    factor = DEMO_FACTOR_QUESTIONS.get((outcome, metric))
    if factor is None:
        factor = prior_day_prompts[metric] if _prior_day(metric, outcome) else CHECK_INS[metric].factor
    return factor, DEMO_OUTCOME_QUESTIONS.get(outcome, CHECK_INS[outcome].outcome)


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


def _paired_evidence(conn, metric: str, outcome: str, end: date) -> tuple[list[dict], dict]:
    """Compare two observed groups and attach the cited records for both groups."""
    start = end - timedelta(days=RECENT_DAYS - 1)
    lag = timedelta(days=int(_prior_day(metric, outcome)))
    factors = load_frame(conn, metric, start - lag, end - lag)
    context = {"factor_days": len(factors), "paired_days": 0, "outcome_tracked": outcome in METRICS}
    if outcome not in METRICS:
        return [], context
    factors.index += lag
    outcomes = load_frame(conn, outcome, start, end)
    pairs = factors.add_suffix("_factor").join(outcomes.add_suffix("_outcome"), how="inner")
    context["paired_days"] = len(pairs)
    if pairs.empty:
        return [], context

    source = METRICS[metric]
    values = pairs["value_factor"]
    if source.binary:
        exposure = values == 1
        condition = source.display(1).lower()
    else:
        midpoint = values.median()
        if CHECK_INS[metric].low:
            exposure = values < midpoint
            condition = f"{source.title.lower()} below the paired-day median"
        else:
            exposure = values > midpoint
            condition = f"{source.title.lower()} above the paired-day median"
    exposed, comparison = pairs[exposure], pairs[~exposure]
    context.update(factor_group_days=len(exposed), comparison_group_days=len(comparison))
    if min(len(exposed), len(comparison)) < MIN_COMPARISON_GROUP:
        return [], context

    target = METRICS[outcome]

    def summarize(group):
        values = group["value_outcome"]
        if target.binary:
            return f"{int(values.sum())} of {len(group)} days had a {target.title.lower()} flag"
        median = values.median()
        reading = f"mood rating {median:g}/5" if outcome == "mood" else target.display(median)
        return f"median {reading} across {len(group)} days"

    alignment = "the prior day had" if lag else "the same day had"
    claim = {
        "text": f"When {alignment} {condition}: {summarize(exposed)}. Other paired days: {summarize(comparison)}.",
        "record_ids": [id_ for pair in pairs[["id_factor", "id_outcome"]].itertuples(index=False, name=None)
                       for id_ in pair],
    }
    return [claim], context


def _scored_comparisons(conn, template: dict, definitions: list[dict], end: date) -> dict:
    scores = {}
    for days in SCORE_WINDOWS:
        pending = [definition for definition in definitions if definition["metric"] not in scores]
        if not pending:
            break
        start = end - timedelta(days=days - 1)
        for result in find_patterns(conn, template, pending, start, end):
            if not result["claims"]:
                continue
            exposed = result["k"] + result["j"]
            unexposed = result["n"] + result["m"] - exposed
            if min(exposed, unexposed) < MIN_COMPARISON_GROUP:
                continue
            if days != SCORE_WINDOWS[0]:
                first = result["claims"][0]
                first["text"] += f" Historical comparison: {start} to {end}."
            scores[result["metric"]] = result
    return scores


def workspace_hypotheses(conn, payload, clock, *, include_context=False):
    outcome = workspace_outcome(payload)
    if workspace_question_guidance(payload):
        return []
    metrics = workspace_metrics(payload, outcome)
    factors = [metric for metric in metrics if metric != outcome]
    drafts = {draft["label"]: draft for draft in payload.get("ai_drafts", [])} if workspace_drafts_match(payload, outcome) else {}
    manual_labels = [] if payload["hypotheses"] == LEGACY_DEFAULT else payload["hypotheses"]
    labels = list(dict.fromkeys([*drafts, *manual_labels]))
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
            results = _scored_comparisons(conn, dict(template),
                                          [definitions[key] for key in factors if key in definitions], end)
        else:
            results = {}
    else:
        results = {}

    hypotheses = []
    for label in labels:
        metric = next((key for key, aliases in matched_metrics.items() if label.casefold() in aliases), None)
        metric = metric or _factor_metric(label, metrics)
        result = results.get(metric)
        questions = workspace_test_questions(payload, {"label": label})
        paired, context = _paired_evidence(conn, metric, outcome, end) if questions and not result else ([], {})
        if result is not None:
            context = {"outcome_tracked": True, "paired_days": result["n"] + result["m"],
                       "factor_group_days": result["k"] + result["j"],
                       "comparison_group_days": result["n"] + result["m"] - result["k"] - result["j"]}
        extra = {"context": {**context, "comparison_ready": bool(result or paired)}} if include_context else {}
        if payload["branch_type"] == "habit":
            guidance = "Use the linked readings as a starting point and log whether you completed the habit."
        elif questions:
            review_logs = bool(result or paired) and drafts.get(label, {}).get("approach") != "track_prospectively"
            guidance = prospective_test(
                outcome, questions[0], review_logs=review_logs, lunch_context=around_lunch(payload["title"]),
            )
        else:
            guidance = "Choose a measurable factor, such as sleep, steps, or water intake, to compare in a daily check-in."
        item = {"label": label, "test": guidance, **extra}
        if result is not None:
            item.update(confidence=result["confidence"], claims=result["claims"])
        else:
            item["claims"] = paired or (_snapshot(conn, metric, end) if metric else [])
        hypotheses.append(item)
    if not drafts:
        named = set(mentioned_metrics(payload["title"]))
        hypotheses.sort(key=lambda item: (_factor_metric(item["label"], metrics) in named,
                                           item.get("confidence", -1)), reverse=True)
    return [{"rank": rank, **item} for rank, item in enumerate(hypotheses, 1)]
