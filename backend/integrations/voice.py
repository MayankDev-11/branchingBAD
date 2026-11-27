"""Authenticated ElevenLabs voice endpoints using a server-side key."""

import os
import re
from typing import Annotated

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile
from pydantic import BaseModel, StringConstraints

from backend.ai.gemini import translate_text
from backend.auth.dependencies import CurrentUser, get_current_user
from backend.integrations.weekly import VOICE_ID, AudioUnavailable, _provider_error_token, render_audio
from backend.privacy.questions import (
    PrivacyUnavailable,
    scrub_identifiers,
    scrub_question,
)

router = APIRouter(prefix="/api/voice", tags=["ElevenLabs"])
User = Annotated[CurrentUser, Depends(get_current_user)]
MAX_AUDIO_BYTES = 3 * 1024 * 1024
DEFAULT_STT_MODEL = "scribe_v3"
DEFAULT_TTS_MODEL = "eleven_v4_turbo"
LANGUAGE_CODE = re.compile(r"[a-z]{2,3}(?:-[a-z0-9]{2,4})?")
_ISO3_TO_ISO1 = {"eng": "en", "hin": "hi", "kan": "kn"}

VOICE_PRESETS = {
    "sarah": {
        "id": "EXAVITQu4vr4xnSDxMaL",
        "label": "Sarah",
        "gender": "female",
        "style": "Soft narrator",
    },
    "laura": {
        "id": "FGY2WhTYpPnrIDTdsKH5",
        "label": "Laura",
        "gender": "female",
        "style": "Warm & upbeat",
    },
    "george": {
        "id": "JBFqnCBsd6RMkjVDRZzb",
        "label": "George",
        "gender": "male",
        "style": "Articulate anchor",
    },
    "charlie": {
        "id": "IKne3meq5aSn9XLyUdCD",
        "label": "Charlie",
        "gender": "male",
        "style": "Friendly baritone",
    },
}

QUICK_LANGUAGES = (
    {"code": "en", "label": "English", "native_label": "English"},
    {"code": "hi", "label": "Hindi", "native_label": "हिन्दी"},
    {"code": "kn", "label": "Kannada", "native_label": "ಕನ್ನಡ"},
)

AUDIO_EXTENSIONS = {
    "audio/aac": ".aac",
    "audio/mp4": ".m4a",
    "audio/mpeg": ".mp3",
    "audio/ogg": ".ogg",
    "audio/wav": ".wav",
    "audio/webm": ".webm",
    "audio/x-wav": ".wav",
    "video/webm": ".webm",
}


class SpeechRequest(BaseModel):
    text: Annotated[
        str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)
    ]
    voice_key: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40)
        ]
        | None
    ) = None
    language_code: (
        Annotated[
            str, StringConstraints(strip_whitespace=True, min_length=2, max_length=12)
        ]
        | None
    ) = None
    translate: bool = False


def _key() -> str:
    load_dotenv()
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "Set ELEVENLABS_API_KEY in the backend environment.")
    return key


def _normalize_lang(code: str | None) -> str:
    raw = (code or "").strip().lower()
    if not raw or raw == "auto":
        return ""
    if not LANGUAGE_CODE.fullmatch(raw):
        raise HTTPException(422, "Unsupported language_code format.")
    base = raw.split("-")[0]
    return _ISO3_TO_ISO1.get(base, base)


def _scrub_local(text: str, user: CurrentUser) -> str:
    try:
        return scrub_question(text, user.full_name, user.email)
    except PrivacyUnavailable:
        # Fall back to deterministic regex + user-identifier scrubbing when spaCy/Presidio is not installed.
        return scrub_identifiers(text, user.full_name, user.email)


def _resolve_voice(voice_key: str | None) -> str:
    if voice_key is not None:
        preset = VOICE_PRESETS.get(voice_key.strip().lower())
        if preset is None:
            raise HTTPException(422, f"Unknown voice preset '{voice_key}'.")
        return preset["id"]
    voice = (
        os.environ.get("ELEVENLABS_VOICE_ID", "").strip()
        or VOICE_PRESETS["sarah"]["id"]
    )
    if not VOICE_ID.fullmatch(voice):
        raise HTTPException(503, "Configure a valid ELEVENLABS_VOICE_ID.")
    return voice


@router.get("/presets", dependencies=[Depends(get_current_user)])
def list_presets(response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    return {
        "presets": [
            {
                "key": key,
                "label": meta["label"],
                "gender": meta["gender"],
                "style": meta["style"],
            }
            for key, meta in VOICE_PRESETS.items()
        ],
        "languages": list(QUICK_LANGUAGES),
        "total_languages": "90+",
        "default_voice": "sarah",
        "default_language": "en",
    }


@router.post("/synthesize")
def synthesize(body: SpeechRequest, user: User) -> Response:
    key = _key()
    voice = _resolve_voice(body.voice_key)
    lang = _normalize_lang(body.language_code) if body.language_code else ""
    try:
        clean = _scrub_local(body.text, user)
        spoken = (
            translate_text(clean, lang, preserve_clinical_tokens=True)
            if (body.translate and lang and lang != "en")
            else clean
        )
        tts_model = (
            os.environ.get("ELEVENLABS_TTS_MODEL", "").strip() or DEFAULT_TTS_MODEL
        )
        # Bracketed redaction markers can be interpreted as audio cues by expressive models.
        narration = " ".join(re.sub(r"\[\s*REDACTED\s*\]", " ", spoken, flags=re.I).split())
        if not any(char.isalnum() for char in narration):
            raise HTTPException(422, "No narratable text remains after redaction.")
        payload = {"model_id": tts_model, "text": narration}
        if lang and tts_model != "eleven_multilingual_v2":
            payload["language_code"] = lang
        audio = render_audio(voice, key, payload)
    except AudioUnavailable as exc:
        raise HTTPException(exc.status_code, str(exc)) from None
    return Response(
        audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"}
    )


@router.post("/transcribe")
def transcribe(
    audio: Annotated[UploadFile, File()],
    user: User,
    response: Response,
    language_code: Annotated[str | None, Form()] = None,
) -> dict:
    key = _key()
    requested_lang = _normalize_lang(language_code)
    media_type = (audio.content_type or "").partition(";")[0].strip().lower()
    if not media_type.startswith("audio/") and media_type != "video/webm":
        raise HTTPException(415, "Upload a supported audio recording.")
    data = audio.file.read(MAX_AUDIO_BYTES + 1)
    if not data:
        raise HTTPException(
            400,
            "No audio was captured. Start a new recording and speak before stopping.",
        )
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "The recording exceeds 3 MB. Try a shorter clip.")
    filename = f"check-in{AUDIO_EXTENSIONS.get(media_type, '')}"
    stt_model = os.environ.get("ELEVENLABS_STT_MODEL", "").strip() or DEFAULT_STT_MODEL
    stt_data = {
        "model_id": stt_model,
        "timestamps_granularity": "none",
        "tag_audio_events": "false",
    }
    if requested_lang:
        stt_data["language_code"] = requested_lang
    try:
        result = httpx.post(
            "https://api.elevenlabs.io/v1/speech-to-text",
            headers={"xi-api-key": key},
            data=stt_data,
            files={"file": (filename, data, media_type)},
            timeout=30,
        )
        result.raise_for_status()
        payload = result.json()
        text = payload.get("text")
        detected_raw = payload.get("language_code")
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        token = _provider_error_token(exc.response)
        suffix = f" ({token})" if token else ""
        if status in (401, 403):
            raise HTTPException(
                503, "ElevenLabs rejected the key or its Speech to Text permission."
            ) from None
        if status == 402:
            raise HTTPException(
                402,
                f"ElevenLabs requires payment or available credits for transcription{suffix}.",
            ) from None
        if status == 429:
            raise HTTPException(
                429, "ElevenLabs is rate-limiting transcription. Try again shortly."
            ) from None
        if status in (400, 415, 422):
            raise HTTPException(
                422, f"ElevenLabs could not read this recording{suffix}. Try another recording."
            ) from None
        raise HTTPException(
            502, "ElevenLabs transcription is temporarily unavailable."
        ) from None
    except httpx.TimeoutException:
        raise HTTPException(
            504,
            "ElevenLabs took too long to transcribe this clip. Try a shorter recording.",
        ) from None
    except (httpx.HTTPError, ValueError, AttributeError):
        raise HTTPException(
            502, "ElevenLabs transcription is temporarily unavailable."
        ) from None
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(422, "ElevenLabs did not detect any speech.")

    clean_text = text.strip()
    resolved_lang = ""
    if isinstance(detected_raw, str) and detected_raw.strip():
        raw_base = detected_raw.strip().lower().split("-")[0]
        resolved_lang = _ISO3_TO_ISO1.get(raw_base, raw_base)
    resolved_lang = resolved_lang or requested_lang or "en"
    if resolved_lang != "en":
        scrubbed = _scrub_local(clean_text, user)
        english_text = translate_text(scrubbed, "en", preserve_clinical_tokens=True)
    else:
        english_text = clean_text

    response.headers["Cache-Control"] = "no-store"
    return {
        "text": clean_text,
        "transcript": clean_text,
        "language_code": resolved_lang,
        "english_text": english_text,
    }
