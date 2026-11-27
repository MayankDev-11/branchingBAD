"""Build and validate Gemini proposals from isolated synthetic records."""

import os
from contextlib import closing

from dotenv import load_dotenv

from backend.ai.gemini import GeminiUnavailable, propose_drafts
from backend.ai.knowledge_catalog import TOPICS, URINARY, around_lunch, mentioned_metrics, prospective_test
from backend.data import generate_demo
from backend.data.db import connect
from backend.data.metrics import METRICS
from backend.integrations.branch_evidence import (
    FACTOR_LABELS,
    workspace_drafts_match,
    workspace_hypotheses,
    workspace_metrics,
    workspace_outcome,
    workspace_question_guidance,
    workspace_test_questions,
)

class DraftsUnavailable(ValueError):
    pass


def can_generate(payload):
    load_dotenv()
    outcome = workspace_outcome(payload)
    return (
        os.getenv("ROOTTRACE_AI_PROVIDER", "bedrock").strip().lower() == "gemini"
        and payload["branch_type"] == "investigation"
        and payload.get("lifecycle", "open") == "open"
        and outcome in TOPICS and outcome != URINARY
        and not workspace_question_guidance(payload)
        and any(metric != outcome for metric in workspace_metrics(payload, outcome))
    )


def generate_workspace_drafts(payload, clock):
    if not can_generate(payload):
        raise DraftsUnavailable("Gemini drafts need an open investigation with supported linked factors.")

    outcome = workspace_outcome(payload)
    lunch_context = outcome == "afternoon_energy" and around_lunch(payload["title"])
    topic = f"Plan tests for {TOPICS[outcome].label.lower()} in the fictional demo."
    if lunch_context:
        topic = "Plan tests for low energy after lunch. The fictional demo has no lunch records or afternoon energy ratings."
    elif outcome not in METRICS:
        topic += " The outcome is missing from the demo records. Suggest prospective tracking."
    named = set(mentioned_metrics(payload["title"]))
    with closing(connect(":memory:")) as conn:
        generate_demo.build(conn)
        metrics = [metric for metric in workspace_metrics(payload, outcome) if metric != outcome]
        metrics.sort(key=lambda metric: metric not in named)
        metrics = metrics[:3]
        synthetic_branch = {
            "title": "", "branch_type": "investigation", "outcome": outcome,
            "metrics": metrics, "hypotheses": [], "start_date": payload["start_date"],
        }
        by_label = {FACTOR_LABELS.get(metric, METRICS[metric].title): metric for metric in metrics}
        candidates = []
        for item in workspace_hypotheses(conn, synthetic_branch, clock, include_context=True):
            metric = by_label[item["label"]]
            questions = workspace_test_questions(synthetic_branch, item)
            if not questions:
                continue
            candidates.append({
                "rank": item["rank"], "text": item["label"], "claims": item["claims"],
                "metric": metric, "factor_question": questions[0],
                "context": {
                    **item["context"], "named_in_question": metric in named,
                    "factor_measurement": questions[0], "outcome_measurement": questions[1],
                },
            })
    if not candidates:
        raise DraftsUnavailable("No matching demo readings for the linked metrics and branch date.")

    proposals, audit = propose_drafts(topic, candidates)
    by_rank = {item["rank"]: item for item in candidates}
    choices = {}
    for proposal in proposals:
        item = by_rank.get(proposal.rank)
        if item is not None:
            choices.setdefault(proposal.rank, proposal.approach)
    if not choices:
        raise GeminiUnavailable("Gemini found no suitable selection. RootTrace’s data-backed suggestions are shown.")

    # A valid plan for an explicit factor stays visible if Gemini takes a different direction.
    priority = [item["rank"] for item in candidates if item["context"]["named_in_question"]]
    selected = list(dict.fromkeys([*priority, *choices]))[:3]
    drafts = [
        {"label": item["text"], "approach": choices.get(item["rank"], "track_prospectively"), "test": prospective_test(
            outcome, item["factor_question"], lunch_context=lunch_context,
            review_logs=choices.get(item["rank"]) == "compare_logs" and item["context"]["comparison_ready"],
        )}
        for item in (by_rank[rank] for rank in selected)
    ]
    selected_metrics = [by_rank[rank]["metric"] for rank in selected]
    linked_metrics = [*(payload["metrics"] if workspace_drafts_match(payload, outcome) else []), *selected_metrics]
    if outcome in METRICS:
        linked_metrics.append(outcome)
    return {
        **payload,
        "metrics": list(dict.fromkeys(linked_metrics)),
        "ai_drafts": drafts,
        "draft_outcome": outcome,
        "draft_sent_to_ai": audit,
    }
