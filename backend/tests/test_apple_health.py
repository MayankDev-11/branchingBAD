"""Apple Health importer, on a small hand-made export.xml (never a real one)."""

import sqlite3
import zipfile

import pytest

from backend.data import generate_demo
from backend.data.db import connect
from backend.data.import_apple_health import clean_source_name, import_export

WATCH = "Parikshit's Apple Watch"
PHONE = "Parikshit’s iPhone"


def rec(rtype, start, end=None, value="", unit=None, source=WATCH, extra=""):
    unit_attr = f' unit="{unit}"' if unit else ""
    return (
        f'<Record type="{rtype}" sourceName="{source}" sourceVersion="10.1"{unit_attr}'
        f' creationDate="{end or start}" startDate="{start}" endDate="{end or start}" value="{value}">{extra}</Record>'
    )


SLEEP = "HKCategoryTypeIdentifierSleepAnalysis"
STEPS = "HKQuantityTypeIdentifierStepCount"
WATER = "HKQuantityTypeIdentifierDietaryWater"

RECORDS = [
    # Night ending 3 Nov: in bed 23:10, asleep 23:30-03:00 and 03:00-05:30 on the watch,
    # with the phone also tracking 23:45-01:00 (overlap: must not be counted twice).
    rec(SLEEP, "2026-11-02 23:10:00 +0530", "2026-11-03 05:40:00 +0530", "HKCategoryValueSleepAnalysisInBed", source=PHONE),
    rec(SLEEP, "2026-11-02 23:30:00 +0530", "2026-11-03 03:00:00 +0530", "HKCategoryValueSleepAnalysisAsleepCore"),
    rec(SLEEP, "2026-11-03 03:00:00 +0530", "2026-11-03 05:30:00 +0530", "HKCategoryValueSleepAnalysisAsleepREM"),
    rec(SLEEP, "2026-11-02 23:45:00 +0530", "2026-11-03 01:00:00 +0530", "HKCategoryValueSleepAnalysisAsleepUnspecified", source=PHONE),
    rec(SLEEP, "2026-11-03 01:00:00 +0530", "2026-11-03 01:05:00 +0530", "HKCategoryValueSleepAnalysisAwake"),
    # Night ending 4 Nov, written in UTC: 18:00Z = 23:30 IST, 01:15Z = 06:45 IST.
    rec(SLEEP, "2026-11-03 18:00:00 +0000", "2026-11-04 01:15:00 +0000", "HKCategoryValueSleepAnalysisAsleepCore"),
    # Steps on 3 Nov from both devices: keep the larger total, never the sum.
    rec(STEPS, "2026-11-03 09:00:00 +0530", "2026-11-03 10:00:00 +0530", "4000", "count"),
    rec(STEPS, "2026-11-03 18:00:00 +0530", "2026-11-03 19:00:00 +0530", "3500", "count"),
    rec(STEPS, "2026-11-03 09:00:00 +0530", "2026-11-03 10:00:00 +0530", "3000", "count", source=PHONE),
    # A broken pedometer day: kept, but excluded with a reason.
    rec(STEPS, "2026-11-04 09:00:00 +0530", "2026-11-04 10:00:00 +0530", "250000", "count"),
    # Water in mL and L, one typed in by hand.
    rec(WATER, "2026-11-03 08:00:00 +0530", value="500", unit="mL", source="Health",
        extra='<MetadataEntry key="HKWasUserEntered" value="1"/>'),
    rec(WATER, "2026-11-03 14:00:00 +0530", value="0.75", unit="L", source="WaterMinder"),
    rec("HKQuantityTypeIdentifierDietaryCaffeine", "2026-11-03 17:15:00 +0530", value="95", unit="mg"),
    rec("HKQuantityTypeIdentifierDietaryCaffeine", "2026-11-04 09:00:00 +0530", value="95", unit="mg"),
    rec("HKCategoryTypeIdentifierHeadache", "2026-11-03 15:00:00 +0530", "2026-11-03 17:00:00 +0530",
        "HKCategoryValueSeverityModerate", source="Health"),
    # A type we do not use.
    rec("HKQuantityTypeIdentifierHeartRate", "2026-11-03 09:00:00 +0530", value="72", unit="count/min"),
]

FOOD = (
    '<Correlation type="HKCorrelationTypeIdentifierFood" sourceName="MyFitnessPal"'
    ' startDate="2026-11-03 13:00:00 +0530" endDate="2026-11-03 13:00:00 +0530">'
    + rec(WATER, "2026-11-03 13:00:00 +0530", value="250", unit="mL", source="MyFitnessPal")
    + "</Correlation>"
)
FOOD_TOP = rec(WATER, "2026-11-03 13:00:00 +0530", value="250", unit="mL", source="MyFitnessPal")

EXPORT = f"""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE HealthData [
<!ELEMENT HealthData (ExportDate,Me,(Record|Correlation)*)>
<!ATTLIST HealthData locale CDATA #REQUIRED>
]>
<HealthData locale="en_IN">
 <ExportDate value="2026-11-20 10:00:00 +0530"/>
 <Me HKCharacteristicTypeIdentifierDateOfBirth="2007-03-14" HKCharacteristicTypeIdentifierBiologicalSex="HKBiologicalSexMale" HKCharacteristicTypeIdentifierBloodType="HKBloodTypeOPositive"/>
 {''.join(RECORDS)}
 {FOOD_TOP}
 {FOOD}
</HealthData>
"""


@pytest.fixture
def export_file(tmp_path):
    path = tmp_path / "export.xml"
    path.write_text(EXPORT, encoding="utf-8")
    return path


@pytest.fixture
def imported(export_file):
    conn = connect(":memory:")
    summary = import_export(conn, export_file, imported_at="2026-11-20T10:00:00+05:30")
    return conn, summary


def obs(conn, metric, day):
    return conn.execute("SELECT * FROM observations WHERE metric = ? AND date = ?", (metric, day)).fetchone()


def test_names_are_removed_from_device_names():
    assert clean_source_name("Parikshit's Apple Watch") == "Apple Watch"
    assert clean_source_name("Parikshit’s iPhone") == "iPhone"
    assert clean_source_name("WaterMinder") == "WaterMinder"


def test_profile_and_names_never_reach_the_database(imported):
    conn, summary = imported
    assert summary.profile_skipped
    dump = "\n".join(conn.iterdump())
    for secret in ("Parikshit", "2007-03-14", "HKBiologicalSex", "HKBloodType"):
        assert secret not in dump


def test_sleep_merges_overlaps_and_skips_awake(imported):
    conn, _ = imported
    night = obs(conn, "sleep_min", "2026-11-03")
    # 23:30 -> 05:30 asleep = 360 min; the phone's overlapping 23:45-01:00 adds nothing.
    assert night["value"] == 360
    assert night["device"] == "Apple Watch" and night["time"] == "05:30:00"
    lights = obs(conn, "lights_out", "2026-11-03")
    assert lights["value"] == 670  # in bed 23:10 = 11 h 10 min after noon
    assert lights["device"] == "iPhone"


def test_times_from_another_timezone_are_converted_to_ist(imported):
    conn, _ = imported
    night = obs(conn, "sleep_min", "2026-11-04")
    assert night["value"] == 435 and night["time"] == "06:45:00"
    assert obs(conn, "lights_out", "2026-11-04")["value"] == 690


def test_steps_take_the_best_device_not_the_sum(imported):
    conn, _ = imported
    day = obs(conn, "steps", "2026-11-03")
    assert day["value"] == 7500 and day["device"] == "Apple Watch"
    assert "highest of 2 devices" in day["normalization"]


def test_implausible_day_is_excluded_with_a_reason(imported):
    conn, summary = imported
    day = obs(conn, "steps", "2026-11-04")
    assert day["value"] == 250000 and day["is_excluded"] == 1
    assert "plausible" in day["exclusion_reason"]
    assert summary.excluded == 1


def test_water_units_and_correlations(imported):
    conn, _ = imported
    day = obs(conn, "water_ml", "2026-11-03")
    # 500 mL + 0.75 L + 250 mL; the copy inside the food correlation is not counted again.
    assert day["value"] == 1500
    assert day["data_quality"] == 0.8  # one entry was typed in by hand


def test_headache_and_late_caffeine_flags(imported):
    conn, _ = imported
    assert obs(conn, "headache", "2026-11-03")["value"] == 1
    assert obs(conn, "caffeine_pm", "2026-11-03")["value"] == 1
    assert obs(conn, "caffeine_pm", "2026-11-04")["value"] == 0


def test_unused_types_are_skipped(imported):
    conn, summary = imported
    assert summary.records_skipped == 2  # heart rate and the "awake" segment
    assert conn.execute("SELECT COUNT(*) FROM source_records WHERE raw_type LIKE '%HeartRate%'").fetchone()[0] == 0


def test_every_observation_points_at_its_raw_record(imported):
    conn, _ = imported
    orphans = conn.execute(
        "SELECT COUNT(*) FROM observations o LEFT JOIN source_records s ON s.id = o.source_record_id WHERE s.id IS NULL"
    ).fetchone()[0]
    assert orphans == 0
    ended = conn.execute("SELECT ended_at FROM source_records WHERE raw_value = 'HKCategoryValueSleepAnalysisAsleepREM'")
    assert ended.fetchone()[0] == "2026-11-03T05:30:00+05:30"


def test_importing_twice_adds_nothing(export_file, imported):
    conn, first = imported
    counts = [conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("source_records", "observations")]
    second = import_export(conn, export_file)
    assert second.raw_inserted == 0 and second.observations == {}
    assert second.already_present == sum(first.observations.values())
    assert [conn.execute(f"SELECT COUNT(*) FROM {t}").fetchone()[0] for t in ("source_records", "observations")] == counts


def test_imported_observations_are_still_immutable(imported):
    conn, _ = imported
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        conn.execute("UPDATE observations SET value = 480 WHERE metric = 'sleep_min'")


def test_reads_apples_zip(tmp_path):
    archive = tmp_path / "export.zip"
    with zipfile.ZipFile(archive, "w") as zf:
        zf.writestr("apple_health_export/export.xml", EXPORT)
        zf.writestr("apple_health_export/export_cda.xml", "<ClinicalDocument/>")
    conn = connect(":memory:")
    summary = import_export(conn, archive)
    assert summary.observations["sleep_min"] == 2


def test_import_into_the_demo_database_keeps_ids_unique(tmp_path):
    conn = connect(":memory:")
    generate_demo.build(conn)
    before = {r["id"]: r["value"] for r in conn.execute("SELECT id, value FROM observations")}
    late = rec(WATER, "2026-11-30 09:00:00 +0530", value="1800", unit="mL")
    path = tmp_path / "export.xml"
    path.write_text(EXPORT.replace("</HealthData>", late + "</HealthData>"), encoding="utf-8")
    summary = import_export(conn, path)
    # 3-4 Nov already have demo values, so they are not replaced (rule 5); 30 Nov is new.
    assert summary.observations == {"water_ml": 1}
    after = {r["id"]: r["value"] for r in conn.execute("SELECT id, value FROM observations")}
    assert {k: after[k] for k in before} == before
    (new_id,) = set(after) - set(before)
    assert new_id == f"wt_{max(int(k[3:]) for k in before if k.startswith('wt_')) + 1:04d}"
