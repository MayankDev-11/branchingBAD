"""Free-tier Gemini selector for generated demo evidence only."""

import json
import os
from typing import Literal

import httpx
from pydantic import BaseModel, ConfigDict, Field

MODEL_ID = "gemini-3.5-flash-lite"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_ID}:generateContent"
SYSTEM = (
    "Select relevant hypotheses from RootTrace's fictional demo evidence. "
    "Use only the supplied hypothesis ranks. Observed associations do not establish causation. "
    "Return an empty list if no supplied hypothesis is relevant to the topic."
)


class GeminiUnavailable(RuntimeError):
    """A sanitized failure that can be rendered without exposing provider details."""


class Selection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    ranks: list[int] = Field(max_length=3)


class Draft(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    rank: int = Field(ge=1)
    approach: Literal["compare_logs", "track_prospectively"]


class DraftSelection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    drafts: list[Draft] = Field(max_length=3)


def select_ranks(topic: str, hypotheses: list[dict]) -> tuple[list[int], str]:
    selection, audit = _request(topic, hypotheses, SYSTEM, Selection)
    return selection.ranks, audit


def propose_drafts(topic: str, hypotheses: list[dict]) -> tuple[list[Draft], str]:
    system = (
        "Draft up to three distinct investigation sub-branches for this fictional demo. "
        "Choose each factor by its supplied rank. Choose compare_logs when there are useful comparisons "
        "in the existing logs, or track_prospectively when more observations would clarify the pattern. "
        "The choices are hypotheses to test. Do not infer causation or present an outcome as established."
    )
    selection, audit = _request(topic, hypotheses, system, DraftSelection)
    return selection.drafts, audit


def _request(topic, hypotheses, system, schema):
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise GeminiUnavailable("Set GEMINI_API_KEY for the Gemini demo.")
    payload = {
        "systemInstruction": {"parts": [{"text": system}]},
        "contents": [{"role": "user", "parts": [{"text": json.dumps({
            "topic": topic,
            "hypotheses": [
                {key: candidate[key] for key in ("rank", "text", "claims")}
                for candidate in hypotheses
            ],
        }, ensure_ascii=False, separators=(",", ":"))}]}],
        "generationConfig": {
            "temperature": 0,
            "maxOutputTokens": 1024,
            "responseMimeType": "application/json",
            "responseJsonSchema": schema.model_json_schema(),
        },
        "safetySettings": [
            {"category": category, "threshold": "BLOCK_MEDIUM_AND_ABOVE"}
            for category in (
                "HARM_CATEGORY_HARASSMENT", "HARM_CATEGORY_HATE_SPEECH",
                "HARM_CATEGORY_SEXUALLY_EXPLICIT", "HARM_CATEGORY_DANGEROUS_CONTENT",
            )
        ],
    }
    audit = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    try:
        response = httpx.post(
            ENDPOINT, content=audit.encode("utf-8"),
            headers={"x-goog-api-key": api_key, "Content-Type": "application/json"},
            timeout=httpx.Timeout(20, connect=5), follow_redirects=False,
        )
        response.raise_for_status()
        candidates = response.json()["candidates"]
        candidate = candidates[0]
        if candidate.get("finishReason") != "STOP":
            raise GeminiUnavailable("Gemini did not finish the demo answer.")
        output = "".join(
            part["text"] for part in candidate["content"]["parts"]
            if "text" in part and not part.get("thought")
        )
        selection = schema.model_validate_json(output)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            raise GeminiUnavailable("Gemini quota is exhausted. Try again later.") from None
        if exc.response.status_code in (400, 401, 403):
            raise GeminiUnavailable("Check the Gemini API key and project access.") from None
        raise GeminiUnavailable("Gemini is temporarily unavailable.") from None
    except (httpx.RequestError, ValueError, KeyError, IndexError, TypeError):
        raise GeminiUnavailable("Gemini returned no usable demo answer.") from None
    return selection, audit
