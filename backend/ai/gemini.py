"""Free-tier Gemini selector for generated demo evidence only."""

import json
import os
import re

import httpx
from pydantic import BaseModel, ConfigDict, Field

from backend.privacy.questions import normalized

MODEL_ID = "gemini-3.5-flash-lite"
ENDPOINT = f"https://generativelanguage.googleapis.com/v1beta/models/{MODEL_ID}:generateContent"
SYSTEM = (
    "Select relevant hypotheses from RootTrace's fictional demo evidence. "
    "Use only the supplied hypothesis ranks. Observed associations do not establish causation. "
    "Return an empty list if no supplied hypothesis is relevant to the topic."
)
TOPICS = (
    (r"\b(?:water|hydrat\w*|thirst\w*)\b", "Hydration patterns in the fictional demo"),
    (r"\b(?:screens?|screen time|phone use)\b", "Late screen use in the fictional demo"),
    (r"\b(?:coffee|caffeine)\b", "Caffeine and sleep in the fictional demo"),
    (r"\b(?:headaches?|migraines?)\b", "Headache patterns in the fictional demo"),
    (r"\b(?:sleep\w*|bedtime|rest)\b", "Sleep patterns in the fictional demo"),
)


class GeminiUnavailable(RuntimeError):
    """A sanitized failure that can be rendered without exposing provider details."""


class Selection(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    ranks: list[int] = Field(max_length=3)


def demo_topic(question: str) -> tuple[str, str]:
    text = normalized(question).casefold()
    branch_id = "br_0" if re.search(r"\b(?:coffee|caffeine)\b", text) and "headache" not in text else "br_1"
    for pattern, topic in TOPICS:
        if re.search(pattern, text):
            return topic, branch_id
    return "Overview of the selected fictional investigation", branch_id


def select_ranks(topic: str, hypotheses: list[dict]) -> tuple[list[int], str]:
    api_key = os.environ.get("GEMINI_API_KEY", "").strip()
    if not api_key:
        raise GeminiUnavailable("Set GEMINI_API_KEY for the Gemini demo.")
    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM}]},
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
            "responseJsonSchema": Selection.model_json_schema(),
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
        selection = Selection.model_validate_json(output)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 429:
            raise GeminiUnavailable("Gemini quota is exhausted. Try again later.") from None
        if exc.response.status_code in (400, 401, 403):
            raise GeminiUnavailable("Check the Gemini API key and project access.") from None
        raise GeminiUnavailable("Gemini is temporarily unavailable.") from None
    except (httpx.RequestError, ValueError, KeyError, IndexError, TypeError):
        raise GeminiUnavailable("Gemini returned no usable demo answer.") from None
    return selection.ranks, audit
