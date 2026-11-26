"""Apple Health importer: export.xml (or the export.zip it comes in) -> source_records + observations.

    python -m backend.data.import_apple_health path/to/export.zip --db backend/data/my_health.db --detect

How it works:
- The file is streamed with iterparse, so a multi-GB export never sits in memory.
- The <Me> profile record (date of birth, sex, blood type) is skipped without being read.
- "Name's Apple Watch" becomes "Apple Watch": no personal names are stored anywhere.
- Every raw XML record we use is kept untouched in source_records. Its id is a SHA-256 of
  source + time + type + value, so importing the same file twice adds nothing.
- Daily values go into observations in the same metrics and units as the demo data
  (sleep_min, lights_out, steps, water_ml, headache, caffeine_pm). A day that already has an
  observation is never touched (rule 5); an implausible day is kept but excluded with a reason.
- Records nested inside a <Correlation> (food, blood pressure) repeat top-level records, so they
  are ignored to avoid counting the same glass of water twice.

Never commit a real export or the database it produces (rule 8): *.db and export files are git-ignored.
"""

import argparse
import hashlib
import math
import re
import sqlite3
import zipfile
from collections import defaultdict
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path

from defusedxml.ElementTree import iterparse  # refuses entity-expansion tricks in an untrusted file

from backend.data.db import connect, init_schema
from backend.data.metrics import METRICS

IST = timezone(timedelta(hours=5, minutes=30))
BATCH = 5000
MAX_UNCOMPRESSED_XML_BYTES = 2 * 1024**3

STEPS = "HKQuantityTypeIdentifierStepCount"
WATER = "HKQuantityTypeIdentifierDietaryWater"
CAFFEINE = "HKQuantityTypeIdentifierDietaryCaffeine"
SLEEP = "HKCategoryTypeIdentifierSleepAnalysis"
HEADACHE = "HKCategoryTypeIdentifierHeadache"
USED_TYPES = {STEPS, WATER, CAFFEINE, SLEEP, HEADACHE}

ASLEEP = {
    "HKCategoryValueSleepAnalysisAsleep",
    "HKCategoryValueSleepAnalysisAsleepUnspecified",
    "HKCategoryValueSleepAnalysisAsleepCore",
    "HKCategoryValueSleepAnalysisAsleepDeep",
    "HKCategoryValueSleepAnalysisAsleepREM",
}
IN_BED = "HKCategoryValueSleepAnalysisInBed"
HEADACHE_PRESENT = {
    "HKCategoryValueSeverityUnspecified",
    "HKCategoryValueSeverityMild",
    "HKCategoryValueSeverityModerate",
    "HKCategoryValueSeveritySevere",
}
HEADACHE_ABSENT = "HKCategoryValueSeverityNotPresent"
WATER_TO_ML = {"mL": 1.0, "ml": 1.0, "L": 1000.0, "cL": 10.0, "dL": 100.0, "fl_oz_us": 29.5735, "cup_us": 236.588}
CAFFEINE_CUTOFF = time(16, 0)

# Kept but excluded (with a reason) when outside these ranges.
PLAUSIBLE = {
    "sleep_min": (60, 16 * 60),
    "lights_out": (0, 24 * 60 - 1),
    "steps": (0, 70_000),
    "water_ml": (0, 8_000),
}

NORMALIZATION = {
    "sleep_min": "HKCategoryValueSleepAnalysisAsleep* -> minutes asleep, overlapping segments merged",
    "lights_out": "first InBed (or Asleep) start of the night -> minutes after 12:00",
    "steps": "HKQuantityTypeIdentifierStepCount -> daily sum from the device with the most steps",
    "water_ml": "HKQuantityTypeIdentifierDietaryWater -> daily sum in ml",
    "headache": "HKCategoryTypeIdentifierHeadache -> binary_flag (any severity = 1)",
    "caffeine_pm": "HKQuantityTypeIdentifierDietaryCaffeine after 16:00 -> binary_flag",
}

_POSSESSIVE = re.compile(r"^.+?['’ʼ]s\s+(.+)$")


def clean_source_name(name: str) -> str:
    """"Parikshit's Apple Watch" -> "Apple Watch". Names without a possessive are kept."""
    name = (name or "Unknown source").strip()
    match = _POSSESSIVE.match(name)
    return match.group(1).strip() if match else name


def source_id_for(device: str) -> str:
    return "src_ah_" + hashlib.sha256(device.encode()).hexdigest()[:6]


def parse_time(value: str) -> datetime:
    """Apple writes "2026-11-03 07:00:00 +0530"; everything is stored in IST."""
    return datetime.strptime(value, "%Y-%m-%d %H:%M:%S %z").astimezone(IST)


@dataclass
class Segment:
    start: datetime
    end: datetime
    asleep: bool
    device: str
    src_id: str
    manual: bool


@dataclass
class Day:
    """What one metric looks like on one day, before it becomes an observation."""
    value: float = 0.0
    src_id: str = ""
    device: str = ""
    last: datetime | None = None
    manual: bool = False

    def add(self, amount: float, src_id: str, device: str, at: datetime, manual: bool) -> None:
        self.value += amount
        self.src_id = self.src_id or src_id
        self.device = self.device or device
        self.last = at if self.last is None or at > self.last else self.last
        self.manual = self.manual or manual


@dataclass
class ImportSummary:
    source_file: str
    records_read: int = 0
    records_used: int = 0
    records_skipped: int = 0
    profile_skipped: bool = False
    raw_inserted: int = 0
    observations: dict = field(default_factory=dict)
    excluded: int = 0
    already_present: int = 0
    first_date: str | None = None
    last_date: str | None = None


class _LimitedStream:
    """Guard against zip bombs by bounding total decompressed bytes read from export.xml."""

    def __init__(self, stream, limit: int):
        self._stream = stream
        self._limit = limit
        self._read_bytes = 0

    def read(self, size: int = -1) -> bytes:
        chunk = self._stream.read(size)
        self._read_bytes += len(chunk)
        if self._read_bytes > self._limit:
            raise ValueError("Uncompressed export.xml exceeds size limit")
        return chunk


@contextmanager
def open_export(path: Path):
    """Yield a binary stream of export.xml, from the XML itself or from Apple's export.zip."""
    if path.suffix.lower() == ".zip":
        with zipfile.ZipFile(path) as zf:
            members = [n for n in zf.namelist() if n.rsplit("/", 1)[-1] == "export.xml"]
            if not members:
                raise ValueError(f"{path.name} has no export.xml inside")
            info = zf.getinfo(members[0])
            if info.file_size > MAX_UNCOMPRESSED_XML_BYTES:
                raise ValueError("Uncompressed export.xml exceeds size limit")
            with zf.open(info) as fh:
                yield _LimitedStream(fh, MAX_UNCOMPRESSED_XML_BYTES)
    else:
        with open(path, "rb") as fh:
            yield fh


class Collector:
    def __init__(self, source_file: str, imported_at: str):
        self.source_file = source_file
        self.imported_at = imported_at
        self.raw: list[tuple] = []
        self.steps: dict[tuple[date, str], Day] = defaultdict(Day)
        self.water: dict[date, Day] = defaultdict(Day)
        self.caffeine: dict[date, Day] = defaultdict(Day)
        self.headache: dict[date, Day] = defaultdict(Day)
        self.sleep: dict[date, list[Segment]] = defaultdict(list)

    def raw_row(self, rtype: str, value: str, unit: str | None, device: str, start: datetime, end: datetime | None):
        recorded_at = start.isoformat()
        source_id = source_id_for(device)
        src_id = hashlib.sha256(f"{source_id}|{recorded_at}|{rtype}|{value}".encode()).hexdigest()
        self.raw.append((src_id, source_id, self.source_file, device, rtype, value, unit, recorded_at,
                         end.isoformat() if end else None, self.imported_at))
        return src_id

    def record(self, attrs: dict, manual: bool) -> bool:
        """Turn one top-level <Record> into raw rows and daily totals. False if it was not usable."""
        rtype = attrs.get("type")
        if rtype not in USED_TYPES:
            return False
        try:
            start = parse_time(attrs["startDate"])
            end = parse_time(attrs.get("endDate") or attrs["startDate"])
        except (KeyError, ValueError):
            return False
        value = attrs.get("value", "")
        unit = attrs.get("unit")
        device = clean_source_name(attrs.get("sourceName", ""))
        manual = manual or device == "Health"

        if rtype in (STEPS, WATER, CAFFEINE):
            try:
                amount = float(value)
            except ValueError:
                return False
            if not math.isfinite(amount):
                return False
            if rtype == WATER:
                if unit not in WATER_TO_ML:
                    return False
                amount *= WATER_TO_ML[unit]
            src_id = self.raw_row(rtype, value, unit, device, start, None)
            if rtype == STEPS:
                self.steps[(start.date(), device)].add(amount, src_id, device, end, manual)
            elif rtype == WATER:
                self.water[start.date()].add(amount, src_id, device, end, manual)
            else:
                late = 1.0 if start.time() >= CAFFEINE_CUTOFF and amount > 0 else 0.0
                day = self.caffeine[start.date()]
                day.add(0.0, src_id, device, end, manual)
                day.value = max(day.value, late)
            return True

        if rtype == HEADACHE:
            if value not in HEADACHE_PRESENT and value != HEADACHE_ABSENT:
                return False
            src_id = self.raw_row(rtype, value, None, device, start, end)
            day = self.headache[start.date()]
            day.add(0.0, src_id, device, end, manual)
            day.value = max(day.value, 1.0 if value in HEADACHE_PRESENT else 0.0)
            return True

        # Sleep. A night belongs to the morning it ends on: shift back 12 h to find the evening.
        if value not in ASLEEP and value != IN_BED:
            return False
        if end <= start:
            return False
        src_id = self.raw_row(rtype, value, None, device, start, end)
        wake_day = (start - timedelta(hours=12)).date() + timedelta(days=1)
        self.sleep[wake_day].append(Segment(start, end, value in ASLEEP, device, src_id, manual))
        return True

    def observations(self) -> list[dict]:
        """One row per metric per day, in the same shape the demo generator writes."""
        rows: list[dict] = []

        def emit(metric: str, day: date, value: float, src_id: str, device: str, at: datetime | None,
                 manual: bool, note: str = ""):
            rows.append({
                "metric": metric, "date": day, "value": round(value, 1) if metric != "steps" else round(value),
                "src_id": src_id, "device": device, "time": (at or datetime.combine(day, time(23, 59, 59))).strftime("%H:%M:%S"),
                "quality": 0.8 if manual else 1.0, "normalization": NORMALIZATION[metric] + note,
            })

        by_day: dict[date, list[Day]] = defaultdict(list)
        for (day, _device), totals in self.steps.items():
            by_day[day].append(totals)
        for day, sources in by_day.items():
            best = max(sources, key=lambda d: d.value)
            note = f" (highest of {len(sources)} devices, not added together)" if len(sources) > 1 else ""
            emit("steps", day, best.value, best.src_id, best.device, best.last, best.manual, note)

        for day, d in self.water.items():
            emit("water_ml", day, d.value, d.src_id, d.device, d.last, d.manual)
        for day, d in self.caffeine.items():
            emit("caffeine_pm", day, d.value, d.src_id, d.device, d.last, d.manual)
        for day, d in self.headache.items():
            emit("headache", day, d.value, d.src_id, d.device, d.last, d.manual)

        for wake_day, segments in self.sleep.items():
            asleep = sorted((s for s in segments if s.asleep), key=lambda s: s.start)
            if asleep:
                minutes = merged_minutes([(s.start, s.end) for s in asleep])
                per_device: dict[str, float] = defaultdict(float)
                for s in asleep:
                    per_device[s.device] += (s.end - s.start).total_seconds() / 60
                device = max(per_device, key=per_device.get)
                first = next(s for s in asleep if s.device == device)
                emit("sleep_min", wake_day, minutes, first.src_id, device, max(s.end for s in asleep),
                     any(s.manual for s in asleep))
            in_bed = [s for s in segments if not s.asleep] or asleep
            if in_bed:
                first = min(in_bed, key=lambda s: s.start)
                noon = datetime.combine(wake_day - timedelta(days=1), time(12, 0), tzinfo=IST)
                emit("lights_out", wake_day, (first.start - noon).total_seconds() / 60, first.src_id,
                     first.device, first.start, first.manual)
        return rows


def merged_minutes(intervals: list[tuple[datetime, datetime]]) -> float:
    """Total minutes covered, counting overlaps (watch and phone both tracking) once."""
    total = 0.0
    cur_start, cur_end = None, None
    for start, end in sorted(intervals):
        if cur_end is None or start > cur_end:
            if cur_end is not None:
                total += (cur_end - cur_start).total_seconds()
            cur_start, cur_end = start, end
        else:
            cur_end = max(cur_end, end)
    if cur_end is not None:
        total += (cur_end - cur_start).total_seconds()
    return total / 60


def _next_numbers(conn: sqlite3.Connection) -> dict[str, int]:
    counters = {}
    for metric, m in METRICS.items():
        row = conn.execute(
            "SELECT MAX(CAST(substr(id, ?) AS INTEGER)) FROM observations WHERE id LIKE ?",
            (len(m.prefix) + 2, f"{m.prefix}_%"),
        ).fetchone()
        counters[metric] = (row[0] or 0) + 1
    return counters


def import_export(conn: sqlite3.Connection, path: str | Path, imported_at: str | None = None) -> ImportSummary:
    """Import one Apple Health export into an open database. The caller commits."""
    path = Path(path)
    init_schema(conn)
    imported_at = imported_at or datetime.now(IST).replace(microsecond=0).isoformat()
    # Store only the file name, never the folder (it can contain the user's name).
    collector = Collector("export.xml", imported_at)
    summary = ImportSummary(source_file=path.name)

    depth = 0
    root = None
    with open_export(path) as fh:
        for event, elem in iterparse(fh, events=("start", "end")):
            if event == "start":
                depth += 1
                if root is None:
                    root = elem
                continue
            depth -= 1
            if depth != 1:  # only direct children of <HealthData>
                continue
            if elem.tag == "Me":
                summary.profile_skipped = True
            elif elem.tag == "Record":
                summary.records_read += 1
                manual = any(
                    e.get("key") == "HKWasUserEntered" and e.get("value") == "1" for e in elem.iter("MetadataEntry")
                )
                if collector.record(elem.attrib, manual):
                    summary.records_used += 1
                else:
                    summary.records_skipped += 1
                if len(collector.raw) >= BATCH:
                    summary.raw_inserted += _flush_raw(conn, collector)
            root.clear()  # drop everything already handled, Me included
    summary.raw_inserted += _flush_raw(conn, collector)

    counters = _next_numbers(conn)
    existing = {(r[0], r[1]) for r in conn.execute("SELECT metric, date FROM observations")}
    counts: dict[str, int] = defaultdict(int)
    dates = []
    for row in sorted(collector.observations(), key=lambda r: (r["date"], r["metric"])):
        day = row["date"].isoformat()
        if (row["metric"], day) in existing:
            summary.already_present += 1
            continue
        m = METRICS[row["metric"]]
        lo, hi = PLAUSIBLE.get(row["metric"], (float("-inf"), float("inf")))
        reason = None if lo <= row["value"] <= hi else f"outside the plausible range {lo}-{hi} {m.unit}"
        obs_id = f"{m.prefix}_{counters[row['metric']]:04d}"
        counters[row["metric"]] += 1
        conn.execute(
            "INSERT INTO observations (id, source_record_id, metric, value, unit, date, time, device, source_id,"
            " source_file, data_quality, normalization, is_excluded, exclusion_reason)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (obs_id, row["src_id"], row["metric"], float(row["value"]), m.unit, day, row["time"], row["device"],
             source_id_for(row["device"]), collector.source_file, row["quality"], row["normalization"],
             int(reason is not None), reason),
        )
        counts[row["metric"]] += 1
        summary.excluded += reason is not None
        dates.append(day)

    summary.observations = dict(sorted(counts.items()))
    if dates:
        summary.first_date, summary.last_date = min(dates), max(dates)
    return summary


def _flush_raw(conn: sqlite3.Connection, collector: Collector) -> int:
    before = conn.total_changes
    conn.executemany(
        "INSERT OR IGNORE INTO source_records (id, source_id, source_file, device, raw_type, raw_value, raw_unit,"
        " recorded_at, ended_at, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        collector.raw,
    )
    collector.raw.clear()
    return conn.total_changes - before


def main(argv=None) -> None:
    parser = argparse.ArgumentParser(description="Import an Apple Health export into a RootTrace database.")
    parser.add_argument("export", help="export.zip or export.xml from the Health app (Profile > Export All Health Data)")
    parser.add_argument("--db", default=str(Path(__file__).with_name("apple_health.db")),
                        help="SQLite file to write (default: backend/data/apple_health.db, git-ignored)")
    parser.add_argument("--detect", action="store_true", help="run change detection on the imported days")
    args = parser.parse_args(argv)

    conn = connect(args.db)
    try:
        summary = import_export(conn, args.export)
        conn.commit()
        print(f"Read {summary.records_read:,} records; used {summary.records_used:,}, "
              f"skipped {summary.records_skipped:,} of other types.")
        print(f"Profile record skipped: {'yes' if summary.profile_skipped else 'none in file'}.")
        print(f"New raw records: {summary.raw_inserted:,}.  Days already present: {summary.already_present:,}.")
        for metric, n in summary.observations.items():
            print(f"  {metric:12s} {n:5d} days")
        if summary.first_date:
            print(f"Dates: {summary.first_date} to {summary.last_date}.  Excluded as implausible: {summary.excluded}.")
        if args.detect and summary.last_date:
            from backend.analysis.change_detection import refresh_change_events

            events = refresh_change_events(conn, date.fromisoformat(summary.last_date))
            conn.commit()
            print(f"Change events: {len(events)}")
            for ev in events:
                print(f"  {ev['id']}: {ev['label']} from {ev['date']:%Y-%m-%d}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
