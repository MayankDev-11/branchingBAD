import json
from unittest.mock import Mock

import httpx
import pytest

from backend.ai import gemini
from backend.ai.ask import ask
from backend.ai.evidence import UnknownBranch


@pytest.fixture
def gemini_demo(monkeypatch):
    monkeypatch.setenv("ROOTTRACE_AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "mock-key")
    return monkeypatch


def test_gemini_only_gets_a_fixed_topic_and_synthetic_evidence(gemini_demo):
    post = Mock(return_value=httpx.Response(200, json={
        "candidates": [{
            "finishReason": "STOP",
            "content": {"parts": [{"text": '{"ranks":[1,1,999]}'}]},
        }],
    }, request=httpx.Request("POST", gemini.ENDPOINT)))
    gemini_demo.setattr(gemini.httpx, "post", post)
    answer = ask(
        "My name is Test Person, call 9876543210. Do headaches follow short sleep?",
        "br_1", full_name="Test Person", email="private@example.test",
    )
    post.assert_called_once()
    request = post.call_args.kwargs
    audit = answer.sent_to_ai
    assert request["content"].decode("utf-8") == audit
    assert request["headers"]["x-goog-api-key"] == "mock-key"
    for private in ("Test Person", "9876543210", "private@example.test", "mock-key", "source_file", "device"):
        assert private not in audit
    sent = json.loads(json.loads(audit)["contents"][0]["parts"][0]["text"])
    assert sent["topic"] == "Sleep and headaches in the fictional demo"
    assert [item["text"] for item in sent["hypotheses"]] == ["Short sleep"]
    assert [item.rank for item in answer.hypotheses] == [1]
    assert answer.hypotheses[0].claims
    assert answer.hypotheses[0].claims[0].record_ids == sent["hypotheses"][0]["claims"][0]["record_ids"]


def test_gemini_rejects_unknown_branches_and_safety_gate_runs_first(gemini_demo):
    post = Mock(side_effect=AssertionError("Provider must not be called"))
    gemini_demo.setattr(gemini.httpx, "post", post)
    assert ask("I have chest pain", "br_1").red_flag
    with pytest.raises(UnknownBranch):
        ask("How did I sleep?", "br_unknown")
    post.assert_not_called()


def test_gemini_quota_error_does_not_include_provider_details(gemini_demo):
    post = Mock(return_value=httpx.Response(
        429, json={"error": {"message": "mock-key"}}, request=httpx.Request("POST", gemini.ENDPOINT)
    ))
    gemini_demo.setattr(gemini.httpx, "post", post)
    with pytest.raises(gemini.GeminiUnavailable, match="quota is exhausted") as exc:
        ask("Headache patterns?", "br_1")
    assert "mock-key" not in str(exc.value)


def test_water_question_sends_only_water_evidence(gemini_demo):
    post = Mock(return_value=httpx.Response(200, json={
        "candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": '{"ranks":[2]}'}]}}],
    }, request=httpx.Request("POST", gemini.ENDPOINT)))
    gemini_demo.setattr(gemini.httpx, "post", post)
    result = ask("What does water intake have to do with headaches?", "br_1")
    assert [item.text for item in result.hypotheses] == ["Low water intake"]
    sent = json.loads(json.loads(result.sent_to_ai)["contents"][0]["parts"][0]["text"])
    assert [item["rank"] for item in sent["hypotheses"]] == [2]


def test_demo_uses_local_answers_for_next_step_readings_and_unsupported_questions(gemini_demo, fresh_store):
    post = Mock(side_effect=AssertionError("These questions stay local"))
    gemini_demo.setattr(gemini.httpx, "post", post)

    next_step = ask("What should I do next?", None)
    assert next_step.hypotheses[0].text == "Continue the locked experiment"
    assert "locked success criterion" in next_step.hypotheses[0].test
    fresh_store.advance(10)
    assert ask("What should I do next?", "br_1").hypotheses[0].text == "Review the completed experiment"

    sleep = ask("How much did I sleep last week?", "br_1")
    assert sleep.hypotheses[0].claims[0].text.startswith("Sleep averaged ")
    assert len(sleep.hypotheses[0].claims[0].record_ids) == 7
    day = ask("How much did I sleep on Nov 3?", None)
    assert day.hypotheses[0].claims[0].record_ids == ["sl_0071"]
    assert "2026-11-03" in day.hypotheses[0].claims[0].text
    shift = ask("Why did sleep drop on Nov 3?", None)
    assert "47 min" in shift.hypotheses[0].claims[0].text
    assert shift.hypotheses[0].claims[0].record_ids

    assert not ask("What did I eat for lunch?", "br_1").hypotheses
    assert not ask("What medicine should I take for a headache?", "br_1").hypotheses
    assert not next_step.sent_to_ai
    assert not sleep.sent_to_ai
    post.assert_not_called()


# --- Automatic retries for temporary Gemini failures (added 26 Nov) -------------------------

def _gemini_reply(status, ranks="[1]"):
    body = {"error": {"message": "busy"}} if status != 200 else {
        "candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": f'{{"ranks":{ranks}}}'}]}}],
    }
    return httpx.Response(status, json=body, request=httpx.Request("POST", gemini.ENDPOINT))


@pytest.fixture
def no_wait(gemini_demo):
    waits = []
    gemini_demo.setattr(gemini, "_sleep", waits.append)
    return waits


def test_busy_gemini_is_retried_quietly_and_then_answers(gemini_demo, no_wait):
    post = Mock(side_effect=[_gemini_reply(503), _gemini_reply(503), _gemini_reply(200)])
    gemini_demo.setattr(gemini.httpx, "post", post)
    answer = ask("Why do I keep getting headaches?", "br_1")
    assert post.call_count == 3
    assert no_wait == [1.0, 2.0]
    assert answer.hypotheses  # the user never saw the two failures


def test_gemini_says_busy_with_retry_hint_after_three_failed_attempts(gemini_demo, no_wait):
    post = Mock(return_value=_gemini_reply(503))
    gemini_demo.setattr(gemini.httpx, "post", post)
    with pytest.raises(gemini.GeminiUnavailable, match=r"busy right now \(tried 3 times\)\. Press Retry"):
        ask("Why do I keep getting headaches?", "br_1")
    assert post.call_count == gemini.MAX_ATTEMPTS == 3


def test_timeouts_are_retried_but_key_and_quota_errors_are_not(gemini_demo, no_wait):
    request = httpx.Request("POST", gemini.ENDPOINT)
    post = Mock(side_effect=[httpx.ReadTimeout("slow", request=request), _gemini_reply(200)])
    gemini_demo.setattr(gemini.httpx, "post", post)
    assert ask("Why do I keep getting headaches?", "br_1").hypotheses
    assert post.call_count == 2

    for status, message in ((429, "quota is exhausted"), (403, "Check the Gemini API key")):
        post = Mock(return_value=_gemini_reply(status))
        gemini_demo.setattr(gemini.httpx, "post", post)
        with pytest.raises(gemini.GeminiUnavailable, match=message):
            ask("Why do I keep getting headaches?", "br_1")
        assert post.call_count == 1  # asking again would give the same error, so no retry
