from unittest.mock import Mock

import httpx
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
            assert kwargs["files"]["file"][1] == b"mock recording"
            return httpx.Response(200, json={"text": " Demo transcript "}, request=request)
        assert kwargs["json"]["text"] == "Scrubbed demo summary."
        return httpx.Response(200, content=b"demo mp3", headers={"Content-Type": "audio/mpeg"}, request=request)

    post = Mock(side_effect=provider)
    monkeypatch.setattr(voice.httpx, "post", post)
    synth = "/api/voice/synthesize"
    stt = "/api/voice/transcribe"
    audio = {"audio": ("clip.webm", b"mock recording", "audio/webm")}

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
