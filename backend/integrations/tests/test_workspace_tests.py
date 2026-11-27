import sqlite3
from contextlib import closing
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient

from backend.integrations import workspace_tests
from backend.integrations.app import app


PAYLOAD = {
    "title": "Do headaches follow short sleep?",
    "branch_type": "investigation",
    "outcome": "headache",
    "start_date": "2026-11-18",
    "metrics": [],
    "hypotheses": [],
    "created_via": "manual",
}


@pytest.fixture
def workspace(monkeypatch, tmp_path, fresh_store):
    path = tmp_path / "workspace.db"
    monday = date(2026, 11, 23)
    monkeypatch.setenv("ROOTTRACE_WORKSPACE_DB", str(path))
    monkeypatch.setattr(workspace_tests, "_today", lambda: monday)
    with TestClient(app) as client:
        client.post("/api/auth/demo").raise_for_status()
        branch = client.post("/api/branches", json=PAYLOAD).raise_for_status().json()["detail"]
        yield client, f"/api/branches/{branch['id']}/tests", monday, path


def test_workspace_test_compares_actual_paired_check_ins_and_locks_result(workspace, monkeypatch):
    client, url, monday, path = workspace
    protocol = client.get(f"{url}/protocol").raise_for_status().json()
    proposal = next(item for item in protocol["proposals"] if "sleep" in item["factor"].casefold())
    assert proposal["factor_question"] == "Did you sleep less than 6 hours last night?"
    assert proposal["factor_question"] in proposal["plan"]
    start_payload = {"rank": proposal["rank"], "expected_factor": proposal["factor"]}
    assert client.post(url, json={**start_payload, "expected_factor": "Stale factor"}).status_code == 409
    started = client.post(url, json=start_payload).raise_for_status().json()
    assert started["status"] == "active" and started["start_date"] == monday.isoformat()
    assert started["factor_question"] == proposal["factor_question"]
    assert started["outcome_question"] == proposal["outcome_question"]
    assert started["plan"] == proposal["plan"]
    assert started["minimum_days"] == protocol["minimum_days"]
    assert started["minimum_days_per_group"] == protocol["minimum_days_per_group"]
    assert started["threshold_points"] == protocol["threshold_points"]
    assert client.post(url, json=start_payload).raise_for_status().json() == started
    assert client.post(url, json={"rank": 99}).status_code == 409
    test_url = f"{url}/{started['id']}"
    first = {"date": monday.isoformat(), "exposed": True, "outcome": True}
    assert client.post(f"{test_url}/finish").status_code == 409
    assert client.post(f"{test_url}/check-ins", json={**first, "date": "2026-11-24"}).status_code == 422
    assert client.post(f"{test_url}/check-ins", json={**first, "date": "2026-11-22"}).status_code == 422
    assert client.post(f"{test_url}/check-ins", json={**first, "exposed": "true"}).status_code == 422
    recorded = client.post(f"{test_url}/check-ins", json=first).raise_for_status().json()
    assert client.post(f"{test_url}/check-ins", json=first).raise_for_status().json() == recorded
    assert client.post(f"{test_url}/check-ins", json={**first, "outcome": False}).status_code == 409

    remaining_pairs = [(True, True), (True, True), (True, False), (False, True), (False, False), (False, False)]
    for offset, (exposed, outcome) in enumerate(remaining_pairs, 1):
        day = monday + timedelta(days=offset)
        monkeypatch.setattr(workspace_tests, "_today", lambda day=day: day)
        recorded = client.post(f"{test_url}/check-ins", json={
            "date": day.isoformat(), "exposed": exposed, "outcome": outcome,
        }).raise_for_status().json()
    assert recorded["can_finish"] is True
    finished = client.post(f"{test_url}/finish").raise_for_status().json()
    assert finished["status"] == "completed" and finished["can_finish"] is False
    assert finished["counts"] == {
        "exposed_days": 4, "unexposed_days": 3, "exposed_outcomes": 3, "unexposed_outcomes": 1,
    }
    expected = {"direction": "supported", "difference_points": 41.7, "exposed_rate": 75.0, "unexposed_rate": 33.3}
    assert {key: finished["result"][key] for key in expected} == expected
    assert client.post(f"{test_url}/finish").raise_for_status().json() == finished
    assert client.post(f"{test_url}/cancel").status_code == 409
    assert client.get(url).raise_for_status().json() == [finished]
    with closing(sqlite3.connect(path)) as conn:
        with pytest.raises(sqlite3.IntegrityError, match="test plan is locked"):
            conn.execute("UPDATE workspace_experiment_tests SET threshold_points = 0 WHERE id = ?", (started["id"],))
        with pytest.raises(sqlite3.IntegrityError, match="check-in is locked"):
            conn.execute("UPDATE workspace_experiment_check_ins SET outcome = 0 WHERE test_id = ?", (started["id"],))
        with pytest.raises(sqlite3.IntegrityError, match="test result is locked"):
            conn.execute("UPDATE workspace_experiment_tests SET result = NULL WHERE id = ?", (started["id"],))


def test_workspace_test_can_cancel_and_survives_branch_closure(workspace):
    client, url, monday, _ = workspace
    proposed = client.get(f"{url}/protocol").raise_for_status().json()["proposals"][0]
    started = client.post(url, json={"rank": proposed["rank"]}).raise_for_status().json()
    test_url = f"{url}/{started['id']}"
    client.post(f"{test_url}/check-ins", json={
        "date": monday.isoformat(), "exposed": True, "outcome": False,
    }).raise_for_status()
    cancelled = client.post(f"{test_url}/cancel").raise_for_status().json()
    assert cancelled["status"] == "cancelled" and len(cancelled["check_ins"]) == 1
    assert cancelled["result"] is None and not cancelled["can_finish"]
    assert client.post(f"{test_url}/cancel").raise_for_status().json() == cancelled

    another = client.post(url, json={"rank": proposed["rank"]}).raise_for_status().json()
    assert another["id"] != started["id"]
    branch_url, _ = url.rsplit("/", 1)
    client.post(f"{branch_url}/transition", json={"action": "dissolve"}).raise_for_status()
    assert all(item["status"] == "cancelled" for item in client.get(url).raise_for_status().json())
    assert client.post(url, json={"rank": proposed["rank"]}).status_code == 409
    assert client.get(f"{url}/protocol").raise_for_status().json()["proposals"] == []

    client.cookies.clear()
    assert client.get(url).status_code == 401
    client.post("/api/auth/register", json={
        "full_name": "Another User", "email": "history-other@example.test", "password": "TestingOnly123",
    }).raise_for_status()
    assert client.get(url).status_code == 404
    assert client.get(f"{url}/protocol").status_code == 404
    assert client.post(f"{test_url}/check-ins", json={
        "date": monday.isoformat(), "exposed": True, "outcome": False,
    }).status_code == 404


@pytest.mark.parametrize("title", ["I have chest pain and headaches", "Why can't I pee properly?"])
def test_workspace_test_declines_questions_that_need_local_guidance(workspace, title):
    client, _, _, _ = workspace
    detail = client.post("/api/branches", json={**PAYLOAD, "title": title}).raise_for_status().json()["detail"]
    assert detail["guidance"]
    url = f"/api/branches/{detail['id']}/tests"
    assert client.get(f"{url}/protocol").raise_for_status().json()["proposals"] == []
    assert client.post(url, json={"rank": 1}).status_code == 422


@pytest.mark.parametrize(("exposed_outcomes", "unexposed_outcomes", "direction"), [
    (1, 0, "supported"), (0, 1, "weakened"), (1, 1, "inconclusive"),
])
def test_workspace_result_uses_the_exact_locked_threshold(exposed_outcomes, unexposed_outcomes, direction):
    counts = workspace_tests.TestCounts(
        exposed_days=10, unexposed_days=10,
        exposed_outcomes=exposed_outcomes, unexposed_outcomes=unexposed_outcomes,
    )
    assert workspace_tests._compare(counts, 10).direction == direction
