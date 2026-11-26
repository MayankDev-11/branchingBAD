"""Fitbit / Pixel Watch through the Google Health API, against a fake Google (no network)."""

import json
import sqlite3
from datetime import date
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.integrations import google_health as gh
from backend.main import app

TODAY = date(2026, 11, 26)


class FakeGoogle:
    """Answers the OAuth and Google Health endpoints the module calls, and records each call."""

    def __init__(self):
        self.calls = []
        self.linked = True
        self.scope = f"{gh.SCOPE_SLEEP} {gh.SCOPE_ACTIVITY}"
        self.refresh_ok = True
        self.fail_first_sleep = False

    def __call__(self, method, url, **kw):
        self.calls.append((method, url, kw))
        req = httpx.Request(method, url)
        if url == gh.TOKEN_URL:
            data = kw["data"]
            if data["grant_type"] == "refresh_token" and not self.refresh_ok:
                return httpx.Response(400, json={"error": "invalid_grant"}, request=req)
            return httpx.Response(200, json={
                "access_token": f"access-{len(self.calls)}", "expires_in": 3599, "scope": self.scope,
                "token_type": "Bearer", **({"refresh_token": "refresh-SECRET"} if data["grant_type"] == "authorization_code" else {}),
            }, request=req)
        if url == gh.REVOKE_URL:
            return httpx.Response(200, request=req)
        if url.endswith("/identity"):
            if not self.linked:
                return httpx.Response(400, json={"error": {"status": "FAILED_PRECONDITION",
                                                           "details": [{"reason": "ACCOUNT_NOT_LINKED"}]}}, request=req)
            return httpx.Response(200, json={"name": "users/me/identity", "healthUserId": "111"}, request=req)
        if url.endswith("/dataTypes/sleep/dataPoints:reconcile"):
            if self.fail_first_sleep:
                self.fail_first_sleep = False
                return httpx.Response(503, json={"error": {"status": "UNAVAILABLE"}}, request=req)
            if "pageToken" not in kw["params"]:
                return httpx.Response(200, json={"dataPoints": [
                    night("2026-11-24", "2026-11-23T17:40:00Z", "2026-11-24T01:10:00Z", "418"),
                    night("2026-11-24", "2026-11-24T08:00:00Z", "2026-11-24T08:40:00Z", "38", nap=True),
                ], "nextPageToken": "p2"}, request=req)
            return httpx.Response(200, json={"dataPoints": [
                night("2026-11-25", "2026-11-24T18:30:00Z", "2026-11-25T00:15:00Z", "330", main=True),
                night("2026-11-25", "2026-11-24T18:00:00Z", "2026-11-24T19:00:00Z", "55", main=False),
                night("2026-11-23", "2026-11-22T17:00:00Z", "2026-11-23T05:00:00Z", None),
            ], "nextPageToken": ""}, request=req)
        if url.endswith("/dataTypes/steps/dataPoints:dailyRollUp"):
            return httpx.Response(200, json={"rollupDataPoints": [
                {"civilStartTime": civil("2026-11-25"), "steps": {"countSum": "8430"}},
                {"civilStartTime": civil("2026-11-24"), "steps": {"countSum": "250000"}},
                {"civilStartTime": civil("2026-11-23")},  # watch not worn: no value
            ]}, request=req)
        return httpx.Response(404, request=req)


def civil(day):
    y, m, d = map(int, day.split("-"))
    return {"date": {"year": y, "month": m, "day": d}, "time": {}}


def night(wake, start, end, minutes, nap=False, main=None):
    meta = {"nap": nap, **({"mainSleep": main} if main is not None else {})}
    point = {"dataPointName": f"users/me/dataTypes/sleep/dataPoints/{start}", "sleep": {
        "interval": {"startTime": start, "endTime": end, "startUtcOffset": "19800s", "endUtcOffset": "19800s",
                     "civilEndTime": civil(wake)},
        "metadata": meta, "type": "STAGES"}}
    if minutes is not None:
        point["sleep"]["summary"] = {"minutesAsleep": minutes}
    return point


@pytest.fixture
def google(monkeypatch, tmp_path):
    fake = FakeGoogle()
    monkeypatch.setattr(gh.httpx, "request", fake)
    monkeypatch.setattr(gh, "_sleep", lambda s: None)
    monkeypatch.setenv("GOOGLE_HEALTH_CLIENT_ID", "client-123.apps.googleusercontent.com")
    monkeypatch.setenv("GOOGLE_HEALTH_CLIENT_SECRET", "shh")
    monkeypatch.setenv("ROOTTRACE_CONNECTIONS_DB", str(tmp_path / "links.db"))
    monkeypatch.setenv("ROOTTRACE_GOOGLE_HEALTH_DIR", str(tmp_path / "gh"))
    real_sync = gh.sync
    monkeypatch.setattr(gh, "sync", lambda user_id, today=None: real_sync(user_id, today or TODAY))
    return fake


def signed_in_client(email="fitbit.owner@example.test"):
    client = TestClient(app)
    r = client.post("/api/auth/register", json={"full_name": "Fit Owner", "email": email,
                                                "password": "Correct-Horse-9!x", "data_source": "demo"})
    assert r.status_code == 201, r.text
    return client, r.json()["user"]["id"]


def connect(client, google):
    start = client.get("/api/connect/google/start").json()["url"]
    q = parse_qs(urlparse(start).query)
    r = client.get("/api/connect/google/callback", params={"state": q["state"][0], "code": "auth-code"},
                   follow_redirects=False)
    return q, r


def test_not_set_up_says_what_to_add(monkeypatch):
    monkeypatch.setenv("GOOGLE_HEALTH_CLIENT_ID", "")
    monkeypatch.setenv("GOOGLE_HEALTH_CLIENT_SECRET", "")
    monkeypatch.setattr(gh, "load_dotenv", lambda *a, **k: None)
    client, _ = signed_in_client("nosetup@example.test")
    assert client.get("/api/connect/google/status").json()["configured"] is False
    r = client.get("/api/connect/google/start")
    assert r.status_code == 503 and r.json()["detail"]["reason"] == "not_configured"


def test_routes_need_sign_in():
    anon = TestClient(app)
    assert anon.get("/api/connect/google/status").status_code == 401
    assert anon.post("/api/connect/google/sync").status_code == 401
    r = anon.get("/api/connect/google/callback", params={"state": "x", "code": "y"}, follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"].endswith("result=signed_out")


def test_consent_url_asks_read_only_sleep_and_activity_with_pkce(google):
    client, _ = signed_in_client("url@example.test")
    url = client.get("/api/connect/google/start").json()["url"]
    assert url.startswith(gh.AUTH_URL)
    q = parse_qs(urlparse(url).query)
    assert set(q["scope"][0].split()) == {gh.SCOPE_SLEEP, gh.SCOPE_ACTIVITY}
    assert q["access_type"] == ["offline"] and q["response_type"] == ["code"]
    assert q["code_challenge_method"] == ["S256"] and len(q["state"][0]) > 30
    assert q["redirect_uri"] == ["http://localhost:5173/api/connect/google/callback"]


def test_full_connect_imports_sleep_and_steps_into_own_database(google):
    client, user_id = signed_in_client("full@example.test")
    _, r = connect(client, google)
    assert r.status_code == 303 and r.headers["location"] == "/dashboard?connect=google&result=connected"

    token_call = next(c for c in google.calls if c[1] == gh.TOKEN_URL)
    assert token_call[2]["data"]["code_verifier"]  # PKCE verifier sent with the code

    status = client.get("/api/connect/google/status").json()
    assert status["connected"] and status["configured"]
    s = status["last_sync"]
    assert s["range"] == {"start": "2026-08-28", "end": "2026-11-25"}
    assert s["nights"] == 3                  # 23, 24 (nap ignored), 25 (main sleep kept)
    assert s["step_days"] == 1               # 8430 kept; 250000 excluded; unworn day skipped
    assert s["excluded"] == 1 and s["avg_steps"] == 8430

    db = sqlite3.connect(gh.import_db_path(user_id))
    rows = {(m, d): v for m, d, v in db.execute("SELECT metric, date, value FROM observations WHERE is_excluded = 0")}
    assert rows[("sleep_min", "2026-11-24")] == 418          # nap on the 24th not counted
    assert rows[("sleep_min", "2026-11-25")] == 330          # mainSleep beats the longer-looking short session
    assert rows[("sleep_min", "2026-11-23")] == 720          # no summary: end - start
    assert rows[("lights_out", "2026-11-24")] == 670         # 23:10 IST = 11 h 10 min after noon
    assert ("steps", "2026-11-23") not in rows
    reason = db.execute("SELECT exclusion_reason FROM observations WHERE metric='steps' AND value=250000").fetchone()[0]
    assert "plausible" in reason
    assert db.execute("SELECT COUNT(*) FROM source_records WHERE source_file = 'google_health_api'").fetchone()[0] == 8  # 3 nights x 2 + 2 step days

    # Each night's record IDs show in the 7-day table.
    last = s["recent"][-1]
    assert last["date"] == "2026-11-25" and last["sleep_min"] == 330 and last["sleep_id"].startswith("sl_")


def test_tokens_are_encrypted_at_rest(google, tmp_path):
    client, _ = signed_in_client("enc@example.test")
    connect(client, google)
    raw = (tmp_path / "links.db").read_bytes()
    assert b"refresh-SECRET" not in raw and b"access-" not in raw


def test_sync_again_adds_nothing_and_never_edits(google):
    client, user_id = signed_in_client("resync@example.test")
    connect(client, google)
    r = client.post("/api/connect/google/sync")
    assert r.status_code == 200
    assert r.json()["new_observations"] == {} and r.json()["already_present"] == 8


def test_busy_google_is_retried(google):
    google.fail_first_sleep = True
    client, _ = signed_in_client("retry@example.test")
    _, r = connect(client, google)
    assert r.headers["location"].endswith("result=connected")


def test_account_not_linked_to_google_health(google):
    google.linked = False
    client, _ = signed_in_client("unlinked@example.test")
    _, r = connect(client, google)
    assert r.headers["location"].endswith("result=not_linked")
    assert client.get("/api/connect/google/status").json()["connected"] is False


def test_state_is_one_time_and_tied_to_the_user(google):
    client, _ = signed_in_client("state1@example.test")
    q, r = connect(client, google)
    assert r.headers["location"].endswith("result=connected")
    again = client.get("/api/connect/google/callback", params={"state": q["state"][0], "code": "x"},
                       follow_redirects=False)
    assert again.headers["location"].endswith("result=bad_state")

    other, _ = signed_in_client("state2@example.test")
    url = other.get("/api/connect/google/start").json()["url"]
    stolen = parse_qs(urlparse(url).query)["state"][0]
    r = client.get("/api/connect/google/callback", params={"state": stolen, "code": "x"}, follow_redirects=False)
    assert r.headers["location"].endswith("result=bad_state")


def test_denied_consent_and_missing_scopes(google):
    client, _ = signed_in_client("deny@example.test")
    r = client.get("/api/connect/google/callback", params={"error": "access_denied"}, follow_redirects=False)
    assert r.headers["location"].endswith("result=denied")
    google.scope = "openid"
    _, r = connect(client, google)
    assert r.headers["location"].endswith("result=no_scopes")


def test_only_sleep_allowed_still_works(google):
    google.scope = gh.SCOPE_SLEEP
    client, _ = signed_in_client("partial@example.test")
    _, r = connect(client, google)
    assert r.headers["location"].endswith("result=connected")
    s = client.get("/api/connect/google/status").json()["last_sync"]
    assert s["nights"] == 3 and s["step_days"] == 0 and s["missing_scopes"] == ["activity_and_fitness"]
    assert not any("dailyRollUp" in c[1] for c in google.calls)


def _expire_access_token(user_id):
    # Mark Google's access token as expired (moving the real clock would also expire the test login cookie).
    with sqlite3.connect(gh.os.environ["ROOTTRACE_CONNECTIONS_DB"]) as db:
        db.execute("UPDATE google_health_links SET access_expires_at = 0 WHERE user_id = ?", (user_id,))


def test_expired_access_token_is_refreshed_and_revoked_refresh_asks_to_reconnect(google):
    client, user_id = signed_in_client("refresh@example.test")
    connect(client, google)
    _expire_access_token(user_id)
    assert client.post("/api/connect/google/sync").status_code == 200
    assert any(c[1] == gh.TOKEN_URL and c[2]["data"]["grant_type"] == "refresh_token" for c in google.calls)

    google.refresh_ok = False
    _expire_access_token(user_id)
    r = client.post("/api/connect/google/sync")
    assert r.status_code == 401 and r.json()["detail"]["reason"] == "expired"
    assert client.get("/api/connect/google/status").json()["needs_reconnect"] is True


def test_disconnect_revokes_and_can_delete_the_data(google):
    client, user_id = signed_in_client("bye@example.test")
    connect(client, google)
    path = gh.import_db_path(user_id)
    assert path.exists()
    r = client.post("/api/connect/google/disconnect", json={"delete_data": True})
    assert r.json() == {"connected": False, "data_deleted": True}
    assert any(c[1] == gh.REVOKE_URL for c in google.calls)
    assert not path.exists()
    assert client.get("/api/connect/google/status").json()["connected"] is False


def test_demo_database_is_untouched(google):
    demo = TestClient(app)
    demo.post("/api/auth/demo")
    before = demo.get("/api/insights").json()["coverage"]["total_observations"]
    client, _ = signed_in_client("isolation@example.test")
    connect(client, google)
    assert demo.get("/api/insights").json()["coverage"]["total_observations"] == before
