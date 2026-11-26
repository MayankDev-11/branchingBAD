"""Authenticated ElevenLabs voice endpoints using a server-side key."""

import os
from typing import Annotated

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, StringConstraints

from backend.auth.dependencies import CurrentUser, get_current_user
from backend.integrations.weekly import DEFAULT_VOICE_ID, VOICE_ID, AudioUnavailable, render_audio
from backend.privacy.questions import PrivacyUnavailable, scrub_identifiers, scrub_question

router = APIRouter(prefix="/api/voice", tags=["ElevenLabs"])
User = Annotated[CurrentUser, Depends(get_current_user)]
MAX_AUDIO_BYTES = 3 * 1024 * 1024
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
    text: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=2000)]


def _key() -> str:
    load_dotenv()
    key = os.environ.get("ELEVENLABS_API_KEY", "").strip()
    if not key:
        raise HTTPException(503, "Set ELEVENLABS_API_KEY in the backend environment.")
    return key


@router.post("/synthesize")
def synthesize(body: SpeechRequest, user: User) -> Response:
    key = _key()
    voice = os.environ.get("ELEVENLABS_VOICE_ID", "").strip() or DEFAULT_VOICE_ID
    if not VOICE_ID.fullmatch(voice):
        raise HTTPException(503, "Configure a valid ELEVENLABS_VOICE_ID.")
    try:
        try:
            clean = scrub_question(body.text, user.full_name, user.email)
        except PrivacyUnavailable:
            # Fall back to deterministic regex + user-identifier scrubbing when spaCy/Presidio is not installed.
            clean = scrub_identifiers(body.text, user.full_name, user.email)
        audio = render_audio(voice, key, {"model_id": "eleven_multilingual_v2", "text": clean})
    except AudioUnavailable as exc:
        raise HTTPException(exc.status_code, str(exc)) from None
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@router.post("/transcribe", dependencies=[Depends(get_current_user)])
def transcribe(audio: Annotated[UploadFile, File()], response: Response) -> dict:
    key = _key()
    media_type = (audio.content_type or "").partition(";")[0].strip().lower()
    if not media_type.startswith("audio/") and media_type != "video/webm":
        raise HTTPException(415, "Upload a supported audio recording.")
    data = audio.file.read(MAX_AUDIO_BYTES + 1)
    if not data:
        raise HTTPException(400, "No audio was captured. Start a new recording and speak before stopping.")
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "The recording exceeds 3 MB. Try a shorter clip.")
    filename = f"check-in{AUDIO_EXTENSIONS.get(media_type, '')}"
    try:
        result = httpx.post(
            "https://api.elevenlabs.io/v1/speech-to-text",
            headers={"xi-api-key": key},
            data={"model_id": "scribe_v2", "timestamps_granularity": "none", "tag_audio_events": "false"},
            files={"file": (filename, data, media_type)},
            timeout=30,
        )
        result.raise_for_status()
        text = result.json().get("text")
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        if status in (401, 403):
            raise HTTPException(503, "ElevenLabs rejected the key or its Speech to Text permission.") from None
        if status == 402:
            raise HTTPException(402, "ElevenLabs requires payment or available credits for transcription.") from None
        if status == 429:
            raise HTTPException(429, "ElevenLabs is rate-limiting transcription. Try again shortly.") from None
        if status in (400, 415, 422):
            raise HTTPException(422, "ElevenLabs could not read this recording. Try another recording.") from None
        raise HTTPException(502, "ElevenLabs transcription is temporarily unavailable.") from None
    except httpx.TimeoutException:
        raise HTTPException(504, "ElevenLabs took too long to transcribe this clip. Try a shorter recording.") from None
    except (httpx.HTTPError, ValueError, AttributeError):
        raise HTTPException(502, "ElevenLabs transcription is temporarily unavailable.") from None
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(422, "ElevenLabs did not detect any speech.")
    response.headers["Cache-Control"] = "no-store"
    return {"transcript": text.strip()}
