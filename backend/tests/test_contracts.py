"""Every route must match contracts/sample_*.json key-for-key and type-for-type.

These compare structure, not values: the values come from the generated demo data.
"""

import json
import re
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)
client.post("/api/auth/demo")  # the data routes need a signed-in session

CONTRACTS = Path(__file__).resolve().parents[2] / "contracts"
ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
BRANCH_STATUSES = {"open", "concluded", "inconclusive"}

# Fields the contract allows to be null, with their non-null type.
NULLABLE = {
    "branches[].end_date": str,   # an open branch has no end date yet
    "change_event": dict,         # a branch the user opened without a detected change
    "experiment": dict,           # a branch with no experiment yet
    "experiment.locked_at": str,  # a draft experiment is not locked yet
    "locked_at": str,
}


def sample(name: str):
    return json.loads((CONTRACTS / f"sample_{name}.json").read_text(encoding="utf-8"))


def assert_same_shape(actual, expected, path="$"):
    """Recursively check that `actual` has exactly the keys and JSON types of `expected`."""
    if path in NULLABLE:
        if actual is None:
            return
        assert type(actual) is NULLABLE[path], f"{path}: expected null or {NULLABLE[path].__name__}, got {actual!r}"
    if expected is None:
        assert actual is None, f"{path}: expected null, got {actual!r}"
        return

    # type() rather than isinstance(): bool must not pass as int, float must not pass as int.
    assert type(actual) is type(expected), (
        f"{path}: expected {type(expected).__name__}, got {type(actual).__name__} ({actual!r})"
    )

    if isinstance(expected, dict):
        assert set(actual) == set(expected), (
            f"{path}: keys differ; missing {sorted(set(expected) - set(actual))}, "
            f"extra {sorted(set(actual) - set(expected))}"
        )
        for key, value in expected.items():
            assert_same_shape(actual[key], value, f"{path}.{key}" if path != "$" else key)
    elif isinstance(expected, list) and expected:
        template = expected[0]
        for item in actual:
            assert_same_shape(item, template, f"{path}[]")


def get(url):
    response = client.get(url)
    assert response.status_code == 200, response.text
    return response.json()


def test_graph_matches_contract():
    data = get("/api/graph")
    assert list(data) == ["range", "trunk", "change_events", "branches", "knowledge"]
    assert_same_shape(data, sample("graph"))
    for key in ("trunk", "change_events", "branches"):
        assert data[key], f"{key} should not be empty"


def test_graph_dates_enums_and_ids():
    data = get("/api/graph")
    dates = [data["range"]["start"], data["range"]["end"]]
    dates += [row["date"] for row in data["trunk"]]
    dates += [ce["date"] for ce in data["change_events"]]
    dates += [kn["date"] for kn in data["knowledge"]]
    for br in data["branches"]:
        dates.append(br["start_date"])
        if br["end_date"] is not None:
            dates.append(br["end_date"])
    for d in dates:
        assert ISO_DATE.match(d), f"not an ISO date: {d!r}"
    assert data["range"]["start"] <= data["range"]["end"]
    assert all(row["date"] <= data["range"]["end"] for row in data["trunk"])
    for br in data["branches"]:
        assert br["status"] in BRANCH_STATUSES
        assert br["id"].startswith("br_")
    for ce in data["change_events"]:
        assert ce["id"].startswith("ce_")
        assert ce["record_ids"], "a change event must cite its records"


def test_branch_matches_contract():
    for branch_id in ("br_0", "br_1"):
        data = get(f"/api/branches/{branch_id}")
        assert_same_shape(data, sample("branch"))
        assert data["status"] in BRANCH_STATUSES
        assert [h["rank"] for h in data["hypotheses"]] == list(range(1, len(data["hypotheses"]) + 1))
        assert all(0 <= h["confidence"] <= 100 for h in data["hypotheses"])


def test_every_cited_record_exists():
    """Rule 2: every record id the backend cites must resolve to a real record."""
    graph = get("/api/graph")
    ids = {rid for ce in graph["change_events"] for rid in ce["record_ids"]}
    for branch_id in ("br_0", "br_1"):
        data = get(f"/api/branches/{branch_id}")
        ids |= {rid for h in data["hypotheses"] for c in h["claims"] for rid in c["record_ids"]}
        ids |= {e["id"] for e in data["evidence"]}
        if data["change_event"]:
            ids |= set(data["change_event"]["record_ids"])
    assert len(ids) > 20
    for rid in sorted(ids):
        assert client.get(f"/api/records/{rid}").status_code == 200, rid


def test_record_matches_contract():
    for rid in ("sl_0071", "hd_0071", "wt_0072", "lo_0071", "cf_0013", "sc_0070"):
        assert_same_shape(get(f"/api/records/{rid}"), sample("record"))


def test_lock_returns_experiment_shape():
    response = client.post("/api/experiments/exp_1/lock", json={})
    assert response.status_code == 200
    assert_same_shape(response.json(), sample("branch")["experiment"])


def test_advance_returns_graph_shape(fresh_store):
    response = client.post("/api/demo/advance", json={"days": 10})
    assert response.status_code == 200
    assert_same_shape(response.json(), sample("graph"))


def test_cors_allows_frontend_origin():
    origin = "http://localhost:5173"
    response = client.get("/api/graph", headers={"Origin": origin})
    assert response.headers.get("access-control-allow-origin") == origin

    preflight = client.options(
        "/api/experiments/exp_1/lock",
        headers={"Origin": origin, "Access-Control-Request-Method": "POST"},
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == origin


def test_cors_rejects_other_origins():
    response = client.get("/api/graph", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers
