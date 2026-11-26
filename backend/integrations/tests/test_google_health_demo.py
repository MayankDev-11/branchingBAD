"""Judge Demo: Connect goes to a SIMULATED Google; every other account keeps the real one."""

from datetime import date
from html import unescape
import re
from urllib.parse import urlparse

import pytest
from fastapi.testclient import TestClient

from backend.integrations import google_health as gh
from backend.integrations import google_health_sim as sim
from backend.main import app

TODAY = date(2026, 11, 26)


@pytest.fixture
def no_keys(monkeypatch, tmp_path):
    """No Google keys, no network: any real request to Google fails the test."""
    monkeypatch.setenv("GOOGLE_HEALTH_CLIENT_ID", "")
    monkeypatch.setenv("GOOGLE_HEALTH_CLIENT_SECRET", "")
    monkeypatch.setattr(gh, "load_dotenv", lambda *a, **k: None)
    monkeypatch.setenv("ROOTTRACE_CONNECTIONS_DB", str(tmp_path / "links.db"))
    monkeypatch.setenv("ROOTTRACE_GOOGLE_HEALTH_DIR", str(tmp_path / "gh"))

    def no_network(*a, **k):
        raise AssertionError("the simulated flow must never call the real Google")

    monkeypatch.setattr(gh.httpx, "request", no_network)
    real_sync = gh.sync
    monkeypatch.setattr(gh, "sync", lambda user_id, today=None: real_sync(user_id, today or TODAY))


def demo_client():
    client = TestClient(app)
    assert client.post("/api/auth/demo").status_code == 200
    return client


def allow_link(page: str) -> str:
    return unescape(re.search(r'id="allow" href="([^"]+)"', page).group(1))


def demo_connect(client):
    url = client.get("/api/connect/google/start").json()["url"]
    page = client.get(url)
    return url, page, client.get(allow_link(page.text), follow_redirects=False)


def test_judge_demo_connects_to_simulated_google_without_keys(no_keys):
    client = demo_client()
    status = client.get("/api/connect/google/status").json()
    assert status["configured"] is True and status["simulated"] is True and status["connected"] is False

    url, page, back = demo_connect(client)
    assert url.startswith(gh.SIMULATED_AUTH_URL)
    assert page.status_code == 200 and "SIMULATED" in page.text and "NOT REAL GOOGLE" in page.text
    assert urlparse(allow_link(page.text)).path == "/api/connect/google/callback"  # never leaves the app
    assert back.status_code == 303 and back.headers["location"].endswith("result=connected")

    s = client.get("/api/connect/google/status").json()
    assert s["connected"] is True and s["simulated"] is True
    last = s["last_sync"]
    assert last["range"] == {"start": "2026-08-28", "end": "2026-11-25"}
    assert 80 <= last["nights"] < 90 and 80 <= last["step_days"] < 90  # a few unworn days, naps left out
    # The made-up data follows the demo story: sleep drops from about 3 Nov and detection finds it.
    sleep_events = [e for e in last["change_events"] if e["label"].lower().startswith("sleep")]
    assert sleep_events and date(2026, 10, 31) <= date.fromisoformat(sleep_events[0]["date"]) <= date(2026, 11, 7)

    again = client.post("/api/connect/google/sync").json()
    assert sum(again["new_observations"].values()) == 0 and again["already_present"] > 0

    out = client.post("/api/connect/google/disconnect", json={"delete_data": True}).json()
    assert out == {"connected": False, "data_deleted": True}
    assert client.get("/api/connect/google/status").json()["connected"] is False


def test_judge_demo_cancel_connects_nothing(no_keys):
    client = demo_client()
    url = client.get("/api/connect/google/start").json()["url"]
    cancel = unescape(re.search(r'id="cancel" href="([^"]+)"', client.get(url).text).group(1))
    back = client.get(cancel, follow_redirects=False)
    assert back.headers["location"].endswith("result=denied")
    assert client.get("/api/connect/google/status").json()["connected"] is False


def test_real_accounts_never_get_the_simulation(no_keys):
    client = TestClient(app)
    r = client.post("/api/auth/register", json={"full_name": "Real Person", "email": "real.person@example.test",
                                                "password": "Correct-Horse-9!x", "data_source": "demo"})
    assert r.status_code == 201, r.text
    status = client.get("/api/connect/google/status").json()
    assert status["simulated"] is False and status["configured"] is False
    assert client.get("/api/connect/google/start").json()["detail"]["reason"] == "not_configured"
    assert client.get("/api/connect/google/simulated-consent", params={"state": "x"}).status_code == 404
    # Even with the simulated code, the callback for a real account goes to the real flow (and fails).
    back = client.get("/api/connect/google/callback", params={"state": "x", "code": sim.SIM_CODE},
                      follow_redirects=False)
    assert back.headers["location"].endswith("result=bad_state")


def test_simulated_google_pages_sleep_like_google():
    first, last = date(2026, 8, 28), date(2026, 11, 25)
    with gh.simulated():
        nights = gh.fetch_sleep("token", first, last)
        steps = gh.fetch_steps("token", first, last)
    assert all(first <= n["date"] <= last and n["main"] for n in nights)  # naps dropped, one night a day
    assert len({n["date"] for n in nights}) == len(nights)
    assert set(steps) == {n["date"] for n in nights}  # the same days are unworn for both
    before = [n["minutes"] for n in nights if n["date"] < sim.DROP_DATE]
    after = [n["minutes"] for n in nights if n["date"] >= sim.DROP_DATE]
    assert 35 <= sum(before) / len(before) - sum(after) / len(after) <= 60
