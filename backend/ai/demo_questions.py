"""Interpret common demo questions locally. The cloud only receives fixed topics."""

import re
from dataclasses import dataclass
from datetime import date
from typing import Literal

from backend.privacy.questions import normalized

METRICS = (
    ("water_ml", r"\b(?:water|hydrat\w*|thirst\w*)\b", "Hydration"),
    ("screen_late_min", r"\b(?:screens?|screen time|phone use)\b", "Late screen use"),
    ("caffeine_pm", r"\b(?:coffee|caffeine)\b", "Late caffeine"),
    ("steps", r"\b(?:steps?|walk\w*|activity)\b", "Activity"),
    ("sleep_min", r"\b(?:sleep\w*|slept|bedtime|rest)\b", "Sleep"),
    ("headache", r"\b(?:headaches?|migraines?)\b", "Headache"),
)
READING = re.compile(
    r"\b(?:how (?:much|many|long|did i sleep|was my sleep)|average\w*|count|total|last night|yesterday|today)\b"
)
WINDOW = re.compile(r"\b(?:last|past) (\d+) (days?|weeks?)\b")
NEXT = re.compile(r"\b(?:next steps?|what (?:should|can|do) i do next|what now|what should i (?:try|test|track))\b")
OVERVIEW = re.compile(r"\b(?:summari[sz]e|overview|explain|review|findings?|evidence|patterns?)\b")
MEDICAL = re.compile(r"\b(?:diagnos\w*|dosage|dose|medicines?|medications?|pills?|ibuprofen|paracetamol)\b")
CHANGE = re.compile(r"\b(?:shift\w*|drop\w*|declin\w*|change\w*)\b")
MONTHS = ("jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec")
DEMO_DATE = re.compile(
    r"\b(?P<iso>\d{4}-\d{2}-\d{2})\b|"
    r"\b(?P<month>jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|"
    r"aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.? "
    r"(?P<day>\d{1,2})(?:st|nd|rd|th)?(?:,? (?P<year>\d{4}))?\b"
)


@dataclass(frozen=True)
class DemoQuestion:
    kind: Literal["patterns", "reading", "change", "next"]
    branch_id: str
    topic: str = ""
    metric: str | None = None
    window: int = 7
    offset: int = 0
    total: bool = False
    on_date: date | None = None


def interpret_demo_question(question: str, branch_id: str | None, clock: date) -> DemoQuestion | None:
    text = normalized(question).casefold()
    if MEDICAL.search(text) or re.search(r"\bhow (?:much|many) should\b", text):
        return None

    matches = [(metric, label) for metric, pattern, label in METRICS if re.search(pattern, text)]
    metric, label = matches[0] if matches else (None, "")
    headache = any(item[0] == "headache" for item in matches)
    caffeine = any(item[0] == "caffeine_pm" for item in matches)
    if NEXT.search(text):
        return DemoQuestion("next", branch_id or ("br_0" if caffeine and not headache else "br_1"))

    on_date = None
    if match := DEMO_DATE.search(text):
        try:
            on_date = date.fromisoformat(match["iso"]) if match["iso"] else date(
                int(match["year"] or clock.year), MONTHS.index(match["month"][:3]) + 1, int(match["day"]),
            )
        except ValueError:
            return None
        if on_date > clock:
            return None
    if metric == "sleep_min" and not headache and CHANGE.search(text):
        return DemoQuestion("change", "br_1", metric=metric, on_date=on_date)

    window = WINDOW.search(text)
    if metric and (on_date or READING.search(text) or window or re.search(r"\b(?:last|past) (?:week|month)\b", text)):
        if metric == "headache" and re.search(r"\b(?:how long|duration|lasted)\b", text):
            return None
        if re.search(r"\b(?:above|below|under|over|at least) \d", text):
            return None
        offset = int("yesterday" in text)
        duration = 1 if on_date or offset or "last night" in text or "today" in text else 7
        if window and not on_date:
            duration = int(window[1]) * (7 if window[2].startswith("week") else 1)
        elif re.search(r"\b(?:last|past) month\b", text):
            duration = 30
        if not 1 <= duration <= 90:
            return None
        return DemoQuestion("reading", branch_id or "br_1", metric=metric, window=duration,
                            offset=offset, total=bool(re.search(r"\btotal\b", text)), on_date=on_date)

    if not metric:
        if branch_id and OVERVIEW.search(text):
            return DemoQuestion("patterns", branch_id, "Overview of the selected fictional investigation")
        return None

    target = "br_0" if caffeine and not headache else "br_1"
    if metric == "headache":
        return DemoQuestion("patterns", "br_1", "Headache patterns in the fictional demo")
    if metric == "sleep_min" and not headache and re.search(r"\bwhy\b", text):
        return DemoQuestion("patterns", "br_0", "Possible factors associated with short sleep in the fictional demo")
    outcome = " and headaches" if headache else ""
    return DemoQuestion("patterns", target, f"{label}{outcome} in the fictional demo", metric)
