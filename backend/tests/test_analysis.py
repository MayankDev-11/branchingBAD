"""Change detection, baselines, the pattern finder and experiment evaluation."""

from datetime import date

import numpy as np
import pandas as pd
import pytest

from backend.analysis.baselines import get_baseline
from backend.analysis.change_detection import detect_changes
from backend.analysis.experiments import ExperimentError, evaluate, lock_experiment, progress
from backend.analysis.patterns import compare_periods, summarize_metric
from backend.analysis.state import branch_patterns, refresh_state
from backend.data import generate_demo
from backend.data.db import connect


def daily(values, start="2026-01-01"):
    return pd.Series(values, index=pd.date_range(start, periods=len(values), freq="D"), dtype=float)


# Change detection ------------------------------------------------------------------------

def test_detects_a_planted_drop_and_pins_its_start():
    rng = np.random.default_rng(0)
    values = list(430 + rng.normal(0, 10, 40)) + list(380 + rng.normal(0, 10, 15))
    series = daily(values)
    events = detect_changes(series)
    assert len(events) == 1
    ev = events[0]
    assert ev["date"] == pd.Timestamp("2026-02-10")  # day 41
    # delta = median of the first 10 new days minus the median of the 30 days before
    expected = series.iloc[40:50].median() - series.iloc[10:40].median()
    assert ev["delta"] == round(expected)
    assert ev["delta"] < -25


@pytest.mark.parametrize("seed", range(20))
def test_no_change_in_plain_noise(seed):
    rng = np.random.default_rng(seed)
    assert detect_changes(daily(430 + rng.normal(0, 12, 90))) == []


def test_one_odd_day_is_not_a_change():
    values = [430.0] * 30 + [300.0] + [430.0] * 20
    values = [v + (i % 3) for i, v in enumerate(values)]
    assert detect_changes(daily(values)) == []


def test_needs_seven_days_of_baseline():
    assert detect_changes(daily([430, 431, 300, 301, 302, 300, 299])) == []


def test_cooldown_and_new_normal_stop_repeat_alarms():
    rng = np.random.default_rng(2)
    values = list(430 + rng.normal(0, 8, 35)) + list(370 + rng.normal(0, 8, 40))
    assert len(detect_changes(daily(values))) == 1


def test_demo_finds_the_3_november_sleep_drop(demo_conn):
    rows = demo_conn.execute("SELECT * FROM change_events WHERE metric = 'sleep_min'").fetchall()
    assert len(rows) == 1
    assert rows[0]["date"] == "2026-11-03"
    assert rows[0]["delta"] == -47
    assert rows[0]["label"] == "Sleep down 47 min"


# Baselines -------------------------------------------------------------------------------

def test_baseline_is_the_30_days_before(demo_conn):
    b = get_baseline(demo_conn, "sleep_min", "2026-11-03")
    assert b["n"] == 30 and b["window_end"] == "2026-11-02"
    assert 415 <= b["median"] <= 435


def test_baseline_after_a_change_uses_the_new_normal(demo_conn):
    b = get_baseline(demo_conn, "sleep_min", "2026-11-13")
    assert b["window_start"] == "2026-11-03"
    assert b["median"] < 390


def test_no_baseline_under_seven_readings(demo_conn):
    assert get_baseline(demo_conn, "sleep_min", "2026-08-30") is None


def test_summaries_cite_their_records(demo_conn):
    s = summarize_metric(demo_conn, "sleep_min", "2026-11-03", "2026-11-12")
    assert s["count"] == 10 and len(s["record_ids"]) == 10
    c = compare_periods(demo_conn, "sleep_min", ("2026-10-04", "2026-11-02"), ("2026-11-03", "2026-11-12"))
    assert c["change_median"] < -40
    assert "warning" in summarize_metric(demo_conn, "sleep_min", "2026-11-03", "2026-11-05")


# Pattern finder (the demo story) ---------------------------------------------------------

def patterns(conn, branch_id):
    branch = conn.execute("SELECT * FROM branches WHERE id = ?", (branch_id,)).fetchone()
    return {p["label"]: p for p in branch_patterns(conn, branch, generate_demo.CLOCK_START)}


def test_four_of_five_headache_days_followed_short_nights(demo_conn):
    p = patterns(demo_conn, "br_1")
    sleep = p["Short sleep"]
    assert (sleep["k"], sleep["n"]) == (4, 5)
    assert sleep["claims"][0]["text"] == "4 of 5 headache days followed nights under 6 hours"
    assert len(sleep["counterexample_ids"]) == 1  # the headache after a good night
    assert sleep["rank"] == 1


def test_water_is_a_weaker_second_explanation(demo_conn):
    p = patterns(demo_conn, "br_1")
    assert p["Low water intake"]["rank"] == 2
    assert 0 < p["Low water intake"]["confidence"] < p["Short sleep"]["confidence"]


def test_confidence_is_computed_from_counts(demo_conn):
    for p in patterns(demo_conn, "br_1").values():
        assert p["confidence"] == max(0, round(100 * (p["k"] / p["n"] - p["j"] / p["m"])))


def test_caffeine_branch_finds_late_caffeine(demo_conn):
    p = patterns(demo_conn, "br_0")
    assert p["Late caffeine"]["rank"] == 1
    assert 25 <= p["Late caffeine"]["effect"] <= 35


# Experiment evaluation -------------------------------------------------------------------

def test_october_experiment_is_supported_and_merged(demo_conn):
    exp = demo_conn.execute("SELECT * FROM experiments WHERE id = 'exp_0'").fetchone()
    assert exp["status"] == "supported"
    kn = demo_conn.execute("SELECT * FROM knowledge WHERE experiment_id = 'exp_0'").fetchone()
    assert kn["statement"] == "Caffeine after 4 PM cuts my sleep by about 30 min"
    assert kn["date"] == "2026-10-22"


def test_running_experiment_progress(demo_conn):
    exp = demo_conn.execute("SELECT * FROM experiments WHERE id = 'exp_1'").fetchone()
    prog = progress(demo_conn, exp, generate_demo.CLOCK_START)
    assert prog["days_elapsed"] == 8
    assert prog["adherent_days"] == 7
    assert exp["status"] == "active"


def test_advancing_the_clock_concludes_the_experiment():
    conn = connect(":memory:")
    generate_demo.build(conn)
    refresh_state(conn, generate_demo.DEMO_END)
    exp = conn.execute("SELECT * FROM experiments WHERE id = 'exp_1'").fetchone()
    assert exp["status"] == "supported"
    branch = conn.execute("SELECT * FROM branches WHERE id = 'br_1'").fetchone()
    assert (branch["status"], branch["end_date"]) == ("concluded", "2026-11-22")
    kn = conn.execute("SELECT * FROM knowledge WHERE experiment_id = 'exp_1'").fetchone()
    assert "8 of 10 nights" in kn["statement"] and "from 5 to 0" in kn["statement"]


def _draft(conn, start="2026-11-25", criterion='{"kind":"count_days","metric":"sleep_min","op":">","threshold":420,"min_days":7}'):
    conn.execute(
        "INSERT INTO experiments (id, branch_id, hypothesis_id, description, start_date, duration_days,"
        " success_criterion, criterion, adherence_rule, knowledge_template) VALUES"
        " ('exp_t', 'br_1', 'hy_11', 'test', ?, 10, 'Sleep over 7 hours on 7 of 10 nights', ?,"
        " '{\"metric\":\"lights_out\",\"op\":\"<=\",\"threshold\":690}', '{}')",
        (start, criterion),
    )
    return conn.execute("SELECT * FROM experiments WHERE id = 'exp_t'").fetchone()


def test_lock_freezes_the_baseline_once():
    conn = connect(":memory:")
    generate_demo.build(conn)
    _draft(conn)
    exp = lock_experiment(conn, "exp_t", generate_demo.CLOCK_START, locked_at="2026-11-20T09:00:00Z")
    assert exp["locked"] == 1 and exp["status"] == "active" and exp["frozen_baseline"]
    again = lock_experiment(conn, "exp_t", generate_demo.CLOCK_START)
    assert again["locked_at"] == "2026-11-20T09:00:00Z"  # locking twice changes nothing


def test_cannot_lock_after_the_start():
    conn = connect(":memory:")
    generate_demo.build(conn)
    _draft(conn, start="2026-11-18")
    with pytest.raises(ExperimentError) as err:
        lock_experiment(conn, "exp_t", generate_demo.CLOCK_START)
    assert err.value.status_code == 409


def test_low_adherence_is_insufficient_data():
    conn = connect(":memory:")
    generate_demo.build(conn)
    # 3-12 Nov: lights out after 11:30 on most nights, so adherence is far below 70%.
    exp = _draft(conn, start="2026-11-03")
    assert evaluate(conn, exp, date(2026, 11, 12))["result"] == "insufficient_data"


def test_too_few_days_is_insufficient_data():
    conn = connect(":memory:")
    generate_demo.build(conn)
    exp = _draft(conn, start="2026-11-13")
    # Only 5 days of the 10 have happened by 17 Nov.
    assert evaluate(conn, exp, date(2026, 11, 17))["result"] == "insufficient_data"


def test_not_supported_when_criterion_missed():
    conn = connect(":memory:")
    generate_demo.build(conn)
    exp = _draft(
        conn,
        start="2026-11-13",
        criterion='{"kind":"count_days","metric":"sleep_min","op":">","threshold":450,"min_days":7}',
    )
    assert evaluate(conn, exp, generate_demo.DEMO_END)["result"] == "not_supported"
