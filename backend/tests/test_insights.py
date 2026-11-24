"""GET /api/insights and POST /api/import/apple-health."""

import io
import sqlite3
import zipfile

from fastapi.testclient import TestClient

from backend.data.import_apple_health import import_export  # noqa: F401  (import check)
from backend.main import app
from backend.tests.test_apple_health import EXPORT

client = TestClient(app)
client.post("/api/auth/demo")


def test_insights_needs_sign_in():
    assert TestClient(app).get("/api/insights").status_code == 401


def test_insights_tells_the_demo_story(fresh_store):
    d = client.get("/api/insights").json()
    assert d["as_of"] == "2026-11-20"

    shift = d["sleep_shift"]
    assert shift["date"] == "2026-11-03" and shift["delta_min"] == -47
    assert shift["after_median_min"] - shift["before_median_min"] == -47
    assert shift["normal_low_min"] < shift["normal_median_min"] < shift["normal_high_min"]

    # Late screen time rises after 3 Nov.
    assert d["screen"]["after_avg_min"] > d["screen"]["before_avg_min"]

    hyps = {(h["branch_id"], h["label"]): h for h in d["hypotheses"]}
    short = hyps[("br_1", "Short sleep")]
    assert (short["k"], short["n"]) == (4, 5) and short["confidence"] == 60
    assert hyps[("br_0", "Late caffeine")]["confidence"] == 72

    exp = d["experiment"]
    assert exp["id"] == "exp_1" and len(exp["nights"]) == exp["duration_days"] == 10
    assert exp["nights_logged"] == exp["days_elapsed"] == 8
    assert exp["nights_met"] == sum(1 for n in exp["nights"] if n["met"])
    assert all(n["met"] == (n["value"] > exp["threshold"]) for n in exp["nights"] if n["value"] is not None)

    cov = d["coverage"]
    assert cov["total_observations"] == sum(m["count"] for m in cov["metrics"])
    assert cov["total_observations"] == sum(s["count"] for s in cov["sources"])
    assert sum(w["apple_health"] + w["other"] for w in cov["weekly"]) == cov["total_observations"]


def test_every_record_id_in_insights_exists(fresh_store):
    """Rule 2 for the charts: every id the page can open is a real record."""
    d = client.get("/api/insights").json()
    ids = set(d["sleep_shift"]["record_ids"])
    for day in d["days"]:
        ids |= {day[k] for k in ("sleep_id", "water_id", "screen_id", "headache_id") if day[k]}
    for h in d["hypotheses"]:
        ids |= set(h["record_ids"])
    ids |= {n["record_id"] for n in d["experiment"]["nights"] if n["record_id"]}
    assert ids
    for rid in ids:
        assert client.get(f"/api/records/{rid}").status_code == 200, rid


def test_insights_follow_the_demo_clock(fresh_store):
    client.post("/api/demo/advance", json={"days": 10})
    d = client.get("/api/insights").json()
    assert d["as_of"] == "2026-11-22"
    assert d["knowledge_count"] == 2
    assert d["experiment"]["nights_logged"] == 10


def test_upload_imports_into_its_own_database(fresh_store, tmp_path, monkeypatch):
    db = tmp_path / "upload.db"
    monkeypatch.setenv("ROOTTRACE_IMPORT_DB", str(db))
    before = client.get("/api/insights").json()["coverage"]["total_observations"]

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("apple_health_export/export.xml", EXPORT)
    r = client.post("/api/import/apple-health?filename=export.zip", content=buf.getvalue())
    assert r.status_code == 200, r.text
    summary = r.json()
    assert summary["source_file"] == "export.zip"
    assert summary["observations"]["sleep_min"] == 2 and summary["profile_skipped"]

    with sqlite3.connect(db) as conn:
        assert conn.execute("SELECT COUNT(*) FROM observations").fetchone()[0] == sum(summary["observations"].values())
    # The demo database is untouched.
    assert client.get("/api/insights").json()["coverage"]["total_observations"] == before


def test_upload_rejects_other_files():
    assert client.post("/api/import/apple-health?filename=notes.pdf", content=b"x").status_code == 400
    assert client.post("/api/import/apple-health?filename=export.xml", content=b"").status_code == 400
    assert client.post("/api/import/apple-health?filename=export.xml", content=b"<not xml").status_code == 400
