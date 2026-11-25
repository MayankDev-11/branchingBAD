import sqlite3

from fastapi.testclient import TestClient

from backend.integrations.app import app

DRAFT = {
    "title": "Morning walks",
    "branch_type": "habit",
    "start_date": "2026-11-18",
    "metrics": ["steps", "late_screen_min", "caffeine"],
    "hypotheses": ["A regular cue helps"],
    "created_via": "elevenlabs_voice",
    "voice_transcript": "Private transcript",
}


def test_branch_is_saved_visible_and_account_scoped(monkeypatch, tmp_path, fresh_store):
    path = tmp_path / "workspace.db"
    monkeypatch.setenv("ROOTTRACE_WORKSPACE_DB", str(path))
    with TestClient(app) as client:
        assert client.post("/api/branches", json=DRAFT).status_code == 401
        assert client.post("/api/auth/demo").status_code == 200
        result = client.post("/api/branches", json=DRAFT)
        assert result.status_code == 201, result.text
        branch, detail = result.json()["branch"], result.json()["detail"]
        branch_id = branch["id"]
        assert branch["branch_type"] == "habit"
        assert "confidence" not in detail["hypotheses"][0]
        assert detail["hypotheses"][0]["claims"] == []
        assert detail["experiment"] is None
        assert {item["metric"] for item in detail["evidence"]} == {"steps", "screen_late_min", "caffeine_pm"}
        assert all(client.get(f"/api/records/{item['id']}").status_code == 200 for item in detail["evidence"])
        assert client.get(f"/api/branches/{branch_id}").json() == detail
        assert branch in client.get("/api/graph").json()["branches"]
        assert branch in client.post("/api/demo/advance", json={"days": 1}).json()["branches"]
        assert branch in client.post("/api/demo/reset").json()["branches"]

        unsupported = client.post("/api/branches", json={**DRAFT, "metrics": ["unsupported"]})
        assert unsupported.status_code == 422

        client.cookies.clear()
        assert client.post("/api/auth/register", json={
            "full_name": "Second Account", "email": "second@example.test", "password": "TestPassword123",
        }).status_code == 201
        assert client.get(f"/api/branches/{branch_id}").status_code == 404
        assert branch not in client.get("/api/graph").json()["branches"]

        client.cookies.clear()
        assert client.post("/api/auth/demo").status_code == 200
        assert client.get(f"/api/branches/{branch_id}").json()["title"] == DRAFT["title"]

    with sqlite3.connect(path) as conn:
        payload = conn.execute("SELECT payload FROM workspace_branches WHERE id = ?", (branch_id,)).fetchone()[0]
    assert "Private transcript" not in payload


def test_workspace_scores_only_when_the_outcome_is_tracked(monkeypatch, tmp_path, fresh_store):
    monkeypatch.setenv("ROOTTRACE_WORKSPACE_DB", str(tmp_path / "workspace.db"))
    with TestClient(app) as client:
        assert client.post("/api/auth/demo").status_code == 200
        base = {**DRAFT, "branch_type": "investigation", "metrics": ["sleep_min"],
                "hypotheses": ["Prior-night sleep debt", "Low water intake", "Late-night screen"]}
        response = client.post("/api/branches", json={**base, "title": "Why do I crash after lunch?"})
        assert response.status_code == 201, response.text
        branch = response.json()["detail"]
        assert [factor["label"] for factor in branch["hypotheses"]] == ["Short sleep"]
        factor = branch["hypotheses"][0]
        assert "confidence" not in factor
        assert "Linked sleep averaged" in factor["claims"][0]["text"]
        assert "Afternoon energy is missing" in factor["test"]
        assert factor["claims"][0]["record_ids"]
        assert client.get(f"/api/branches/{branch['id']}").json() == branch

        response = client.post("/api/branches", json={
            **base, "title": "Does short sleep precede headaches?", "hypotheses": [], "outcome": "headache",
        })
        assert response.status_code == 201, response.text
        factors = response.json()["detail"]["hypotheses"]
        assert [factor["label"] for factor in factors] == ["Short sleep"]
        (factor,) = factors
        assert 0 < factor["confidence"] <= 100
        assert "headache days" in factor["claims"][0]["text"]
        assert all(client.get(f"/api/records/{record_id}").status_code == 200
                   for record_id in factor["claims"][0]["record_ids"])
