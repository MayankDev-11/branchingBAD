"""Local question matching and permitted evidence for workspace investigations."""

import re
from dataclasses import dataclass

from backend.privacy.questions import normalized


@dataclass(frozen=True)
class Topic:
    label: str
    pattern: str
    factors: tuple[str, ...]
    observation: str


URINARY = "urinary_symptoms"
URINARY_LABEL = "Urination isn’t tracked"
URINARY_GUIDANCE = (
    "RootTrace tracks fluid intake. It has no urine or bladder readings to explain this symptom. "
    "Contact a healthcare professional about difficulty urinating.\n\n"
    "If you cannot pass urine at all or have severe lower abdominal pain, seek emergency care now."
)

TOPICS = {
    URINARY: Topic("Urinary symptoms",
                   r"\b(?:pee(?:ing)?|piss(?:ing)?|urin\w*|bladder|weak stream|waterworks)\b", (), ""),
    "headache": Topic("Headaches", r"\b(?:headaches?|migraines?|head pain|head hurts|pounding head)\b",
                      ("sleep_min", "water_ml", "screen_late_min"), "whether you had a headache"),
    "afternoon_energy": Topic(
        "Energy", r"\b(?:energy(?! drinks?\b)|tired\w*|fatigu\w*|drows\w*|sleepy|sluggish\w*|groggy|"
        r"worn out|wiped out|(?:post[- ]lunch|afternoon) (?:slump|dip)|"
        r"crash(?:es|ing|ed)? (?:after lunch|in the afternoon|at \d{1,2}(?::\d{2})?\s*pm))\b",
        ("sleep_min", "water_ml", "steps"), "your energy at a consistent time each day"),
    "mood": Topic("Mood", r"\b(?:moods?|irritab\w*|grumpy|low spirits|feeling down|stressed|stress)\b",
                  ("sleep_min", "steps", "screen_late_min"), "your mood rating"),
    "sleep_min": Topic(
        "Sleep", r"\b(?:sleep\w*|slept|insomnia|wake|woke|waking|restless nights?|rested)\b",
        ("caffeine_pm", "screen_late_min", "steps"), "how long you slept"),
    "lights_out": Topic("Bedtime", r"\b(?:bedtime|lights out|(?:go|going|went) to bed|in bed late)\b",
                        ("screen_late_min", "caffeine_pm", "steps"), "when you went to bed"),
    "steps": Topic("Activity", r"\b(?:steps?|walk\w*|activ\w*|sedentary|exercise|workout\w*)\b",
                   ("sleep_min", "mood", "water_ml"), "your daily step count"),
    "water_ml": Topic("Water intake", r"\b(?:water|hydrat\w*|dehydrat\w*|thirst\w*|fluids?)\b",
                      ("steps", "sleep_min", "caffeine_pm"), "how much water you drank"),
    "screen_late_min": Topic("Late screen use",
                             r"\b(?:screens?|screentime|scroll\w*|phone use|on my phone|using my phone)\b",
                             ("caffeine_pm", "lights_out", "steps"), "your time on screens after 10 PM"),
    "caffeine_pm": Topic("Late caffeine", r"\b(?:caffeine|coffee|espresso|energy drinks?)\b",
                        ("sleep_min", "steps", "mood"), "whether you had caffeine after 4 PM"),
}

DEMO_OUTCOMES = {"headache": "br_1", "sleep_min": "br_0"}
_TRACKED_FACTORS = frozenset(TOPICS) - {URINARY, "afternoon_energy"}
_CAUSE_THEN_OUTCOME = re.compile(
    r"\b(?:affect\w*|influenc\w*|impact\w*|caus\w*|lead(?:s|ing)? to|trigger\w*|"
    r"have to do with|linked to|preced\w*|shorten\w*|worsen\w*|improv\w*|make(?:s)? me)\b"
)
_OUTCOME_THEN_CAUSE = re.compile(r"\b(?:after|because of|from|due to|on days (?:i|when))\b")


def _matches(text: str) -> list[str]:
    matches = [(match.start(), key) for key, topic in TOPICS.items()
               if (match := re.search(topic.pattern, text))]
    return [key for _, key in sorted(matches, key=lambda item: item[0])]


def question_outcome(question: str, chosen: str = "auto") -> str:
    text = normalized(question).casefold()
    matches = _matches(text)
    if URINARY in matches:
        return URINARY
    if chosen != "auto":
        return chosen
    if match := _CAUSE_THEN_OUTCOME.search(text):
        outcomes = _matches(text[match.end():])
        if outcomes and _matches(text[:match.start()]):
            return outcomes[0]
    if match := _OUTCOME_THEN_CAUSE.search(text):
        outcomes = _matches(text[:match.start()])
        if outcomes:
            return outcomes[0]
    return matches[0] if matches else "untracked"


def suggested_factors(question: str, outcome: str) -> list[str]:
    topic = TOPICS.get(outcome)
    if not topic or not topic.factors:
        return []
    named = [key for key in _matches(normalized(question).casefold())
             if key in _TRACKED_FACTORS and key != outcome]
    return list(dict.fromkeys([*named, *topic.factors]))[:3]


def prospective_test(outcome: str, factor: str) -> str:
    topic = TOPICS[outcome]
    setup = f"Log {topic.observation}."
    if outcome == "afternoon_energy":
        setup = (
            "Afternoon energy is missing from the demo. Log lunch time and a same-day afternoon energy rating."
        )
    return (
        f"{setup} Compare similar days with different readings for {factor}.\n"
        "Would support the idea: the outcome differs consistently with this factor.\n"
        "Would weaken it: the outcome is similar across days.\n"
        "Inconclusive: there are too few comparable days."
    )
