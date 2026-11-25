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
    pass


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


def render_audio(voice: str, key: str, payload: dict) -> bytes:
    try:
        response = httpx.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
            headers={"xi-api-key": key, "Accept": "audio/mpeg"}, json=payload, timeout=30,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        raise AudioUnavailable("ElevenLabs narration is temporarily unavailable.") from exc
    if not response.content or not response.headers.get("content-type", "").startswith("audio/"):
        raise AudioUnavailable("ElevenLabs returned no audio.")
    return response.content


def weekly_report() -> dict:
    lines = report_lines()
    load_dotenv()
    voice = os.environ.get("ELEVENLABS_VOICE_ID", "")
    key = os.environ.get("ELEVENLABS_API_KEY")
    if not VOICE_ID.fullmatch(voice):
        raise AudioUnavailable("Configure ELEVENLABS_VOICE_ID.")
    payload = {"model_id": "eleven_multilingual_v2", "text": "\n".join(line["text"] for line in lines)}
    digest = hashlib.sha256(json.dumps([voice, payload], sort_keys=True).encode()).hexdigest()

    with CACHE_LOCK:
        if audio_path(digest) is None:
            if not key:
                raise AudioUnavailable("Configure ELEVENLABS_API_KEY.")
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
