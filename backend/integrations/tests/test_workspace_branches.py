import json
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


def test_existing_afternoon_branch_gets_unscored_factors_without_gemini(monkeypatch, tmp_path, fresh_store):
    path = tmp_path / "workspace.db"
    monkeypatch.setenv("ROOTTRACE_WORKSPACE_DB", str(path))
    monkeypatch.setenv("ROOTTRACE_AI_PROVIDER", "bedrock")
    with TestClient(app) as client:
        user = client.post("/api/auth/demo").json()["user"]
        client.get("/api/graph").raise_for_status()
        payload = {
            **DRAFT, "title": "Why do I crash after lunch", "branch_type": "investigation",
            "metrics": [], "hypotheses": [], "outcome": "auto",
        }
        branch_id = "br_custom_existing_afternoon"
        with sqlite3.connect(path) as conn:
            conn.execute(
                "INSERT INTO workspace_branches (id, user_id, payload) VALUES (?, ?, ?)",
                (branch_id, user["id"], json.dumps(payload)),
            )
        detail = client.get(f"/api/branches/{branch_id}").json()
        assert [factor["label"] for factor in detail["hypotheses"]] == [
            "Short sleep", "Low water intake", "Low daytime activity",
        ]
        assert {item["metric"] for item in detail["evidence"]} == {"sleep_min", "water_ml", "steps"}
        for factor in detail["hypotheses"]:
            assert "confidence" not in factor
            assert "Log lunch time" in factor["test"]
            assert "Inconclusive" in factor["test"]
            assert all(client.get(f"/api/records/{record_id}").status_code == 200
                       for claim in factor["claims"] for record_id in claim["record_ids"])


def test_workspace_transitions_keep_history_without_fabricating_factors(monkeypatch, tmp_path, fresh_store):
    monkeypatch.setenv("ROOTTRACE_WORKSPACE_DB", str(tmp_path / "workspace.db"))
    with TestClient(app) as client:
        assert client.get("/api/branches/history").status_code == 401
        assert client.get("/api/knowledge").status_code == 401
        assert client.post("/api/auth/demo").status_code == 200
        payload = {**DRAFT, "branch_type": "investigation", "title": "hwuif", "metrics": ["sleep_min"],
                   "hypotheses": []}
        first = client.post("/api/branches", json=payload).json()["detail"]
        second = client.post("/api/branches", json={**payload, "title": "A question to review"}).json()["detail"]
        assert first["hypotheses"] == []
        assert first["evidence"]
        history = client.get("/api/branches/history").json()
        assert [entry["lifecycle"] for entry in history] == ["open", "open"]

        first_action = f"/api/branches/{first['id']}/transition"
        assert client.post(first_action, json={"action": "resolve"}).status_code == 422
        note = {"action": "resolve", "resolution": "Recorded for follow-up."}
        resolved = client.post(first_action, json=note)
        assert resolved.status_code == 200, resolved.text
        assert resolved.json()["detail"]["status"] == "concluded"
        item = next(item for item in resolved.json()["graph"]["knowledge"] if item["id"] == f"kn_{first['id']}")
        assert item["statement"] == note["resolution"]
        assert item["confidence"] == "user note"
        assert client.post(first_action, json=note).status_code == 200
        notes = client.get("/api/knowledge").json()
        assert len(notes) == 1
        assert notes[0]["id"] == first["id"] and notes[0]["note"] == note["resolution"]
        assert client.post(first_action, json={"action": "dissolve"}).status_code == 409

        dissolved = client.post(f"/api/branches/{second['id']}/transition", json={"action": "dissolve"}).json()
        assert second["id"] not in {branch["id"] for branch in dissolved["graph"]["branches"]}
        assert dissolved["history"] == client.get("/api/branches/history").json()
        assert [entry["lifecycle"] for entry in dissolved["history"]] == ["resolved", "dissolved"]
        assert client.get(f"/api/branches/{second['id']}").status_code == 200
        assert item in client.post("/api/demo/reset").json()["knowledge"]

        client.cookies.clear()
        assert client.post("/api/auth/register", json={
            "full_name": "Separate Account", "email": "separate@example.test", "password": "TestPassword123",
        }).status_code == 201
        assert client.get("/api/branches/history").json() == []
        assert client.get("/api/knowledge").json() == []
        assert client.post(first_action, json={"action": "dissolve"}).status_code == 404
        assert item not in client.get("/api/graph").json()["knowledge"]


def test_gemini_drafts_use_synthetic_evidence_and_keep_resolution_memory_local(monkeypatch, tmp_path, fresh_store):
    from unittest.mock import Mock

    import httpx

    from backend.ai import gemini

    monkeypatch.setenv("ROOTTRACE_WORKSPACE_DB", str(tmp_path / "workspace.db"))
    monkeypatch.setenv("ROOTTRACE_AI_PROVIDER", "gemini")
    monkeypatch.setenv("GEMINI_API_KEY", "mock-key")

    def reply(url, **kwargs):
        sent = json.loads(kwargs["content"])
        candidates = json.loads(sent["contents"][0]["parts"][0]["text"])["hypotheses"]
        choices = [{"rank": item["rank"], "approach": "compare_logs"} for item in candidates]
        return httpx.Response(200, request=httpx.Request("POST", url), json={
            "candidates": [{"finishReason": "STOP", "content": {"parts": [
                {"text": json.dumps({"drafts": choices})},
            ]}}],
        })

    post = Mock(side_effect=reply)
    monkeypatch.setattr(gemini.httpx, "post", post)
    with TestClient(app) as client:
        client.post("/api/auth/demo").raise_for_status()
        base = {**DRAFT, "branch_type": "investigation", "metrics": [], "hypotheses": []}
        old = client.post("/api/branches", json={**base, "title": "Old headache question"}).json()["detail"]
        client.post(f"/api/branches/{old['id']}/transition", json={
            "action": "resolve", "resolution": "Keep this private note locally.",
        }).raise_for_status()

        first = client.post("/api/branches", json={
            **base, "title": "Private title headaches 9876543210", "generate_drafts": True,
        })
        assert first.status_code == 201, first.text
        detail = first.json()["detail"]
        assert {item["label"] for item in detail["hypotheses"]} == {
            "Short sleep", "Low water intake", "Late screen time",
        }
        assert detail["experiment"] is None
        assert all("Would support" in item["test"] and "Would weaken" in item["test"]
                   for item in detail["hypotheses"])
        assert all(item["claims"] for item in detail["hypotheses"])
        assert detail["evidence"]
        context = client.get(f"/api/branches/{detail['id']}/drafts").json()
        assert context["related_resolutions"][0]["note"] == "Keep this private note locally."
        assert context["sent_to_ai"] == post.call_args.kwargs["content"].decode()
        for private in ("Private title", "9876543210", "Keep this private note", "mock-key", "source_file", "device"):
            assert private not in context["sent_to_ai"]
        assert client.get(f"/api/branches/{detail['id']}").json() == detail

        defaults = client.post("/api/branches", json={**base, "title": "Headaches"}).json()["detail"]
        assert len(defaults["hypotheses"]) == 3
        generated = client.post(f"/api/branches/{defaults['id']}/drafts")
        assert generated.status_code == 200, generated.text
        assert len(generated.json()["detail"]["hypotheses"]) == 3

        lunch = client.post("/api/branches", json={
            **base, "title": "Why do I crash after lunch? Private note", "generate_drafts": True,
        })
        assert lunch.status_code == 201, lunch.text
        detail = lunch.json()["detail"]
        assert len(detail["hypotheses"]) == 3
        assert all("confidence" not in item and "Log lunch time" in item["test"]
                   for item in detail["hypotheses"])
        context = client.get(f"/api/branches/{detail['id']}/drafts").json()
        assert context["can_generate"]
        assert "no lunch records or afternoon energy ratings" in context["sent_to_ai"]
        assert "Private note" not in context["sent_to_ai"]
        assert client.get(f"/api/branches/{detail['id']}").json() == detail
        assert client.post(f"/api/branches/{detail['id']}/drafts").status_code == 200

        for title in ("Plain title", "Why does my app crash?", "Chest pain and headaches",
                      "Chest pain and feeling tired after lunch"):
            untouched = client.post("/api/branches", json={**base, "title": title, "generate_drafts": True})
            assert untouched.json()["detail"]["hypotheses"] == []
        combined = client.post("/api/branches", json={
            **base, "title": "Can less walking affect my mood?", "generate_drafts": True,
        }).json()["detail"]
        assert combined["hypotheses"][0]["label"] == "Low daytime activity"
        assert all("confidence" not in item and "mood rating" in item["test"]
                   for item in combined["hypotheses"])
        urinary = client.post("/api/branches", json={
            **base, "title": "Why cant i piss properly?", "outcome": "headache",
            "metrics": ["water_ml"], "generate_drafts": True,
        }).json()["detail"]
        assert urinary["evidence"] == []
        assert urinary["hypotheses"] == []
        assert "emergency care" in urinary["guidance"]["message"]
        assert client.get(f"/api/branches/{urinary['id']}").json() == urinary
        assert not client.get(f"/api/branches/{urinary['id']}/drafts").json()["can_generate"]
        ask = client.post("/api/ask", json={"branch_id": urinary["id"], "question": "Why cant i piss properly?"}).json()
        assert ask["hypotheses"][0]["test"] == urinary["guidance"]["message"]
        assert not ask["sent_to_ai"]
        urgent = client.post("/api/ask", json={"branch_id": None, "question": "Why can't I pee at all?"}).json()
        assert urgent["red_flag"] and not urgent["sent_to_ai"]
        mood = client.post("/api/ask", json={"branch_id": None, "question": "Can less walking affect my mood?"}).json()
        assert mood["hypotheses"][0]["text"] == "Low daytime activity" and not mood["sent_to_ai"]
        assert post.call_count == 5
        only_outcome = client.post("/api/branches", json={
            **base, "title": "Headaches", "metrics": ["headache"], "generate_drafts": True,
        })
        assert only_outcome.status_code == 201, only_outcome.text
        assert len(only_outcome.json()["detail"]["hypotheses"]) == 3
        assert post.call_count == 6
