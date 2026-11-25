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
        assert detail["hypotheses"][0]["confidence"] == 0
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
