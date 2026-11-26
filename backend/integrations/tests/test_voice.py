from unittest.mock import Mock

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.integrations import voice, weekly
from backend.integrations.app import app
from backend.privacy.questions import is_red_flag


def test_elevenlabs_voice_uses_server_key_and_local_text_scrubbing(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    monkeypatch.setenv("ELEVENLABS_STT_MODEL", "")
    monkeypatch.setenv("ELEVENLABS_TTS_MODEL", "")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "")
    monkeypatch.setattr(voice, "scrub_question", lambda text, full_name, email: "Scrubbed demo summary.")

    def provider(url, **kwargs):
        assert kwargs["headers"]["xi-api-key"] == "mock-elevenlabs-key"
        request = httpx.Request("POST", url)
        if url.endswith("/speech-to-text"):
            assert kwargs["data"]["model_id"] == "scribe_v3"
            assert "language_code" not in kwargs["data"]
            assert kwargs["files"]["file"] == ("check-in.m4a", b"mock recording", "audio/mp4")
            return httpx.Response(200, json={"text": " Demo transcript "}, request=request)
        assert url.endswith(f"/{voice.VOICE_PRESETS['sarah']['id']}")
        assert kwargs["json"]["model_id"] == "eleven_v4_turbo"
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
        assert result.json() == {
            "text": "Demo transcript",
            "transcript": "Demo transcript",
            "language_code": "en",
            "english_text": "Demo transcript",
        }
        assert result.headers["cache-control"] == "no-store"
        monkeypatch.setenv("ELEVENLABS_API_KEY", "")
        assert client.post(stt, files=audio).status_code == 503

    assert post.call_count == 2


def test_elevenlabs_payment_error_is_visible_without_provider_details(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "")
    monkeypatch.setattr(voice, "scrub_question", lambda text, full_name, email: text)

    def provider(url, **kwargs):
        assert url.endswith(f"/{voice.VOICE_PRESETS['sarah']['id']}")
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


def test_elevenlabs_synthesize_falls_back_when_spacy_unavailable(monkeypatch):
    from backend.privacy.questions import PrivacyUnavailable

    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    monkeypatch.setenv("ELEVENLABS_VOICE_ID", "")
    monkeypatch.setattr(voice, "scrub_question", Mock(side_effect=PrivacyUnavailable("missing spacy")))

    def provider(url, **kwargs):
        sent = kwargs["json"]["text"]
        assert "Judge" not in sent
        assert "demo@roottrace.local" not in sent
        assert "9876543210" not in sent
        return httpx.Response(
            200, content=b"demo mp3", headers={"Content-Type": "audio/mpeg"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(voice.httpx, "post", provider)
    with TestClient(app) as client:
        client.post("/api/auth/demo").raise_for_status()
        response = client.post(
            "/api/voice/synthesize",
            json={"text": "Judge Demo Workspace demo@roottrace.local 9876543210 summary"},
        )
    assert response.status_code == 200
    assert response.content == b"demo mp3"


def test_voice_presets_endpoint_returns_curated_voices_and_languages():
    with TestClient(app) as client:
        assert client.get("/api/voice/presets").status_code == 401
        client.post("/api/auth/demo").raise_for_status()
        res = client.get("/api/voice/presets")
    assert res.status_code == 200
    assert res.headers["cache-control"] == "no-store"
    body = res.json()
    assert body["total_languages"] == "90+"
    assert [p["key"] for p in body["presets"]] == ["sarah", "laura", "george", "charlie"]
    assert all("id" not in p for p in body["presets"])
    assert [lang["code"] for lang in body["languages"]] == ["en", "hi", "kn"]


def test_voice_synthesize_validates_presets_and_translates_scrubbed_text(monkeypatch):
    from backend.privacy.questions import PrivacyUnavailable

    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    monkeypatch.setenv("ELEVENLABS_TTS_MODEL", "")
    monkeypatch.setattr(voice, "scrub_question", Mock(side_effect=PrivacyUnavailable("missing spacy")))
    captured = []

    def fake_translate(text, target_language, preserve_clinical_tokens=True):
        assert "Judge" not in text
        assert "[REDACTED]" in text
        assert target_language == "hi"
        return "[REDACTED] नींद में 47 मिनट की कमी"

    def provider(url, **kwargs):
        captured.append((url, kwargs["json"]))
        return httpx.Response(
            200, content=b"mp3-bytes", headers={"Content-Type": "audio/mpeg"},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(voice, "translate_text", fake_translate)
    monkeypatch.setattr(voice.httpx, "post", provider)

    with TestClient(app) as client:
        client.post("/api/auth/demo").raise_for_status()
        bad = client.post("/api/voice/synthesize", json={"text": "Hello", "voice_key": "unknown"})
        assert bad.status_code == 422

        for key, meta in voice.VOICE_PRESETS.items():
            ok = client.post("/api/voice/synthesize", json={"text": f"Check {key}", "voice_key": key})
            assert ok.status_code == 200
            assert captured[-1][0].endswith(f"/{meta['id']}")
            assert captured[-1][1]["model_id"] == "eleven_v4_turbo"

        translated = client.post(
            "/api/voice/synthesize",
            json={
                "text": "Judge slept 47 min less",
                "voice_key": "charlie",
                "language_code": "hi",
                "translate": True,
            },
        )
        assert translated.status_code == 200
        assert captured[-1][0].endswith(f"/{voice.VOICE_PRESETS['charlie']['id']}")
        assert captured[-1][1] == {
            "model_id": "eleven_v4_turbo",
            "text": "[REDACTED] नींद में 47 मिनट की कमी",
            "language_code": "hi",
        }


def test_transcribe_auto_detects_and_translates_non_english(monkeypatch):
    from backend.privacy.questions import PrivacyUnavailable

    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    monkeypatch.setenv("ELEVENLABS_STT_MODEL", "")
    monkeypatch.setattr(voice, "scrub_question", Mock(side_effect=PrivacyUnavailable("missing spacy")))
    calls = []

    def provider(url, **kwargs):
        calls.append(kwargs["data"])
        lang_sent = kwargs["data"].get("language_code")
        return httpx.Response(
            200,
            json={
                "text": " ರಾತ್ರಿ ನಿದ್ದೆ ಕಡಿಮೆ ಆಗುತ್ತಿದೆ " if lang_sent == "kn" else " मेरी नींद कम हो रही है ",
                "language_code": "kan" if lang_sent == "kn" else "hin",
            },
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(voice.httpx, "post", provider)
    monkeypatch.setattr(
        voice,
        "translate_text",
        lambda text, target_language, preserve_clinical_tokens=True: (
            "My sleep is decreasing" if target_language == "en" else text
        ),
    )

    with TestClient(app) as client:
        client.post("/api/auth/demo").raise_for_status()
        auto_res = client.post("/api/voice/transcribe", files={"audio": ("check-in", b"audio", "audio/webm")})
        assert auto_res.status_code == 200
        assert "language_code" not in calls[0]
        assert auto_res.json() == {
            "text": "मेरी नींद कम हो रही है",
            "transcript": "मेरी नींद कम हो रही है",
            "language_code": "hi",
            "english_text": "My sleep is decreasing",
        }

        explicit_res = client.post(
            "/api/voice/transcribe",
            files={"audio": ("check-in", b"audio", "audio/webm")},
            data={"language_code": "kn"},
        )
        assert explicit_res.status_code == 200
        assert calls[1]["language_code"] == "kn"
        assert explicit_res.json()["language_code"] == "kn"
        assert explicit_res.json()["english_text"] == "My sleep is decreasing"


def test_weekly_report_uses_eleven_v4_turbo_by_default(monkeypatch, tmp_path):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    monkeypatch.setenv("ELEVENLABS_TTS_MODEL", "")
    monkeypatch.setattr(weekly, "CACHE", tmp_path)
    monkeypatch.setattr(weekly, "report_lines", lambda: [{"text": "Sleep summary line", "record_ids": ["sl_0071"]}])
    seen_payloads = []

    def fake_render(voice_id, key, payload):
        seen_payloads.append(payload)
        return b"weekly-mp3"

    monkeypatch.setattr(weekly, "render_audio", fake_render)
    res = weekly.weekly_report()
    assert seen_payloads == [{"model_id": "eleven_v4_turbo", "text": "Sleep summary line"}]
    assert res["audio_url"].startswith("/api/report/weekly/audio/")


def test_voice_synthesize_translation_falls_back_gracefully_when_offline(monkeypatch):
    from backend.privacy.questions import PrivacyUnavailable

    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    monkeypatch.setenv("ELEVENLABS_TTS_MODEL", "")
    monkeypatch.setenv("ROOTTRACE_AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "")
    monkeypatch.setenv("BEDROCK_MODEL_ID", "")
    monkeypatch.setattr(voice, "scrub_question", Mock(side_effect=PrivacyUnavailable("missing spacy")))
    captured = []

    def provider(url, **kwargs):
        captured.append(kwargs["json"])
        return httpx.Response(200, content=b"mp3", headers={"Content-Type": "audio/mpeg"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(voice.httpx, "post", provider)
    with TestClient(app) as client:
        client.post("/api/auth/demo").raise_for_status()
        res = client.post(
            "/api/voice/synthesize",
            json={"text": "Judge slept 47 min less", "voice_key": "laura", "language_code": "kn", "translate": True},
        )
    assert res.status_code == 200
    assert captured[0] == {
        "model_id": "eleven_v4_turbo",
        "text": "[REDACTED] slept 47 min less",
        "language_code": "kn",
    }


def test_eleven_multilingual_v2_omits_language_code_and_surfaces_safe_status_tokens(monkeypatch):
    monkeypatch.setenv("ELEVENLABS_API_KEY", "mock-elevenlabs-key")
    monkeypatch.setenv("ELEVENLABS_TTS_MODEL", "eleven_multilingual_v2")
    monkeypatch.setattr(voice, "scrub_question", lambda text, full_name, email: text)
    sent_payloads = []

    def provider_ok(url, **kwargs):
        sent_payloads.append(kwargs["json"])
        return httpx.Response(200, content=b"mp3", headers={"Content-Type": "audio/mpeg"}, request=httpx.Request("POST", url))

    monkeypatch.setattr(voice.httpx, "post", provider_ok)
    with TestClient(app) as client:
        client.post("/api/auth/demo").raise_for_status()
        res = client.post(
            "/api/voice/synthesize",
            json={"text": "Sleep summary", "voice_key": "george", "language_code": "hi", "translate": False},
        )
    assert res.status_code == 200
    assert sent_payloads[0] == {"model_id": "eleven_multilingual_v2", "text": "Sleep summary"}

    def provider_422(url, **kwargs):
        return httpx.Response(
            422,
            request=httpx.Request("POST", url),
            json={"detail": {"status": "invalid_model_id", "message": "Private provider diagnostic"}},
        )

    monkeypatch.setattr(voice.httpx, "post", provider_422)
    with TestClient(app) as client:
        client.post("/api/auth/demo").raise_for_status()
        err = client.post("/api/voice/synthesize", json={"text": "Sleep summary", "voice_key": "sarah"})
    assert err.status_code == 422
    assert "invalid_model_id" in err.json()["detail"]
    assert "Private provider diagnostic" not in err.text


@pytest.mark.parametrize("phrase", [
    "मुझे सीने में दर्द हो रहा है",
    "अचानक बहुत तेज सिरदर्द शुरू हो गया",
    "सांस लेने में तकलीफ हो रही है",
    "ನನಗೆ ಎದೆ ನೋವು ಇದೆ",
    "ಹಠಾತ್ ತೀವ್ರ ತಲೆನೋವು ಬರುತ್ತಿದೆ",
    "ಉಸಿರಾಡಲು ಕಷ್ಟ ಆಗುತ್ತಿದೆ",
])
def test_multilingual_red_flags_trigger_locally(phrase):
    assert is_red_flag(phrase) is True
    with TestClient(app) as client:
        client.post("/api/auth/demo").raise_for_status()
        response = client.post("/api/ask", json={"branch_id": None, "question": phrase})
    assert response.status_code == 200
    assert response.json()["red_flag"] is True
    assert response.json()["hypotheses"] == []


@pytest.mark.parametrize("phrase", [
    "मेरी नींद पिछले हफ्ते कम क्यों हुई?",
    "ರಾತ್ರಿ ನಿದ್ದೆ ಕಡಿಮೆ ಆಗುತ್ತಿರುವುದಕ್ಕೆ ಕಾರಣ ಏನು?",
])
def test_non_emergency_multilingual_questions_do_not_trigger_red_flag(phrase):
    assert is_red_flag(phrase) is False
