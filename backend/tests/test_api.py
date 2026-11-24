from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)


def test_root():
    response = client.get("/")
    assert response.status_code == 200
    assert response.json()["status"] == "running"


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_graph_top_level_keys():
    # Full contract checks live in test_contracts.py.
    response = client.get("/api/graph")
    assert response.status_code == 200
    assert set(response.json()) == {"range", "trunk", "change_events", "branches", "knowledge"}


def test_unknown_branch_and_record_are_404():
    assert client.get("/api/branches/br_999").status_code == 404
    assert client.get("/api/records/sl_9999").status_code == 404
    assert client.post("/api/experiments/exp_999/lock").status_code == 404


def test_records_after_the_clock_are_hidden():
    # sl_0090 is 22 Nov; the demo clock starts on 20 Nov.
    assert client.get("/api/records/sl_0088").status_code == 200
    assert client.get("/api/records/sl_0090").status_code == 404


def test_advance_rejects_bad_days():
    assert client.post("/api/demo/advance", json={"days": 0}).status_code == 422
    assert client.post("/api/demo/advance", json={}).status_code == 422
