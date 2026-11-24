"""Generate the 90-day demo dataset (one person, 25 Aug - 22 Nov 2026, seed 42) into SQLite.

The story the data tells (CONTEXT.md):
- Sleep is normal (about 7 h 07 m) until 3 Nov, then drops about 47 min, while late screen
  time rises and lights-out moves past midnight.
- 4 of the 5 headache days between 3 and 12 Nov came after nights under 6 hours. Water is
  low on some days: a weaker second explanation. One headache came after a good night:
  a counterexample.
- An October investigation is already concluded: "Caffeine after 4 PM cuts my sleep by
  about 30 min" (Python works out the 30 from the data).
- A lights-out-by-11:30 experiment runs 13-22 Nov. The demo clock starts on 20 Nov (day 8);
  advancing it to 22 Nov finishes the experiment, Python scores it, and the lesson merges
  onto the trunk.

Only change detection decides where the change event is, and only Python computes the
confidences, outcomes and the numbers in each lesson.

Run:  python -m backend.data.generate_demo  [path/to/roottrace.db]
"""

import hashlib
import sqlite3
import sys
from datetime import date

import numpy as np

from backend.analysis.change_detection import refresh_change_events
from backend.analysis.experiments import lock_experiment
from backend.analysis.series import days, iso
from backend.analysis.state import refresh_state
from backend.data.db import connect, dumps, init_schema
from backend.data.metrics import METRICS

SEED = 42
DEMO_START = date(2026, 8, 25)
DEMO_END = date(2026, 11, 22)
CLOCK_START = date(2026, 11, 20)
IMPORTED_AT = "2026-11-20T10:00:00+05:30"

BASE_SLEEP = 427          # about 7 h 07 m
CAFFEINE_COST = 29        # minutes of sleep lost after caffeine past 4 PM
WAKE = 19 * 60            # 07:00 as minutes after noon

# date: (sleep_min, water_ml, headache, late screen minutes the evening before)
NOVEMBER = {
    "2026-11-03": (352, 1950, 1, 82),
    "2026-11-04": (345, 850, 1, 91),
    "2026-11-05": (404, 2050, 0, 77),
    "2026-11-06": (399, 900, 0, 85),   # low water, no headache
    "2026-11-07": (355, 1900, 1, 88),
    "2026-11-08": (358, 2000, 0, 79),  # short night, no headache
    "2026-11-09": (445, 780, 1, 74),   # headache after a good night: the counterexample
    "2026-11-10": (403, 2100, 0, 32),
    "2026-11-11": (349, 920, 1, 90),
    "2026-11-12": (403, 1980, 0, 81),
}
# Lights-out experiment nights: (sleep_min, kept lights-out by 11:30?)
EXPERIMENT_NIGHTS = {
    "2026-11-13": (447, True),
    "2026-11-14": (452, True),
    "2026-11-15": (371, False),
    "2026-11-16": (444, True),
    "2026-11-17": (449, True),
    "2026-11-18": (456, True),
    "2026-11-19": (441, True),
    "2026-11-20": (448, True),
    "2026-11-21": (368, False),
    "2026-11-22": (451, True),
}
EARLY_HEADACHES = {"2026-09-03", "2026-09-19", "2026-10-02"}
CAFFEINE_SLIP = "2026-10-15"


def hhmm(minutes_after_midnight: float, seconds: int = 0) -> str:
    total = int(round(minutes_after_midnight)) % (24 * 60)
    return f"{total // 60:02d}:{total % 60:02d}:{seconds:02d}"


class Writer:
    def __init__(self, conn: sqlite3.Connection, rng: np.random.Generator):
        self.conn = conn
        self.rng = rng
        self.counters = {k: 0 for k in METRICS}

    def add(self, metric: str, day: date, value: float, time: str, quality: tuple = (0.72, 0.95)) -> str:
        m = METRICS[metric]
        self.counters[metric] += 1
        obs_id = f"{m.prefix}_{self.counters[metric]:04d}"
        recorded_at = f"{iso(day)}T{time}+05:30"
        raw_value = str(int(value)) if float(value).is_integer() else str(value)
        src_id = hashlib.sha256(f"{m.source_id}|{recorded_at}|{m.raw_type}|{raw_value}".encode()).hexdigest()
        self.conn.execute(
            "INSERT INTO source_records (id, source_id, source_file, device, raw_type, raw_value, raw_unit,"
            " recorded_at, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (src_id, m.source_id, m.source_file, m.device, m.raw_type, raw_value, m.unit, recorded_at, IMPORTED_AT),
        )
        self.conn.execute(
            "INSERT INTO observations (id, source_record_id, metric, value, unit, date, time, device, source_id,"
            " source_file, data_quality, normalization) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (obs_id, src_id, metric, float(value), m.unit, iso(day), time, m.device, m.source_id, m.source_file,
             round(float(self.rng.uniform(*quality)), 2), m.normalization),
        )
        return obs_id


def generate_observations(conn: sqlite3.Connection, seed: int = SEED) -> None:
    rng = np.random.default_rng(seed)
    w = Writer(conn, rng)
    caffeine_prev = False
    day = DEMO_START
    while day <= DEMO_END:
        key = iso(day)
        # Caffeine after 4 PM today (affects tonight, recorded as tomorrow's sleep).
        if day < date(2026, 10, 7):
            caffeine = bool(rng.random() < 0.35)
        else:
            caffeine = key == CAFFEINE_SLIP

        if key in NOVEMBER:
            sleep, water, headache, _ = NOVEMBER[key]
        elif key in EXPERIMENT_NIGHTS:
            sleep, water, headache = EXPERIMENT_NIGHTS[key][0], None, 0
        else:
            sleep = BASE_SLEEP + rng.normal(0, 12) - (CAFFEINE_COST + rng.normal(0, 5) if caffeine_prev else 0)
            water, headache = None, int(key in EARLY_HEADACHES)
        sleep = int(round(sleep))
        if water is None:
            water = int(max(1100, round(1950 + rng.normal(0, 220), -1)))

        latency = 15 + rng.normal(0, 4)
        lights_out = WAKE + rng.normal(0, 8) - sleep - latency
        if key in EXPERIMENT_NIGHTS:
            kept = EXPERIMENT_NIGHTS[key][1]
            lights_out = min(lights_out, 685) if kept else max(lights_out, 730)
        lights_out = int(round(lights_out))
        wake = lights_out + latency + sleep

        # Late screen time this evening (it shows up before tomorrow's outcome).
        tomorrow = iso(day + days(1))
        if tomorrow in NOVEMBER:
            screen = NOVEMBER[tomorrow][3]
        elif tomorrow in EXPERIMENT_NIGHTS:
            screen = 15 + rng.normal(0, 5) if EXPERIMENT_NIGHTS[tomorrow][1] else 82
        elif day >= date(2026, 11, 22):
            screen = 15 + rng.normal(0, 5)
        else:
            screen = 22 + rng.normal(0, 8)
        screen = int(max(0, round(screen)))

        after_change = day >= date(2026, 11, 3)
        steps = int(max(1500, round((6300 if after_change else 7600) + rng.normal(0, 1200 if after_change else 1400), -1)))
        mood = 2 if headache else int(np.clip(round((3.5 if after_change else 4) + rng.normal(0, 0.6)), 1, 5))

        w.add("sleep_min", day, sleep, hhmm(12 * 60 + wake, int(rng.integers(0, 60))))
        w.add("lights_out", day, lights_out, hhmm(12 * 60 + lights_out))
        w.add("steps", day, steps, "23:59:00", (0.9, 0.98))
        w.add("water_ml", day, water, hhmm(21 * 60 + rng.integers(0, 50)), (0.7, 0.9))
        w.add("headache", day, headache, "15:20:00" if headache else "21:30:00", (0.8, 0.9))
        w.add("screen_late_min", day, screen, "23:59:00", (0.85, 0.95))
        w.add("caffeine_pm", day, int(caffeine), "16:30:00" if caffeine else "21:30:00", (0.7, 0.9))
        w.add("mood", day, mood, "21:35:00", (0.7, 0.9))

        caffeine_prev = caffeine
        day += days(1)


def add_branch(conn, branch: dict, hypotheses: list[dict], experiment: dict) -> None:
    conn.execute(
        "INSERT INTO branches (id, title, status, start_date, end_date, lane, change_event_id, outcome_metric,"
        " outcome_op, outcome_threshold, outcome_text, control_text)"
        " VALUES (:id, :title, 'open', :start_date, NULL, :lane, :change_event_id, :outcome_metric, :outcome_op,"
        " :outcome_threshold, :outcome_text, :control_text)",
        branch,
    )
    for h in hypotheses:
        conn.execute(
            "INSERT INTO hypotheses (id, branch_id, label, metric, op, threshold, lag_days, exposure_text,"
            " claim_template, control_template, test, test_days) VALUES (:id, :branch_id, :label, :metric, :op,"
            " :threshold, :lag_days, :exposure_text, :claim_template, :control_template, :test, :test_days)",
            {"branch_id": branch["id"], **h},
        )
    conn.execute(
        "INSERT INTO experiments (id, branch_id, hypothesis_id, description, start_date, duration_days,"
        " success_criterion, criterion, adherence_rule, status, knowledge_template)"
        " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?)",
        (experiment["id"], branch["id"], experiment["hypothesis_id"], experiment["description"],
         experiment["start_date"], experiment["duration_days"], experiment["success_criterion"],
         dumps(experiment["criterion"]), dumps(experiment["adherence_rule"]), dumps(experiment["knowledge_template"])),
    )


def add_caffeine_branch(conn) -> None:
    add_branch(
        conn,
        {
            "id": "br_0", "title": "Does caffeine after 4 PM cut my sleep?", "start_date": "2026-10-01", "lane": 2,
            "change_event_id": None, "outcome_metric": "sleep_min", "outcome_op": "<", "outcome_threshold": 410,
            "outcome_text": "short nights (under 6h 50m)", "control_text": "other nights",
        },
        [
            {
                "id": "hy_01", "label": "Late caffeine", "metric": "caffeine_pm", "op": "==", "threshold": 1,
                "lag_days": 1, "exposure_text": "caffeine after 4 PM",
                "claim_template": "{k} of {n} short nights came after caffeine past 4 PM",
                "control_template": "{j} of {m} other nights also came after caffeine past 4 PM",
                "test": "No caffeine after 4 PM for 14 days", "test_days": 14,
            },
            {
                "id": "hy_02", "label": "Late screen time", "metric": "screen_late_min", "op": ">", "threshold": 45,
                "lag_days": 1, "exposure_text": "over 45 min of screen after 10 PM",
                "claim_template": "{k} of {n} short nights came after over 45 min of screen after 10 PM",
                "control_template": "{j} of {m} other nights also came after over 45 min of screen after 10 PM",
                "test": "No screens after 10 PM for 10 days", "test_days": 10,
            },
            {
                "id": "hy_03", "label": "Low daytime activity", "metric": "steps", "op": "<", "threshold": 6000,
                "lag_days": 1, "exposure_text": "a day under 6,000 steps",
                "claim_template": "{k} of {n} short nights came after a day under 6,000 steps",
                "control_template": "{j} of {m} other nights also came after a day under 6,000 steps",
                "test": "Walk 8,000 steps a day for 10 days", "test_days": 10,
            },
        ],
        {
            "id": "exp_0", "hypothesis_id": "hy_01", "description": "No caffeine after 4 PM every day",
            "start_date": "2026-10-08", "duration_days": 14,
            "success_criterion": "Average sleep must exceed 7 hours over the 14 nights",
            "criterion": {"kind": "mean_above", "metric": "sleep_min", "threshold": 420},
            "adherence_rule": {"metric": "caffeine_pm", "op": "==", "threshold": 0},
            "knowledge_template": {
                "supported": "Caffeine after 4 PM cuts my sleep by about {effect_round5} min",
                "not_supported": "Stopping caffeine after 4 PM did not lift my average sleep above 7 hours "
                "(it was {mean_during_fmt})",
            },
        },
    )


def add_headache_branch(conn, change_event: dict) -> None:
    add_branch(
        conn,
        {
            "id": "br_1", "title": "Why do I keep getting headaches?", "start_date": iso(change_event["detected_on"]),
            "lane": 1, "change_event_id": change_event["id"], "outcome_metric": "headache", "outcome_op": "==",
            "outcome_threshold": 1, "outcome_text": "headache days", "control_text": "headache-free days",
        },
        [
            {
                "id": "hy_11", "label": "Short sleep", "metric": "sleep_min", "op": "<", "threshold": 360,
                "lag_days": 0, "exposure_text": "a night under 6 hours",
                "claim_template": "{k} of {n} headache days followed nights under 6 hours",
                "control_template": "{j} of {m} headache-free days also followed nights under 6 hours",
                "test": "Lights out by 11:30 PM for 10 days", "test_days": 10,
            },
            {
                "id": "hy_12", "label": "Low water intake", "metric": "water_ml", "op": "<", "threshold": 1000,
                "lag_days": 0, "exposure_text": "water below 1 L",
                "claim_template": "{k} of {n} headache days had water below 1 L",
                "control_template": "{j} of {m} headache-free days also had water below 1 L",
                "test": "Drink 2 litres every day for 10 days", "test_days": 10,
            },
            {
                "id": "hy_13", "label": "Screen light before bed", "metric": "screen_late_min", "op": ">",
                "threshold": 60, "lag_days": 1, "exposure_text": "over 1 hour of screen after 10 PM",
                "claim_template": "{k} of {n} headache days followed over 1 hour of screen after 10 PM",
                "control_template": "{j} of {m} headache-free days also followed over 1 hour of screen after 10 PM",
                "test": "No screens after 10 PM for 7 days", "test_days": 7,
            },
        ],
        {
            "id": "exp_1", "hypothesis_id": "hy_11", "description": "Lights out by 11:30 PM every night",
            "start_date": "2026-11-13", "duration_days": 10,
            "success_criterion": "Sleep must exceed 7 hours on at least 7 of 10 nights",
            "criterion": {"kind": "count_days", "metric": "sleep_min", "op": ">", "threshold": 420, "min_days": 7},
            "adherence_rule": {"metric": "lights_out", "op": "<=", "threshold": 690},
            "knowledge_template": {
                "supported": "Lights out by 11:30 PM kept my sleep over 7 hours on {days_meeting} of {n_days} "
                "nights, and headache days fell from {bad_before} to {bad_during}",
                "not_supported": "Lights out by 11:30 PM did not keep my sleep over 7 hours "
                "({days_meeting} of {n_days} nights)",
            },
        },
    )


def build(conn: sqlite3.Connection, seed: int = SEED) -> None:
    """Create the schema and fill it with the demo story, as of CLOCK_START."""
    init_schema(conn)
    generate_observations(conn, seed)

    # October: the caffeine question, its locked experiment, and the lesson Python draws from it.
    add_caffeine_branch(conn)
    lock_experiment(conn, "exp_0", date(2026, 10, 7), locked_at="2026-10-07T15:30:00Z")
    refresh_state(conn, date(2026, 10, 22))

    # November: change detection finds the sleep drop; the user opens a branch from it.
    events = refresh_change_events(conn, CLOCK_START)
    sleep_events = [e for e in events if e["metric"] == "sleep_min" and e["delta"] < 0]
    if not sleep_events:
        raise RuntimeError("demo data no longer produces the November sleep drop")
    add_headache_branch(conn, sleep_events[0])
    lock_experiment(conn, "exp_1", date(2026, 11, 12), locked_at="2026-11-12T15:30:00Z")
    refresh_state(conn, CLOCK_START)


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "backend/data/roottrace.db"
    from pathlib import Path

    Path(target).unlink(missing_ok=True)
    c = connect(target)
    build(c)
    c.commit()
    n = c.execute("SELECT COUNT(*) FROM observations").fetchone()[0]
    print(f"Wrote {n} observations to {target}")
