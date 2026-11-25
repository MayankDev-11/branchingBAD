"""Build and validate Gemini proposals from isolated synthetic records."""

import os
from contextlib import closing

from dotenv import load_dotenv

from backend.ai.gemini import GeminiUnavailable, propose_drafts
from backend.data import generate_demo
from backend.data.db import connect
from backend.integrations.branch_evidence import DEMO_OUTCOMES, FACTOR_LABELS, workspace_hypotheses, workspace_outcome
from backend.privacy.questions import is_red_flag

OUTCOME_TOPICS = {
    "headache": ("Factors associated with headaches in the fictional demo", "headache days"),
    "sleep_min": ("Factors associated with short sleep in the fictional demo", "short nights"),
}


class DraftsUnavailable(ValueError):
    pass


def can_generate(payload):
    load_dotenv()
    return (
        os.getenv("ROOTTRACE_AI_PROVIDER", "bedrock").strip().lower() == "gemini"
        and payload["branch_type"] == "investigation"
        and payload.get("lifecycle", "open") == "open"
        and workspace_outcome(payload) in OUTCOME_TOPICS
        and not is_red_flag(payload["title"])
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
        raise DraftsUnavailable("Choose a tracked demo outcome such as headache days or short sleep.")

    outcome = workspace_outcome(payload)
    topic, outcome_label = OUTCOME_TOPICS[outcome]
    with closing(connect(":memory:")) as conn:
        generate_demo.build(conn)
        definitions = {
            row["metric"]: row for row in conn.execute(
                "SELECT * FROM hypotheses WHERE branch_id = ? ORDER BY id", (DEMO_OUTCOMES[outcome],)
            )
        }
        chosen_metrics = [metric for metric in payload["metrics"] if metric != outcome]
        metrics = [metric for metric in (chosen_metrics or definitions) if metric in definitions]
        synthetic_branch = {
            "title": "", "branch_type": "investigation", "outcome": outcome,
            "metrics": metrics, "hypotheses": [], "start_date": payload["start_date"],
        }
        by_label = {FACTOR_LABELS[metric]: metric for metric in metrics}
        candidates = []
        for item in workspace_hypotheses(conn, synthetic_branch, clock):
            if not item["claims"]:
                continue
            metric = by_label[item["label"]]
            candidates.append({
                "rank": item["rank"], "text": item["label"], "claims": item["claims"],
                "metric": metric, "exposure": definitions[metric]["exposure_text"],
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
        selected_metrics.append(item["metric"])
        drafts.append({
            "label": item["text"],
            "test": _possible_outcomes(proposal.approach, item["exposure"], outcome_label),
        })
    if not drafts:
        raise GeminiUnavailable("Gemini returned no matching drafts. Try again.")
    return {
        **payload,
        "metrics": list(dict.fromkeys([*payload["metrics"], *selected_metrics, outcome])),
        "ai_drafts": drafts,
        "draft_sent_to_ai": audit,
    }
