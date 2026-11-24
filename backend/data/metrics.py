"""What each metric is, where it comes from, and how to show it to a person."""

from dataclasses import dataclass
from typing import Callable


def hours_minutes(minutes: float) -> str:
    h, m = divmod(int(round(minutes)), 60)
    return f"{h}h {m}m"


def hours_minutes_long(minutes: float) -> str:
    h, m = divmod(int(round(minutes)), 60)
    return f"{h} hours {m} minutes"


def clock_after_noon(minutes_after_noon: float) -> str:
    """Lights-out is stored as minutes after 12:00 noon, so 690 = 11:30 PM and 750 = 12:30 AM."""
    total = (12 * 60 + int(round(minutes_after_noon))) % (24 * 60)
    h, m = divmod(total, 60)
    suffix = "AM" if h < 12 else "PM"
    return f"{(h % 12) or 12}:{m:02d} {suffix}"


@dataclass(frozen=True)
class Metric:
    key: str
    prefix: str
    title: str
    unit: str
    device: str
    source_id: str
    source_file: str
    raw_type: str
    normalization: str
    binary: bool
    display: Callable[[float], str]   # record modal: "5 hours 15 minutes"
    label: Callable[[float], str]     # evidence row: "5h 15m sleep"


METRICS: dict[str, Metric] = {
    m.key: m
    for m in [
        Metric(
            "sleep_min", "sl", "Sleep", "minutes", "iPhone 15 Pro", "src_a1", "apple_health_export.xml",
            "HKCategoryTypeIdentifierSleepAnalysis", "HKCategoryValueSleepAnalysisAsleep -> minutes", False,
            hours_minutes_long, lambda v: f"{hours_minutes(v)} sleep",
        ),
        Metric(
            "steps", "st", "Steps", "steps", "iPhone 15 Pro", "src_a1", "apple_health_export.xml",
            "HKQuantityTypeIdentifierStepCount", "HKQuantityTypeIdentifierStepCount -> daily sum", False,
            lambda v: f"{int(v):,} steps", lambda v: f"{int(v):,} steps",
        ),
        Metric(
            "water_ml", "wt", "Water", "ml", "Manual entry", "src_c3", "manual_checkins.sqlite",
            "hydration_log", "hydration_log_ml -> canonical ml", False,
            lambda v: f"{int(v):,} ml water", lambda v: f"{int(v):,} ml water",
        ),
        Metric(
            "headache", "hd", "Headache", "event", "Manual entry", "src_b2", "manual_checkins.sqlite",
            "symptom_checkin", "symptom_checkin -> binary_flag", True,
            lambda v: "Headache reported" if v else "No headache",
            lambda v: "Headache reported" if v else "No headache",
        ),
        Metric(
            "screen_late_min", "sc", "Late screen time", "minutes", "iPhone 15 Pro", "src_d4", "screen_time_export.csv",
            "screen_time_after_22", "Screen Time after 22:00 -> minutes", False,
            lambda v: f"{int(v)} minutes of screen after 10 PM", lambda v: f"{int(v)} min screen after 10 PM",
        ),
        Metric(
            "caffeine_pm", "cf", "Caffeine after 4 PM", "flag", "Manual entry", "src_c3", "manual_checkins.sqlite",
            "caffeine_log", "caffeine_log after 16:00 -> binary_flag", True,
            lambda v: "Caffeine after 4 PM" if v else "No caffeine after 4 PM",
            lambda v: "Caffeine after 4 PM" if v else "No caffeine after 4 PM",
        ),
        Metric(
            "lights_out", "lo", "Lights out", "minutes after 12:00", "iPhone 15 Pro", "src_a1", "apple_health_export.xml",
            "HKCategoryValueSleepAnalysisInBed", "InBed start -> minutes after 12:00", False,
            lambda v: f"Lights out at {clock_after_noon(v)}", lambda v: f"Lights out {clock_after_noon(v)}",
        ),
        Metric(
            "mood", "md", "Mood", "score 1-5", "Manual entry", "src_c3", "manual_checkins.sqlite",
            "mood_checkin", "mood_checkin -> 1..5", False,
            lambda v: f"Mood {int(v)} of 5", lambda v: f"Mood {int(v)}/5",
        ),
    ]
}

# Metrics drawn on the homepage trunk. Change events for other metrics stay in the
# database (the AI tools and branch claims use them) but are not drawn on the trunk.
TRUNK_METRICS = ("sleep_min", "steps", "water_ml")
DETECT_METRICS = ("sleep_min", "steps", "water_ml", "screen_late_min")


def num(value: float) -> int | float:
    """Return whole numbers as int so JSON matches the contract (315, not 315.0)."""
    return int(value) if float(value).is_integer() else float(value)


def change_label(metric: str, delta: float) -> str:
    m = METRICS[metric]
    direction = "down" if delta < 0 else "up"
    size = abs(int(round(delta)))
    unit = {"minutes": "min", "ml": "ml", "steps": "steps"}.get(m.unit, m.unit)
    return f"{m.title} {direction} {size:,} {unit}"
