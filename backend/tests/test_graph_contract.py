"""GET /api/graph must match contracts/sample_graph.json key-for-key and type-for-type.

These checks compare against the sample's structure, not its values, so they
keep working once the route reads from SQLite instead of the sample file.
"""

import json
import re
from pathlib import Path

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

SAMPLE_PATH = Path(__file__).resolve().parents[2] / "contracts" / "sample_graph.json"
SAMPLE = json.loads(SAMPLE_PATH.read_text(encoding="utf-8"))

ISO_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
BRANCH_STATUSES = {"open", "concluded", "inconclusive"}

# Fields the contract allows to be null (an open branch has no end_date yet), with their non-null type.
NULLABLE = {"branches[].end_date": str}


def assert_same_shape(actual, expected, path="$"):
    """Recursively check that `actual` has exactly the keys and JSON types of `expected`."""
    if path in NULLABLE:
        assert actual is None or type(actual) is NULLABLE[path], (
            f"{path}: expected null or {NULLABLE[path].__name__}, got {actual!r}"
        )
        return
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
        for i, item in enumerate(actual):
            assert_same_shape(item, template, f"{path}[]")


def get_graph():
    response = client.get("/api/graph")
    assert response.status_code == 200
    return response.json()


def test_graph_top_level_keys():
    assert list(get_graph()) == ["range", "trunk", "change_events", "branches", "knowledge"]


def test_graph_matches_sample_shape():
    data = get_graph()
    assert_same_shape(data, SAMPLE)
    for key in ("trunk", "change_events", "branches", "knowledge"):
        assert data[key], f"{key} should not be empty"


def test_graph_dates_and_enums():
    data = get_graph()
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
    for br in data["branches"]:
        assert br["status"] in BRANCH_STATUSES
        assert br["id"].startswith("br_")
    for ce in data["change_events"]:
        assert ce["id"].startswith("ce_")
        assert all(isinstance(r, str) for r in ce["record_ids"])


def test_graph_serves_sample_for_now():
    # Task 1 serves the sample verbatim. Drop this test when the route reads from SQLite.
    assert get_graph() == SAMPLE


def test_cors_allows_frontend_origin():
    origin = "http://localhost:5173"
    response = client.get("/api/graph", headers={"Origin": origin})
    assert response.headers.get("access-control-allow-origin") == origin

    preflight = client.options(
        "/api/graph",
        headers={"Origin": origin, "Access-Control-Request-Method": "GET"},
    )
    assert preflight.status_code == 200
    assert preflight.headers.get("access-control-allow-origin") == origin


def test_cors_rejects_other_origins():
    response = client.get("/api/graph", headers={"Origin": "http://evil.example"})
    assert "access-control-allow-origin" not in response.headers
