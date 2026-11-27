"""Local question matching and permitted evidence for workspace investigations."""

import re
from dataclasses import dataclass

from backend.data.metrics import METRICS
from backend.privacy.questions import normalized


@dataclass(frozen=True)
class Topic:
    label: str
    pattern: str
    factors: tuple[str, ...]
    observation: str


@dataclass(frozen=True)
class CheckIn:
    outcome: str
    factor: str
    low: bool = True


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
        r"worn out|wiped out|exhaust\w*|(?:post[- ]lunch|afternoon) (?:slump|dip)|"
        r"crash(?:es|ing|ed)? (?:after lunch|in the afternoon|at \d{1,2}(?::\d{2})?\s*pm))\b",
        ("sleep_min", "water_ml", "steps"), "your energy at a consistent time each day"),
    "focus": Topic("Focus", r"\b(?:brain fog|(?:lose|lost|poor|trouble) focus|focus|concentrat\w*|distract\w*)\b",
                   ("sleep_min", "steps", "screen_late_min"), "how hard it was to focus at a consistent time"),
    "stress": Topic("Stress", r"\b(?:stressed|stress|tense|overwhelm\w*)\b",
                    ("sleep_min", "steps", "mood"), "your perceived stress at a consistent time"),
    "sleep_quality": Topic(
        "Sleep quality", r"\b(?:sleep quality|(?:keep |repeatedly )?(?:wake|waking|woke) up (?:at night|during the night)|"
        r"restless (?:sleep|nights?)|broken sleep|nonrestorative sleep)\b",
        ("screen_late_min", "caffeine_pm", "lights_out"), "how rested you felt after waking"),
    "digestion": Topic(
        "Digestive discomfort",
        r"\b(?:stomach\s*aches?|stomach (?:pain|discomfort)|upset stomach|bloat\w*|indigestion|nause\w*|"
        r"heartburn|constipat\w*|digestive discomfort)\b",
        ("water_ml", "steps"), "whether digestive discomfort occurred and when relative to meals"),
    "recovery": Topic(
        "Exercise recovery", r"\b(?:muscle soreness|sore muscles|post[- ]workout soreness|exercise recovery|"
        r"recover\w* (?:after|from) (?:a )?(?:workouts?|exercise|training))\b",
        ("steps", "sleep_min", "water_ml"), "next-day soreness and the preceding activity"),
    "mood": Topic("Mood", r"\b(?:moods?|irritab\w*|grumpy|low spirits|feeling down)\b",
                  ("sleep_min", "steps", "screen_late_min"), "your mood rating"),
    "sleep_min": Topic(
        "Sleep", r"\b(?:sleep\w*|slept|insomnia|wake|woke|waking|restless nights?|rested|"
        r"(?:can't|cannot|can't seem to|trouble) fall(?:ing)? asleep)\b",
        ("caffeine_pm", "screen_late_min", "steps"), "how long you slept"),
    "lights_out": Topic("Bedtime", r"\b(?:bedtime|lights out|(?:go|going|went) to bed|in bed late)\b",
                        ("screen_late_min", "caffeine_pm", "steps"), "when you went to bed"),
    "steps": Topic("Activity", r"\b(?:steps?|walk\w*|jogg\w*|running|activity|active|sedentary|exercise|workout\w*)\b",
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
_TRACKED_FACTORS = frozenset(METRICS)
CHECK_INS = {
    "headache": CheckIn("Did you have a headache?", "Did you have a headache?", low=False),
    "sleep_min": CheckIn("Did you sleep less than usual?", "Was the previous night's sleep shorter than usual?"),
    "afternoon_energy": CheckIn("Was your afternoon energy lower than usual?", ""),
    "focus": CheckIn("Was focusing harder than usual at your usual check-in time?", ""),
    "stress": CheckIn("Did you feel more stressed than usual at your usual check-in time?", ""),
    "sleep_quality": CheckIn("Did you feel less rested than usual after waking?", ""),
    "digestion": CheckIn("Did you notice digestive discomfort today?", ""),
    "recovery": CheckIn("Were you sorer than usual the day after activity?", ""),
    "mood": CheckIn("Was your mood rating lower than usual?", "Was your mood rating lower than usual?"),
    "lights_out": CheckIn("Did you go to bed later than usual?", "Did you go to bed later than usual?", low=False),
    "steps": CheckIn("Did you record fewer steps than usual?", "Did you record fewer steps than usual?"),
    "water_ml": CheckIn("Did you record less water than usual?", "Did you record less water than usual?"),
    "screen_late_min": CheckIn("Did you spend longer than usual on screens after 10 PM?",
                               "Did you spend longer than usual on screens after 10 PM?", low=False),
    "caffeine_pm": CheckIn("Did you have caffeine after 4 PM?", "Did you have caffeine after 4 PM?", low=False),
}
_OFF_TOPIC = re.compile(
    r"\b(?:javascript|typescript|source code|code snippet|programming|stack trace|api response|"
    r"my app (?:crash\w*|hang\w*)|sleep (?:function|command|mode)|"
    r"(?:write|build) (?:me )?(?:a |an )?(?:poem|essay|website|game|script)|"
    r"(?:buy|sell|trade) (?:stocks?|crypto|bitcoin)|weather forecast)\b"
)
_MEDICAL_REQUEST = re.compile(
    r"\b(?:what (?:medication|medicine|drugs?|dose)|prescribe|which (?:medication|medicine|drug)|"
    r"what should i take for|diagnose me|can you diagnose|do i have (?:a disease|diabetes))\b"
)
_CAUSE_THEN_OUTCOME = re.compile(
    r"\b(?:affect\w*|influenc\w*|impact\w*|caus\w*|lead(?:s|ing)? to|trigger\w*|"
    r"have to do with|linked to|preced\w*|shorten\w*|worsen\w*|improv\w*|reduce\w*|disrupt\w*|"
    r"cut(?:s|ting)?(?: down on)?|make(?:s)? me)\b"
)
_OUTCOME_THEN_CAUSE = re.compile(r"\b(?:after|because of|from|due to|on days (?:i|when))\b")


def _matches(text: str) -> list[str]:
    matches = [(match.start(), key) for key, topic in TOPICS.items()
               if (match := re.search(topic.pattern, text))]
    # Specific outcomes are listed before broad metrics in the catalog.
    distinct = {start: key for start, key in reversed(matches)}
    return [key for _, key in sorted(distinct.items())]


def off_topic_question(question: str) -> bool:
    return bool(_OFF_TOPIC.search(normalized(question).casefold()))


def medical_request(question: str) -> bool:
    return bool(_MEDICAL_REQUEST.search(normalized(question).casefold()))


def around_lunch(question: str) -> bool:
    return bool(re.search(r"\blunch\w*\b", normalized(question), re.IGNORECASE))


def question_outcome(question: str, chosen: str = "auto") -> str:
    text = normalized(question).casefold()
    if _OFF_TOPIC.search(text) or _MEDICAL_REQUEST.search(text):
        return "untracked"
    matches = _matches(text)
    if URINARY in matches:
        return URINARY
    if chosen != "auto":
        return chosen
    for match in _CAUSE_THEN_OUTCOME.finditer(text):
        outcomes = _matches(text[match.end():])
        if outcomes and _matches(text[:match.start()]):
            return outcomes[0]
    if match := _OUTCOME_THEN_CAUSE.search(text):
        outcomes = _matches(text[:match.start()])
        if outcomes:
            return outcomes[0]
    return matches[0] if matches else "untracked"


def mentioned_metrics(text: str) -> list[str]:
    return [key for key in _matches(normalized(text).casefold()) if key in _TRACKED_FACTORS]


def suggested_factors(question: str, outcome: str) -> list[str]:
    topic = TOPICS.get(outcome)
    if not topic or not topic.factors:
        return []
    named = [key for key in mentioned_metrics(question) if key != outcome]
    return list(dict.fromkeys([*named, *topic.factors]))[:3]


def prospective_test(
    outcome: str, factor_question: str, *, review_logs: bool = False, lunch_context: bool = False,
) -> str:
    topic = TOPICS[outcome]
    setup = f"Log {topic.observation}."
    if outcome == "afternoon_energy" and lunch_context:
        setup = (
            "Afternoon energy is missing from the demo. Log lunch time and a same-day afternoon energy rating."
        )
    elif outcome not in METRICS:
        setup = f"The demo has no {topic.label.lower()} readings. {setup}"
    elif review_logs:
        setup = f"Review the cited days. {setup}"
    return (f"{setup} Keep your routines as usual. For each daily check-in, answer: {factor_question}\n"
            "Would support the idea: the outcome is more frequent on factor days.\n"
            "Would weaken it: the outcome is less frequent on factor days.\n"
            "Inconclusive: similar rates or too few days in either group.")
