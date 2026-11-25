"""Build and validate Gemini proposals from isolated synthetic records."""

import os
from contextlib import closing

from dotenv import load_dotenv

from backend.ai.gemini import GeminiUnavailable, propose_drafts
from backend.ai.knowledge_catalog import DEMO_OUTCOMES, TOPICS, URINARY, prospective_test
from backend.data import generate_demo
from backend.data.db import connect
from backend.data.metrics import METRICS
from backend.integrations.branch_evidence import (
    FACTOR_LABELS,
    workspace_hypotheses,
    workspace_metrics,
    workspace_outcome,
)

OUTCOME_TOPICS = {
    "headache": ("Factors associated with headaches in the fictional demo", "headache days"),
    "sleep_min": ("Factors associated with short sleep in the fictional demo", "short nights"),
    "afternoon_energy": (
        "Possible factors to investigate for an energy dip after lunch in the fictional demo. "
        "The demo has no lunch records or afternoon energy ratings. Suggest prospective tracking.",
        "low-energy afternoons",
    ),
}


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
        and any(metric != outcome for metric in workspace_metrics(payload, outcome))
    )


def _possible_outcomes(approach, exposure, outcome):
    method = (
        "Compare days in the existing log"
        if approach == "compare_logs" else "Track this factor and the outcome in future check-ins"
    )
    return (
        f"{method}, with and without {exposure}.\n"
        f"Would support the idea: {outcome.capitalize()} are more common with this factor.\n"
        "Would weaken it: the outcomes are similar or go in the opposite direction.\n"
        "Inconclusive: there are too few comparable days."
    )


def generate_workspace_drafts(payload, clock):
    if not can_generate(payload):
        raise DraftsUnavailable("Gemini drafts need an open investigation with supported linked factors.")

    outcome = workspace_outcome(payload)
    topic, outcome_label = OUTCOME_TOPICS.get(outcome, (
        f"Plan tests for {TOPICS[outcome].label.lower()} in the fictional demo. "
        "Treat linked readings as context and suggest prospective tracking.",
        TOPICS[outcome].label.lower(),
    ))
    with closing(connect(":memory:")) as conn:
        generate_demo.build(conn)
        metrics = [metric for metric in workspace_metrics(payload, outcome) if metric != outcome][:3]
        definitions = {}
        if outcome in DEMO_OUTCOMES:
            definitions = {
                row["metric"]: row for row in conn.execute(
                    "SELECT * FROM hypotheses WHERE branch_id = ? ORDER BY id", (DEMO_OUTCOMES[outcome],)
                )
            }
        synthetic_branch = {
            "title": "", "branch_type": "investigation", "outcome": outcome,
            "metrics": metrics, "hypotheses": [], "start_date": payload["start_date"],
        }
        by_label = {FACTOR_LABELS.get(metric, METRICS[metric].title): metric for metric in metrics}
        candidates = []
        for item in workspace_hypotheses(conn, synthetic_branch, clock):
            candidates.append({
                "rank": item["rank"], "text": item["label"], "claims": item["claims"],
                "metric": by_label[item["label"]], "scored": "confidence" in item,
            })
    if not candidates:
        raise DraftsUnavailable("No matching demo readings for the linked metrics and branch date.")

    proposals, audit = propose_drafts(topic, candidates)
    by_rank = {item["rank"]: item for item in candidates}
    drafts = []
    selected_metrics = []
    for proposal in proposals:
        item = by_rank.get(proposal.rank)
        if item is None or item["metric"] in selected_metrics:
            continue
        metric = item["metric"]
        selected_metrics.append(metric)
        drafts.append({
            "label": item["text"],
            "test": (
                _possible_outcomes(proposal.approach, definitions[metric]["exposure_text"], outcome_label)
                if item["scored"] else prospective_test(outcome, METRICS[metric].title.lower())
            ),
        })
    if not drafts:
        raise GeminiUnavailable("Gemini returned no matching drafts. Try again.")
    linked_metrics = [*payload["metrics"], *selected_metrics]
    if outcome in METRICS:
        linked_metrics.append(outcome)
    return {
        **payload,
        "metrics": list(dict.fromkeys(linked_metrics)),
        "ai_drafts": drafts,
        "draft_sent_to_ai": audit,
    }
