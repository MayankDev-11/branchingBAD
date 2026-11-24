import os
import tempfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


@pytest.fixture()
def client(monkeypatch, tmp_path: Path):
    db_file = tmp_path / "test_auth.db"
    monkeypatch.setenv("ROOTTRACE_AUTH_DB_PATH", str(db_file))
    monkeypatch.setenv("ENV", "development")

    from backend.auth.rate_limit import login_rate_limiter
    from backend.main import app

    login_rate_limiter.reset_all()
    with TestClient(app) as tc:
        yield tc


def test_unauthenticated_me_and_protected_graph_return_401(client: TestClient):
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/graph").status_code == 401


def test_register_logout_and_relogin_round_trip(client: TestClient):
    # 1. Register new user
    reg = client.post(
        "/api/auth/register",
        json={
            "full_name": "Satwik Kumar",
            "email": "Satwik@Example.com",
            "password": "Password123",
            "data_source": "Apple Health",
        },
    )
    assert reg.status_code == 201
    assert reg.headers.get("cache-control") == "no-store"
    assert reg.json()["user"]["email"] == "satwik@example.com"
    assert "httponly" in reg.headers.get("set-cookie", "").lower()

    # 2. Duplicate email returns 409
    dup = client.post(
        "/api/auth/register",
        json={"full_name": "Dup", "email": "satwik@example.com", "password": "Password123"},
    )
    assert dup.status_code == 409

    # 3. Protected endpoint works while authenticated
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/graph").status_code == 200

    # 4. Logout deletes session row & invalidates cookie
    out = client.post("/api/auth/logout")
    assert out.status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/graph").status_code == 401

    # 5. Wrong password returns 401 with generic message
    bad = client.post(
        "/api/auth/login",
        json={"email": "satwik@example.com", "password": "WrongPassword9"},
    )
    assert bad.status_code == 401
    assert bad.json()["detail"] == "Invalid email or password."

    # 6. Correct password signs back in cleanly
    good = client.post(
        "/api/auth/login",
        json={"email": "SATWIK@example.com", "password": "Password123"},
    )
    assert good.status_code == 200
    assert good.json()["user"]["email"] == "satwik@example.com"


def test_login_rate_limiting_blocks_after_5_failures(client: TestClient):
    for _ in range(5):
        r = client.post(
            "/api/auth/login",
            json={"email": "nobody@example.com", "password": "BadPassword1"},
        )
        assert r.status_code == 401
        assert r.json()["detail"] == "Invalid email or password."

    blocked = client.post(
        "/api/auth/login",
        json={"email": "nobody@example.com", "password": "BadPassword1"},
    )
    assert blocked.status_code == 429


def test_judge_demo_issues_real_session(client: TestClient):
    res = client.post("/api/auth/demo")
    assert res.status_code == 200
    body = res.json()["user"]
    assert body["email"] == "demo@roottrace.local"
    assert body["is_demo"] is True
    assert client.get("/api/auth/me").status_code == 200
    assert client.get("/api/graph").status_code == 200
