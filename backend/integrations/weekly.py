"""Deterministic cited report and cached ElevenLabs narration."""

import hashlib
import json
import os
import re
from pathlib import Path
from tempfile import NamedTemporaryFile
from threading import Lock

import httpx
from dotenv import load_dotenv

from backend.analysis.patterns import fmt
from backend.analysis.series import days, load_series
from backend.data.store import store

CACHE = Path(__file__).resolve().parents[2] / "data" / "uploads" / "weekly-audio"
VOICE_ID = re.compile(r"[A-Za-z0-9_-]{1,64}")
DEFAULT_VOICE_ID = "JBFqnCBsd6RMkjVDRZzb"
AUDIO_ID = re.compile(r"[a-f0-9]{64}")
CACHE_LOCK = Lock()
METRICS = (
    ("sleep_min", "Sleep"),
    ("water_ml", "Water intake"),
    ("screen_late_min", "Late screen time"),
    ("steps", "Steps"),
    ("headache", "Headaches"),
)


class AudioUnavailable(RuntimeError):
    def __init__(self, message: str, status_code: int = 502):
        super().__init__(message)
        self.status_code = status_code


def report_lines() -> list[dict]:
    lines = []
    with store.connection() as conn:
        clock = store.clock
        for metric, label in METRICS:
            values, ids = load_series(conn, metric, clock - days(6), clock)
            if values.empty:
                text = f"{label}: no readings in the last seven days."
            elif metric == "headache":
                text = f"Headaches were logged on {int(values.sum())} of {len(values)} days with an entry."
            else:
                text = f"{label} averaged {fmt(metric, values.mean())} across {len(values)} days with a reading."
            lines.append({"text": text, "record_ids": ids.tolist()})
    return lines


def audio_path(audio_id: str) -> Path | None:
    if not AUDIO_ID.fullmatch(audio_id):
        return None
    path = CACHE / f"{audio_id}.mp3"
    return path if path.is_file() and path.stat().st_size else None


def _provider_error_token(response: httpx.Response) -> str:
    """Extract only safe machine error/field codes from ElevenLabs JSON (never raw messages or secrets)."""
    try:
        detail = response.json().get("detail")
    except (ValueError, AttributeError):
        return ""
    if isinstance(detail, dict):
        status = detail.get("status")
        if isinstance(status, str) and re.fullmatch(r"[a-z0-9_]{1,48}", status):
            return status
    if isinstance(detail, list):
        fields = [
            ".".join(str(part) for part in item.get("loc", []) if re.fullmatch(r"[A-Za-z0-9_-]{1,32}", str(part)))
            for item in detail
            if isinstance(item, dict)
        ]
        cleaned = [f for f in fields if f]
        if cleaned:
            return ", ".join(cleaned[:3])
    return ""


def render_audio(voice: str, key: str, payload: dict) -> bytes:
    try:
        response = httpx.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
            headers={"xi-api-key": key, "Accept": "audio/mpeg"}, json=payload, timeout=30,
        )
        response.raise_for_status()
    except httpx.HTTPStatusError as exc:
        status = exc.response.status_code
        token = _provider_error_token(exc.response)
        suffix = f" ({token})" if token else ""
        if status == 402:
            raise AudioUnavailable(
                f"ElevenLabs requires payment for this voice or the account is out of credits{suffix}.", 402
            ) from None
        if status in (401, 403):
            raise AudioUnavailable("ElevenLabs rejected the API key or its Text to Speech permission.", 503) from None
        if status == 404:
            raise AudioUnavailable("ElevenLabs could not find the configured voice.", 503) from None
        if status == 422:
            raise AudioUnavailable(
                f"ElevenLabs rejected the synthesis request (422{f': {token}' if token else ''}).", 422
            ) from None
        if status == 429:
            raise AudioUnavailable("ElevenLabs is rate-limiting narration. Try again shortly.", 429) from None
        raise AudioUnavailable("ElevenLabs could not generate narration.") from None
    except httpx.HTTPError as exc:
        raise AudioUnavailable("ElevenLabs narration is temporarily unavailable.") from exc
    if not response.content or not response.headers.get("content-type", "").startswith("audio/"):
        raise AudioUnavailable("ElevenLabs returned no audio.")
    return response.content


def weekly_report() -> dict:
    lines = report_lines()
    load_dotenv()
    voice = os.environ.get("ELEVENLABS_VOICE_ID", "").strip() or DEFAULT_VOICE_ID
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not VOICE_ID.fullmatch(voice):
        raise AudioUnavailable("Configure ELEVENLABS_VOICE_ID.", 503)
    tts_model = os.environ.get("ELEVENLABS_TTS_MODEL", "").strip() or "eleven_v4_turbo"
    payload = {"model_id": tts_model, "text": "\n".join(line["text"] for line in lines)}
    digest = hashlib.sha256(json.dumps([voice, payload], sort_keys=True).encode()).hexdigest()

    with CACHE_LOCK:
        if audio_path(digest) is None:
            if not key:
                raise AudioUnavailable("Configure ELEVENLABS_API_KEY.", 503)
            try:
                audio = render_audio(voice, key, payload)
                CACHE.mkdir(parents=True, exist_ok=True)
                with NamedTemporaryFile(dir=CACHE, delete=False) as writer:
                    pending = Path(writer.name)
                    try:
                        writer.write(audio)
                        writer.close()
                        pending.replace(CACHE / f"{digest}.mp3")
                    finally:
                        pending.unlink(missing_ok=True)
            except (httpx.HTTPError, OSError) as exc:
                raise AudioUnavailable("Weekly report audio is temporarily unavailable.") from exc
    return {"lines": lines, "audio_url": f"/api/report/weekly/audio/{digest}"}
