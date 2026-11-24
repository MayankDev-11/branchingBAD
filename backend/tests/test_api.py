
from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_graph():
    # Full contract checks live in test_graph_contract.py.
    response = client.get("/api/graph")
    assert response.status_code == 200

    data = response.json()

    assert set(data) == {"range", "trunk", "change_events", "branches", "knowledge"}


def test_observations():
    response = client.get("/api/observations")
    assert response.status_code == 200
    assert response.json()["count"] == 28


def test_single_observation():
    response = client.get("/api/observations/obs_sleep_1")
    assert response.status_code == 200
    assert response.json()["metric"] == "sleep_duration"


def test_invalid_observation():
    response = client.get("/api/observations/invalid_id")
    assert response.status_code == 404


def test_branches():
    response = client.get("/api/branches")
    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_single_branch():
    response = client.get("/api/branches/branch_001")
    assert response.status_code == 200


def test_experiments():
    response = client.get("/api/experiments")
    assert response.status_code == 200
    assert response.json()["count"] == 1


def test_evidence_provenance():
    response = client.get(
        "/api/evidence/evidence_001/provenance"
    )

    assert response.status_code == 200

    data = response.json()
    assert data["evidence"]["id"] == "evidence_001"
    assert data["source_observation"]["id"] == "obs_sleep_14"


def test_invalid_evidence():
    response = client.get(
        "/api/evidence/invalid_id/provenance"
    )

    assert response.status_code == 404
