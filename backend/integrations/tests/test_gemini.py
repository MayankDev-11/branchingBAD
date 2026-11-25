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
    assert sent["topic"] == "Headache patterns in the fictional demo"
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
