import importlib
import json
from copy import deepcopy
from io import BytesIO
from types import SimpleNamespace
from unittest.mock import Mock
from zipfile import ZipFile

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.integrations.app import app
from backend.integrations import weekly
from backend.privacy import questions

ask_service = importlib.import_module("backend.ai.ask")


@pytest.fixture
def browser(monkeypatch, fresh_store):
    monkeypatch.setenv("ENV", "development")
    with TestClient(app) as client:
        assert client.post("/api/auth/demo").status_code == 200
        yield client


def _tool(name, tool_input=None):
    return {"output": {"message": {"content": [{"toolUse": {
        "name": name, "toolUseId": name, "input": tool_input or {},
    }}]}}}


def test_red_flag_short_circuits(browser, monkeypatch):
    scrub = Mock(side_effect=AssertionError("Must not scrub or call a provider"))
    monkeypatch.setattr(ask_service, "scrub_question", scrub)
    response = browser.post("/api/ask", json={"branch_id": None, "question": "I have chest pain"})
    assert response.json() == {
        "red_flag": True, "hypotheses": [], "dropped_claims": 0, "sent_to_ai": "",
    }
    scrub.assert_not_called()


def test_local_scrubbing(monkeypatch):
    class Analyzer:
        def analyze(self, *, text, language):
            assert language == "en"
            start = text.index("Example Person")
            return [SimpleNamespace(start=start, end=start + len("Example Person"))]

    monkeypatch.setattr(questions, "_analyzer", Analyzer)
    result = questions.scrub_question(
        "Mayank met Example Person. +91 98765 43210, 1234 5678 9012, ABCDE1234F, a@b.test",
        full_name="Mayank Kumar",
    )
    for identifier in ("Mayank", "Example Person", "98765", "1234", "ABCDE", "a@b.test"):
        assert identifier not in result


def test_ask_uses_tool_evidence_and_drops_fabricated_claims(browser, monkeypatch):
    monkeypatch.setenv("ROOTTRACE_AI_PROVIDER", "bedrock")
    monkeypatch.setenv("BEDROCK_MODEL_ID", "mock-haiku")
    monkeypatch.setenv("BEDROCK_GUARDRAIL_ID", "mock-guardrail")
    monkeypatch.setenv("BEDROCK_GUARDRAIL_VERSION", "1")
    monkeypatch.setattr(questions, "_analyzer", lambda: SimpleNamespace(analyze=lambda **_: []))
    payloads = []

    def converse(**payload):
        payloads.append(deepcopy(payload))
        if len(payloads) == 1:
            return _tool("branch_patterns")
        if len(payloads) == 2:
            return _tool("recent_summary")
        evidence = json.loads(payload["messages"][2]["content"][0]["toolResult"]["content"][0]["text"])
        good = evidence[0]["claims"][0]
        return _tool("submit_answer", {
            "red_flag": True, "hypotheses": [{
                "rank": evidence[0]["rank"], "text": "Fabricated title with 42 percent",
                "test": "Fabricated treatment", "claims": [
                    good, {**good, "record_ids": ["fake_0000"]},
                    {**good, "text": "99" + good["text"][1:]},
                ],
            }],
            "dropped_claims": 500, "sent_to_ai": "fabricated",
        })

    monkeypatch.setattr(ask_service, "_new_client", lambda: SimpleNamespace(converse=converse))
    response = browser.post("/api/ask", json={
        "branch_id": None, "question": "Why do I get headaches? Call 9876543210.",
    })
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["red_flag"] is False
    assert body["dropped_claims"] == 2
    assert "Fabricated" not in json.dumps(body["hypotheses"])
    assert len(body["hypotheses"][0]["claims"]) == 1
    assert [json.loads(line) for line in body["sent_to_ai"].splitlines()] == payloads
    assert "9876543210" not in body["sent_to_ai"]
    assert "source_file" not in body["sent_to_ai"]
    assert "device" not in body["sent_to_ai"]


def test_claim_tolerance_preserves_wording_and_units():
    assert ask_service._matches_claim("Average was 101 ml", "Average was 100 ml")
    assert not ask_service._matches_claim("Average was 103 ml", "Average was 100 ml")
    assert not ask_service._matches_claim("Average was 100 litres", "Average was 100 ml")


def test_weekly_audio_is_cached_and_authenticated(browser, monkeypatch, tmp_path):
    monkeypatch.setattr(weekly, "CACHE", tmp_path)
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "test-voice")
    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-key")
    request = Mock(return_value=httpx.Response(
        200, content=b"mock-mp3", headers={"Content-Type": "audio/mpeg"},
        request=httpx.Request("POST", "https://api.elevenlabs.io"),
    ))
    monkeypatch.setattr(weekly.httpx, "post", request)
    first = browser.get("/api/report/weekly")
    assert first.status_code == 200, first.text
    report = first.json()
    assert len(report["lines"]) == 5
    for line in report["lines"]:
        assert line["record_ids"]
        assert browser.get(f"/api/records/{line['record_ids'][0]}").status_code == 200
    assert browser.get("/api/report/weekly").json() == report
    request.assert_called_once()
    assert browser.get(report["audio_url"]).content == b"mock-mp3"
    browser.cookies.clear()
    assert browser.get(report["audio_url"]).status_code == 401


def test_obsidian_zip_has_resolvable_links(browser):
    response = browser.get("/api/export/obsidian")
    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    with ZipFile(BytesIO(response.content)) as archive:
        import re

        names = archive.namelist()
        assert "RootTrace.md" in names
        assert any(name.startswith("Investigations/") for name in names)
        assert any(name.startswith("Knowledge/") for name in names)
        assert any(name.startswith("Records/") for name in names)
        for name in names:
            for target in re.findall(r"\[\[([^|\]]+)", archive.read(name).decode()):
                assert f"{target}.md" in names


def test_new_routes_require_sign_in():
    with TestClient(app) as client:
        assert client.post("/api/ask", json={"branch_id": None, "question": "Sleep?"}).status_code == 401
        assert client.get("/api/report/weekly").status_code == 401
        assert client.get("/api/export/obsidian").status_code == 401
