"""Authenticated ElevenLabs voice endpoints using a server-side key."""

import os
from typing import Annotated

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, StringConstraints

from backend.auth.dependencies import CurrentUser, get_current_user
from backend.integrations.weekly import VOICE_ID, AudioUnavailable, render_audio
from backend.privacy.questions import PrivacyUnavailable, scrub_question

router = APIRouter(prefix="/api/voice", tags=["ElevenLabs"])
User = Annotated[CurrentUser, Depends(get_current_user)]
MAX_AUDIO_BYTES = 3 * 1024 * 1024


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
    voice = os.environ.get("ELEVENLABS_VOICE_ID") or "JBFgb5emg6NvDSbF7uTX"
    if not VOICE_ID.fullmatch(voice):
        raise HTTPException(503, "Configure a valid ELEVENLABS_VOICE_ID.")
    try:
        clean = scrub_question(body.text, user.full_name, user.email)
        audio = render_audio(voice, key, {"model_id": "eleven_multilingual_v2", "text": clean})
    except PrivacyUnavailable:
        raise HTTPException(503, "Local privacy setup is required for narration.") from None
    except AudioUnavailable:
        raise HTTPException(502, "ElevenLabs narration is temporarily unavailable.") from None
    return Response(audio, media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


@router.post("/transcribe", dependencies=[Depends(get_current_user)])
def transcribe(audio: Annotated[UploadFile, File()], response: Response) -> dict:
    key = _key()
    media_type = audio.content_type or ""
    if not media_type.startswith("audio/") and media_type != "video/webm":
        raise HTTPException(415, "Upload a supported audio recording.")
    data = audio.file.read(MAX_AUDIO_BYTES + 1)
    if not data or len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(400, "Record a clip under 3 MB before transcribing.")
    try:
        result = httpx.post(
            "https://api.elevenlabs.io/v1/speech-to-text",
            headers={"xi-api-key": key},
            data={"model_id": "scribe_v2", "timestamps_granularity": "none", "tag_audio_events": "false"},
            files={"file": ("check-in", data, media_type)},
            timeout=30,
        )
        result.raise_for_status()
        text = result.json().get("text")
    except (httpx.HTTPError, ValueError, AttributeError):
        raise HTTPException(502, "ElevenLabs transcription is temporarily unavailable.") from None
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(422, "ElevenLabs did not detect any speech.")
    response.headers["Cache-Control"] = "no-store"
    return {"transcript": text.strip()}
