from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.integrations import voice
from backend.integrations.app import app


def test_elevenlabs_voice_uses_server_key_and_local_text_scrubbing(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    monkeypatch.setattr(voice, "scrub_question", lambda text, full_name, email: "Scrubbed demo summary.")

    def provider(url, **kwargs):
        assert kwargs["headers"]["xi-api-key"] == "mock-elevenlabs-key"
        request = httpx.Request("POST", url)
        if url.endswith("/speech-to-text"):
            assert kwargs["data"]["model_id"] == "scribe_v2"
            assert kwargs["files"]["file"] == ("check-in.m4a", b"mock recording", "audio/mp4")
            return httpx.Response(200, json={"text": " Demo transcript "}, request=request)
        assert kwargs["json"]["text"] == "Scrubbed demo summary."
        return httpx.Response(200, content=b"demo mp3", headers={"Content-Type": "audio/mpeg"}, request=request)

    post = Mock(side_effect=provider)
    monkeypatch.setattr(voice.httpx, "post", post)
    synth = "/api/voice/synthesize"
    stt = "/api/voice/transcribe"
    audio = {"audio": ("check-in", b"mock recording", "audio/mp4;codecs=mp4a.40.2")}

    with TestClient(app) as client:
        assert client.post(synth, json={"text": "Private name"}).status_code == 401
        assert client.post(stt, files=audio).status_code == 401
        assert client.post("/api/auth/demo").status_code == 200
        spoken = client.post(synth, json={"text": "Private name"})
        assert spoken.status_code == 200 and spoken.content == b"demo mp3"
        result = client.post(stt, files=audio)
        assert result.json() == {"transcript": "Demo transcript"}
        assert result.headers["cache-control"] == "no-store"
        monkeypatch.setenv("ELEVENLABS_API_KEY", "")
        assert client.post(stt, files=audio).status_code == 503

    assert post.call_count == 2


def test_elevenlabs_payment_error_is_visible_without_provider_details(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "")
    monkeypatch.setattr(voice, "scrub_question", lambda text, full_name, email: text)

    def provider(url, **kwargs):
        assert url.endswith("/JBFqnCBsd6RMkjVDRZzb")
        return httpx.Response(
            402, request=httpx.Request("POST", url),
            json={"detail": {"message": "Private provider diagnostic"}},
        )

    monkeypatch.setattr(voice.httpx, "post", provider)
    with TestClient(app) as client:
        assert client.post("/api/auth/demo").status_code == 200
        response = client.post("/api/voice/synthesize", json={"text": "Demo summary"})
    assert response.status_code == 402
    assert "requires payment" in response.json()["detail"]
    assert "Private provider diagnostic" not in response.text


@pytest.mark.parametrize(("provider_status", "api_status", "message"), [
    (401, 503, "Speech to Text permission"),
    (402, 402, "available credits"),
    (422, 422, "could not read this recording"),
    (429, 429, "rate-limiting transcription"),
])
def test_transcription_reports_actionable_provider_errors(monkeypatch, provider_status, api_status, message):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    post = Mock(return_value=httpx.Response(
        provider_status, request=httpx.Request("POST", "https://api.elevenlabs.io/v1/speech-to-text"),
        json={"detail": {"message": "Private provider diagnostic"}},
    ))
    monkeypatch.setattr(voice.httpx, "post", post)
    with TestClient(app) as client:
        client.post("/api/auth/demo").raise_for_status()
        response = client.post("/api/voice/transcribe", files={"audio": ("check-in", b"audio", "audio/webm")})
    assert response.status_code == api_status
    assert message in response.json()["detail"]
    assert "Private provider diagnostic" not in response.text
