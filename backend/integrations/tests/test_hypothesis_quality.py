import json
from datetime import date

import httpx

from backend.ai import gemini
from backend.ai.knowledge_catalog import off_topic_question, question_outcome
from backend.integrations.branch_drafts import generate_workspace_drafts
from backend.integrations.branch_evidence import (
    workspace_hypotheses,
    workspace_question_guidance,
    workspace_test_questions,
)


CLOCK = date(2026, 11, 20)


def investigation(title):
    return {
        "title": title, "branch_type": "investigation", "outcome": "auto",
        "metrics": [], "hypotheses": [], "start_date": CLOCK.isoformat(),
    }


def test_local_guidance_and_new_outcomes():
    junk = investigation("How do I use the sleep function in JavaScript?")
    assert off_topic_question(junk["title"])
    assert workspace_question_guidance(junk)["title"] == "No tracked outcome for this question"
    assert workspace_test_questions(junk, {"label": "Short sleep"}) is None

    old = {**investigation("Plain title"), "metrics": ["sleep_min"]}
    assert workspace_question_guidance(old) is None
    assert workspace_test_questions(old, {"label": "Short sleep"}) is None
    assert question_outcome("I keep waking up at night after coffee") == "sleep_quality"
    assert question_outcome("Why do I have an upset stomach?") == "digestion"
    assert question_outcome("Why can't I focus after late nights?") == "focus"
    assert workspace_question_guidance(investigation("Chest pain yesterday"))["title"] == "Seek medical help"


def test_paired_claims_link_both_readings_and_have_a_measurable_plan(demo_conn):
    payload = investigation("Can walking affect my mood?")
    activity = workspace_hypotheses(demo_conn, payload, CLOCK, include_context=True)[0]
    assert activity["label"] == "Low daytime activity"
    assert activity["context"]["comparison_ready"]
    assert "paired-day median" in activity["claims"][0]["text"]
    assert len(activity["claims"][0]["record_ids"]) == 2 * activity["context"]["paired_days"]
    for record_id in activity["claims"][0]["record_ids"]:
        assert demo_conn.execute("SELECT id FROM observations WHERE id = ?", (record_id,)).fetchone()
    assert workspace_test_questions(payload, activity) == (
        "Did you record fewer steps than usual?", "Was your mood rating lower than usual?",
    )
    assert "Inconclusive: similar rates or too few days" in activity["test"]


def test_named_factor_takes_priority_and_saved_drafts_use_current_protocol(demo_conn):
    payload = investigation("Do I get headaches after late screen time?")
    screen = workspace_hypotheses(demo_conn, payload, CLOCK)[0]
    assert screen["label"] == "Late screen time"
    assert "more than 60 minutes on screens after 10 PM yesterday" in screen["test"]

    saved = {**payload, "ai_drafts": [{"label": "Late screen time", "test": "Old plan"}]}
    assert workspace_hypotheses(demo_conn, saved, CLOCK)[0]["test"] == screen["test"]


def test_caffeine_sleep_uses_older_paired_days_and_repairs_stale_drafts(demo_conn):
    payload = investigation("Does caffeine after 4 PM cut my sleep?")
    assert question_outcome(payload["title"]) == "sleep_min"
    assert question_outcome("Does cutting down on coffee improve my sleep?") == "sleep_min"
    stale = {**payload, "metrics": ["sleep_min", "steps", "mood", "caffeine_pm"], "ai_drafts": [
        {"label": "Short sleep"}, {"label": "Low daytime activity"}, {"label": "Mood"},
    ]}
    factors = workspace_hypotheses(demo_conn, payload, CLOCK)
    assert workspace_hypotheses(demo_conn, stale, CLOCK) == factors
    assert [factor["label"] for factor in factors] == ["Late caffeine", "Late screen time", "Low daytime activity"]
    caffeine = factors[0]
    assert 0 < caffeine["confidence"] <= 100
    assert "Historical comparison" in caffeine["claims"][0]["text"]
    assert caffeine["claims"][0]["record_ids"]


def test_gemini_drafts_receive_only_the_derived_question_context(monkeypatch):
    monkeypatch.setenv("ROOTTRACE_AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "mock-key")
    sent = []

    def reply(url, **kwargs):
        request = kwargs["content"].decode()
        sent.append(request)
        candidates = json.loads(json.loads(request)["contents"][0]["parts"][0]["text"])["hypotheses"]
        water = next(item for item in candidates if item["context"]["named_in_question"])
        assert water["text"] == "Low water intake"
        assert water["context"]["paired_days"] == 0
        assert not water["context"]["comparison_ready"]
        assert "comparison" in json.loads(request)["systemInstruction"]["parts"][0]["text"]
        chosen = next(item for item in candidates if item != water)
        return httpx.Response(200, request=httpx.Request("POST", url), json={
            "candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": json.dumps({
                "drafts": [{"rank": chosen["rank"], "approach": "compare_logs"}],
            })}]}}],
        })

    monkeypatch.setattr(gemini.httpx, "post", reply)
    payload = investigation("Why am I tired after lunch when I drink less water? private-name 9876543210")
    result = generate_workspace_drafts(payload, CLOCK)
    assert result["ai_drafts"][0]["label"] == "Low water intake"
    assert all("Log lunch time" in item["test"] for item in result["ai_drafts"])
    assert result["draft_sent_to_ai"] == sent[0]
    assert "private-name" not in sent[0] and "9876543210" not in sent[0]
