"""Connect a Fitbit or Pixel Watch through the Google Health API and import its sleep and steps.

The legacy Fitbit Web API was turned off on 2 Nov 2026; Fitbit data now comes only from the
Google Health API (https://health.googleapis.com/v4) with Google OAuth 2.0.

Flow
1. `start_url` makes a one-time `state` (+ PKCE verifier) and returns Google's consent URL.
2. Google redirects to /api/connect/google/callback; `finish` checks the state, swaps the code
   for tokens, calls users/me/identity (fails if the Google account is not linked to Google
   Health), stores the tokens ENCRYPTED, then runs a first `sync`.
3. `sync` downloads the last 90 complete days: sleep from dataPoints:reconcile (one main sleep
   per night) and steps from dataPoints:dailyRollUp, and imports them as observations in this
   user's own SQLite file, never the demo database. Like the Apple Health importer: raw values
   are kept in source_records, an existing (metric, day) is never edited (rule 5), and an
   implausible value is kept but excluded with a reason. Change detection then runs on it.

Settings (.env): GOOGLE_HEALTH_CLIENT_ID, GOOGLE_HEALTH_CLIENT_SECRET, optional
GOOGLE_HEALTH_REDIRECT_URI (default http://localhost:5173/api/connect/google/callback, which the
Vite dev server proxies to the backend so the sign-in cookie comes along).
"""

import base64
import hashlib
import json
import os
import secrets
import sqlite3
import time as clock
from contextlib import closing
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.parse import urlencode

import httpx
from cryptography.fernet import Fernet, InvalidToken
from dotenv import load_dotenv

from backend.analysis.series import iso
from backend.data.db import connect, dumps, init_schema, loads
from backend.data.import_apple_health import IST, PLAUSIBLE, _next_numbers, clean_source_name
from backend.data.metrics import METRICS

# Google's real endpoints. The GOOGLE_HEALTH_*_URL overrides exist only for local testing against a
# stand-in server (e.g. a recorded walkthrough without a real Google account); leave them unset.
AUTH_URL = os.environ.get("GOOGLE_HEALTH_AUTH_URL") or "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = os.environ.get("GOOGLE_HEALTH_TOKEN_URL") or "https://oauth2.googleapis.com/token"
REVOKE_URL = os.environ.get("GOOGLE_HEALTH_REVOKE_URL") or "https://oauth2.googleapis.com/revoke"
API = os.environ.get("GOOGLE_HEALTH_API_URL") or "https://health.googleapis.com/v4/users/me"
SCOPE_SLEEP = "https://www.googleapis.com/auth/googlehealth.sleep.readonly"
SCOPE_ACTIVITY = "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly"
SCOPES = (SCOPE_SLEEP, SCOPE_ACTIVITY)
DEFAULT_REDIRECT = "http://localhost:5173/api/connect/google/callback"

SYNC_DAYS = 90            # one dailyRollUp request covers at most 90 days
STATE_TTL_SECONDS = 600   # a sign-in must finish within 10 minutes
SOURCE_FILE = "google_health_api"
DEFAULT_DEVICE = "Fitbit / Pixel (Google Health)"
RETRY_STATUS = {429, 500, 502, 503, 504}
RETRY_DELAYS = (1.0, 2.0)
_sleep = clock.sleep  # replaced in tests

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LINKS_DB = ROOT / "data" / "roottrace_connections.db"
DEFAULT_KEY_FILE = ROOT / "data" / "secrets" / "token.key"
DEFAULT_IMPORT_DIR = ROOT / "backend" / "data"

NORMALIZATION = {
    "sleep_min": "Google Health sleep (reconcile, main sleep of the night) -> summary.minutesAsleep",
    "lights_out": "Google Health main sleep interval start -> minutes after 12:00",
    "steps": "Google Health steps dailyRollUp -> countSum for the civil day",
}

LINK_SCHEMA = """
CREATE TABLE IF NOT EXISTS oauth_states (
    state       TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    verifier    TEXT NOT NULL,
    created_at  REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS google_health_links (
    user_id           TEXT PRIMARY KEY,
    health_user_id    TEXT,
    scopes            TEXT NOT NULL,
    refresh_token     TEXT,            -- Fernet-encrypted
    access_token      TEXT,            -- Fernet-encrypted
    access_expires_at REAL NOT NULL DEFAULT 0,
    linked_at         TEXT NOT NULL,
    last_sync_at      TEXT,
    last_sync         TEXT             -- JSON summary of the last sync
);
"""


class ConnectError(RuntimeError):
    """A failure the user can act on. `reason` is a short code the frontend maps to a message."""

    def __init__(self, reason: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.reason = reason
        self.message = message
        self.status_code = status_code


# ---------------------------------------------------------------------------------------------
# Settings, storage and encryption
# ---------------------------------------------------------------------------------------------

def _settings() -> dict:
    load_dotenv()
    return {
        "client_id": os.environ.get("GOOGLE_HEALTH_CLIENT_ID", "").strip(),
        "client_secret": os.environ.get("GOOGLE_HEALTH_CLIENT_SECRET", "").strip(),
        "redirect_uri": os.environ.get("GOOGLE_HEALTH_REDIRECT_URI", "").strip() or DEFAULT_REDIRECT,
    }


def configured() -> bool:
    s = _settings()
    return bool(s["client_id"] and s["client_secret"])


def _links_db() -> sqlite3.Connection:
    path = Path(os.environ.get("ROOTTRACE_CONNECTIONS_DB", DEFAULT_LINKS_DB))
    path.parent.mkdir(parents=True, exist_ok=True)
    conn = connect(path)
    conn.executescript(LINK_SCHEMA)
    return conn


def import_db_path(user_id: str) -> Path:
    """Each account gets its own file, so one person's Fitbit data never mixes with another's."""
    folder = Path(os.environ.get("ROOTTRACE_GOOGLE_HEALTH_DIR", DEFAULT_IMPORT_DIR))
    folder.mkdir(parents=True, exist_ok=True)
    safe = "".join(c for c in user_id if c.isalnum() or c in "-_")[:64] or "user"
    return folder / f"google_health_{safe}.db"


def _fernet() -> Fernet:
    """Key from ROOTTRACE_TOKEN_KEY, else a key file created once under data/secrets/ (git-ignored)."""
    load_dotenv()
    key = os.environ.get("ROOTTRACE_TOKEN_KEY", "").strip()
    if not key:
        path = Path(os.environ.get("ROOTTRACE_TOKEN_KEY_FILE", DEFAULT_KEY_FILE))
        if path.exists():
            key = path.read_text(encoding="utf-8").strip()
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            key = Fernet.generate_key().decode()
            path.write_text(key, encoding="utf-8")
            try:
                path.chmod(0o600)
            except OSError:
                pass
    return Fernet(key.encode())


def _seal(value: str | None) -> str | None:
    return _fernet().encrypt(value.encode()).decode() if value else None


def _open(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return _fernet().decrypt(value.encode()).decode()
    except InvalidToken:
        return None  # key changed: treat as signed out


# ---------------------------------------------------------------------------------------------
# HTTP with polite retries (Google asks for backoff on 429 / 503 / 504)
# ---------------------------------------------------------------------------------------------

def _request(method: str, url: str, **kwargs) -> httpx.Response:
    kwargs.setdefault("timeout", httpx.Timeout(30, connect=5))
    kwargs.setdefault("follow_redirects", False)
    for attempt in range(len(RETRY_DELAYS) + 1):
        try:
            response = httpx.request(method, url, **kwargs)
        except (httpx.TimeoutException, httpx.NetworkError):
            if attempt == len(RETRY_DELAYS):
                raise ConnectError("unreachable", "Could not reach Google. Check the internet and try again.", 502)
        else:
            if response.status_code not in RETRY_STATUS or attempt == len(RETRY_DELAYS):
                return response
        _sleep(RETRY_DELAYS[attempt])
    raise AssertionError("unreachable")


def _error_reason(response: httpx.Response) -> str:
    try:
        body = response.json()
    except ValueError:
        return ""
    error = body.get("error")
    if isinstance(error, dict):
        for detail in error.get("details", []) or []:
            if detail.get("reason"):
                return str(detail["reason"])
        return str(error.get("status", ""))
    return str(error or "")


# ---------------------------------------------------------------------------------------------
# OAuth
# ---------------------------------------------------------------------------------------------

def start_url(user_id: str) -> str:
    if not configured():
        raise ConnectError(
            "not_configured",
            "Google Health isn't set up yet: add GOOGLE_HEALTH_CLIENT_ID and GOOGLE_HEALTH_CLIENT_SECRET to .env.",
            503,
        )
    s = _settings()
    state = secrets.token_urlsafe(32)
    verifier = secrets.token_urlsafe(64)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
    with closing(_links_db()) as conn, conn:
        conn.execute("DELETE FROM oauth_states WHERE created_at < ?", (clock.time() - STATE_TTL_SECONDS,))
        conn.execute("INSERT INTO oauth_states VALUES (?, ?, ?, ?)", (state, user_id, verifier, clock.time()))
    return AUTH_URL + "?" + urlencode({
        "client_id": s["client_id"],
        "redirect_uri": s["redirect_uri"],
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "access_type": "offline",          # ask for a refresh token
        "prompt": "consent",               # so a re-connect gets a new refresh token too
        "include_granted_scopes": "true",
        "state": state,
        "code_challenge": challenge,
        "code_challenge_method": "S256",
    })


def finish(user_id: str, state: str, code: str) -> dict:
    """Handle Google's redirect: verify state, exchange the code, check identity, first sync."""
    with closing(_links_db()) as conn, conn:
        row = conn.execute("SELECT * FROM oauth_states WHERE state = ?", (state,)).fetchone()
        conn.execute("DELETE FROM oauth_states WHERE state = ?", (state,))
    if row is None or row["user_id"] != user_id or clock.time() - row["created_at"] > STATE_TTL_SECONDS:
        raise ConnectError("bad_state", "That sign-in link expired or wasn't started here. Press Connect again.")

    s = _settings()
    response = _request("POST", TOKEN_URL, data={
        "code": code,
        "client_id": s["client_id"],
        "client_secret": s["client_secret"],
        "redirect_uri": s["redirect_uri"],
        "grant_type": "authorization_code",
        "code_verifier": row["verifier"],
    })
    if response.status_code != 200:
        raise ConnectError("token_exchange", "Google didn't accept the sign-in. Press Connect to try again.", 502)
    tokens = response.json()
    granted = set((tokens.get("scope") or "").split())
    if not granted & set(SCOPES):
        raise ConnectError(
            "no_scopes", "Google Health access wasn't allowed. Press Connect and tick sleep and activity.", 400,
        )

    identity = _request("GET", f"{API}/identity", headers=_auth(tokens["access_token"]))
    if identity.status_code == 400 and _error_reason(identity) == "ACCOUNT_NOT_LINKED":
        raise ConnectError(
            "not_linked",
            "This Google account isn't linked to Google Health yet. Open the Google Health (Fitbit) app, "
            "sign in with this Google account, then press Connect again.",
        )
    if identity.status_code != 200:
        raise ConnectError("identity", "Google Health didn't confirm the account. Try again in a minute.", 502)

    with closing(_links_db()) as conn, conn:
        old = conn.execute("SELECT refresh_token FROM google_health_links WHERE user_id = ?", (user_id,)).fetchone()
        refresh = tokens.get("refresh_token") or (old and _open(old["refresh_token"]))
        conn.execute(
            "INSERT OR REPLACE INTO google_health_links"
            " (user_id, health_user_id, scopes, refresh_token, access_token, access_expires_at, linked_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?)",
            (user_id, identity.json().get("healthUserId"), " ".join(sorted(granted)), _seal(refresh),
             _seal(tokens["access_token"]), clock.time() + int(tokens.get("expires_in", 3600)), _now_iso()),
        )
    return sync(user_id)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": "application/json"}


def _access_token(user_id: str) -> tuple[str, set[str]]:
    with closing(_links_db()) as conn:
        link = conn.execute("SELECT * FROM google_health_links WHERE user_id = ?", (user_id,)).fetchone()
    if link is None:
        raise ConnectError("not_connected", "Google Health isn't connected for this account.", 409)
    scopes = set(link["scopes"].split())
    token = _open(link["access_token"])
    if token and link["access_expires_at"] > clock.time() + 60:
        return token, scopes

    refresh = _open(link["refresh_token"])
    if not refresh:
        raise ConnectError("expired", "The Google sign-in expired. Press Connect again.", 401)
    s = _settings()
    response = _request("POST", TOKEN_URL, data={
        "client_id": s["client_id"], "client_secret": s["client_secret"],
        "refresh_token": refresh, "grant_type": "refresh_token",
    })
    if response.status_code != 200:
        if _error_reason(response) == "invalid_grant":
            # Revoked, or a Testing-mode refresh token past its 7 days: the user must sign in again.
            with closing(_links_db()) as conn, conn:
                conn.execute("UPDATE google_health_links SET refresh_token = NULL, access_token = NULL"
                             " WHERE user_id = ?", (user_id,))
        raise ConnectError("expired", "The Google sign-in expired. Press Connect again.", 401)
    tokens = response.json()
    with closing(_links_db()) as conn, conn:
        conn.execute(
            "UPDATE google_health_links SET access_token = ?, access_expires_at = ? WHERE user_id = ?",
            (_seal(tokens["access_token"]), clock.time() + int(tokens.get("expires_in", 3600)), user_id),
        )
    return tokens["access_token"], scopes


# ---------------------------------------------------------------------------------------------
# Reading Google Health
# ---------------------------------------------------------------------------------------------

def _civil_date(value) -> date | None:
    """Civil times come as {"date": {"year", "month", "day"}, "time": {...}} or as a string."""
    if isinstance(value, dict):
        d = value.get("date", value)
        try:
            return date(int(d["year"]), int(d["month"]), int(d["day"]))
        except (KeyError, TypeError, ValueError):
            return None
    if isinstance(value, str) and len(value) >= 10:
        try:
            return date.fromisoformat(value[:10])
        except ValueError:
            return None
    return None


def _local(stamp: str, offset: str | None) -> datetime:
    """RFC 3339 instant + the record's own UTC offset ("19800s") -> the wearer's local clock time."""
    moment = datetime.fromisoformat(stamp.replace("Z", "+00:00"))
    seconds = 0
    if isinstance(offset, str) and offset.endswith("s"):
        try:
            seconds = int(float(offset[:-1]))
        except ValueError:
            seconds = 0
    return moment.astimezone(timezone(timedelta(seconds=seconds)))


def _device(item: dict) -> str:
    """dataSource.device.displayName when present. Reconciled points carry no dataSource at all."""
    source = item.get("dataSource") or {}
    device = source.get("device") if isinstance(source.get("device"), dict) else {}
    name = device.get("displayName") or device.get("manufacturer")
    return clean_source_name(str(name)) if name else DEFAULT_DEVICE


def fetch_sleep(token: str, first: date, last: date) -> list[dict]:
    """Main sleep per night (woke up between `first` and `last`, inclusive), via reconcile."""
    nights: dict[date, dict] = {}
    params = {
        "filter": f'sleep.interval.civil_end_time >= "{first.isoformat()}"'
                  f' AND sleep.interval.civil_end_time < "{(last + timedelta(days=1)).isoformat()}"',
        "pageSize": 25,
    }
    for _ in range(200):  # 200 pages x 25 nights is far more than 90 days
        response = _request("GET", f"{API}/dataTypes/sleep/dataPoints:reconcile", headers=_auth(token), params=params)
        _raise_for_api(response, "sleep")
        body = response.json()
        for item in body.get("dataPoints", []) or []:
            night = _night(item)
            if night is None:
                continue
            kept = nights.get(night["date"])
            # One night per wake-up day: Google's main sleep wins, otherwise the longest session.
            if kept is None or (night["main"], night["minutes"]) > (kept["main"], kept["minutes"]):
                nights[night["date"]] = night
        page = body.get("nextPageToken")
        if not page:
            break
        params["pageToken"] = page
    return [nights[d] for d in sorted(nights)]


def _night(item: dict) -> dict | None:
    sleep = item.get("sleep") or {}
    meta = sleep.get("metadata") or {}
    interval = sleep.get("interval") or {}
    if meta.get("nap") is True or not interval.get("startTime") or not interval.get("endTime"):
        return None  # naps are left out: the demo's sleep_min is the night's sleep
    start = _local(interval["startTime"], interval.get("startUtcOffset"))
    end = _local(interval["endTime"], interval.get("endUtcOffset"))
    if end <= start:
        return None
    wake_day = _civil_date(interval.get("civilEndTime")) or end.date()
    summary = sleep.get("summary") or {}
    try:
        minutes = float(summary["minutesAsleep"])
    except (KeyError, TypeError, ValueError):
        minutes = (end - start).total_seconds() / 60
    return {
        "date": wake_day, "minutes": minutes, "start": start, "end": end, "device": _device(item),
        "main": bool(meta.get("mainSleep", meta.get("main", False))),
    }


def fetch_steps(token: str, first: date, last: date) -> dict[date, int]:
    """Daily step totals for `first`..`last` (inclusive). Unworn days have no value and are skipped."""
    totals: dict[date, int] = {}
    start = first
    while start <= last:
        stop = min(last, start + timedelta(days=SYNC_DAYS - 1))
        end_exclusive = stop + timedelta(days=1)
        body = {
            "range": {"start": _civil(start), "end": _civil(end_exclusive)},
            "windowSizeDays": 1,
        }
        response = _request("POST", f"{API}/dataTypes/steps/dataPoints:dailyRollUp", headers=_auth(token), json=body)
        _raise_for_api(response, "steps")
        for point in response.json().get("rollupDataPoints", []) or []:
            day = _civil_date(point.get("civilStartTime"))
            count = (point.get("steps") or {}).get("countSum")
            if day is None or count is None:
                continue  # watch not worn: no reading rather than a fake zero
            try:
                totals[day] = int(float(count))
            except (TypeError, ValueError):
                continue
        start = end_exclusive
    return dict(sorted(totals.items()))


def _civil(day: date) -> dict:
    return {"date": {"year": day.year, "month": day.month, "day": day.day},
            "time": {"hours": 0, "minutes": 0, "seconds": 0, "nanos": 0}}


def _raise_for_api(response: httpx.Response, what: str) -> None:
    if response.status_code == 200:
        return
    reason = _error_reason(response)
    if reason == "ACCOUNT_NOT_LINKED":
        raise ConnectError("not_linked", "This Google account isn't linked to Google Health in the app yet.")
    if reason == "MISSING_OAUTH_SCOPE" or response.status_code == 403:
        raise ConnectError("no_scopes", f"Google Health didn't allow reading {what}. Press Connect and allow it.", 403)
    if response.status_code == 401:
        raise ConnectError("expired", "The Google sign-in expired. Press Connect again.", 401)
    raise ConnectError("api", f"Google Health couldn't send {what} data right now. Try Sync again shortly.", 502)


# ---------------------------------------------------------------------------------------------
# Import into this user's own database
# ---------------------------------------------------------------------------------------------

def import_points(conn: sqlite3.Connection, nights: list[dict], steps: dict[date, int], imported_at: str) -> dict:
    """Write raw records + daily observations. Existing days are never changed (rule 5)."""
    init_schema(conn)
    counters = _next_numbers(conn)
    existing = {(r[0], r[1]) for r in conn.execute("SELECT metric, date FROM observations")}
    added: dict[str, int] = {}
    already = excluded = 0

    def add(metric: str, day: date, value: float, raw_type: str, raw_value: str, device: str,
            recorded_at: str, ended_at: str | None, at_time: str) -> None:
        nonlocal already, excluded
        if (metric, day.isoformat()) in existing:
            already += 1
            return
        source_id = "src_gh_" + hashlib.sha256(device.encode()).hexdigest()[:6]
        src = hashlib.sha256(f"{source_id}|{recorded_at}|{raw_type}|{raw_value}".encode()).hexdigest()
        conn.execute(
            "INSERT OR IGNORE INTO source_records (id, source_id, source_file, device, raw_type, raw_value,"
            " raw_unit, recorded_at, ended_at, imported_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (src, source_id, SOURCE_FILE, device, raw_type, raw_value, METRICS[metric].unit, recorded_at,
             ended_at, imported_at),
        )
        lo, hi = PLAUSIBLE.get(metric, (float("-inf"), float("inf")))
        reason = None if lo <= value <= hi else f"outside the plausible range {lo}-{hi} {METRICS[metric].unit}"
        m = METRICS[metric]
        conn.execute(
            "INSERT INTO observations (id, source_record_id, metric, value, unit, date, time, device, source_id,"
            " source_file, data_quality, normalization, is_excluded, exclusion_reason)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (f"{m.prefix}_{counters[metric]:04d}", src, metric, float(value), m.unit, day.isoformat(), at_time,
             device, source_id, SOURCE_FILE, 1.0, NORMALIZATION[metric], int(reason is not None), reason),
        )
        counters[metric] += 1
        existing.add((metric, day.isoformat()))
        added[metric] = added.get(metric, 0) + 1
        excluded += reason is not None

    for n in nights:
        noon = datetime.combine(n["date"] - timedelta(days=1), time(12, 0), tzinfo=n["start"].tzinfo)
        add("sleep_min", n["date"], round(n["minutes"], 1), "googlehealth.sleep.minutesAsleep",
            str(n["minutes"]), n["device"], n["start"].isoformat(), n["end"].isoformat(), n["end"].strftime("%H:%M:%S"))
        add("lights_out", n["date"], round((n["start"] - noon).total_seconds() / 60, 1), "googlehealth.sleep.start",
            n["start"].isoformat(), n["device"], n["start"].isoformat(), None, n["start"].strftime("%H:%M:%S"))
    for day, count in steps.items():
        add("steps", day, count, "googlehealth.steps.dailyRollUp.countSum", str(count), DEFAULT_DEVICE,
            f"{day.isoformat()}T00:00:00", f"{(day + timedelta(days=1)).isoformat()}T00:00:00", "23:59:59")
    return {"added": added, "already_present": already, "excluded": excluded}


def sync(user_id: str, today: date | None = None) -> dict:
    """Download the last 90 complete days and import them. Returns the summary shown in the UI."""
    token, scopes = _access_token(user_id)
    today = today or datetime.now(IST).date()
    last = today - timedelta(days=1)  # today isn't over: its steps would freeze half-counted
    first = last - timedelta(days=SYNC_DAYS - 1)
    nights = fetch_sleep(token, first, last) if SCOPE_SLEEP in scopes else []
    steps = fetch_steps(token, first, last) if SCOPE_ACTIVITY in scopes else {}

    from backend.analysis.change_detection import refresh_change_events

    with closing(connect(import_db_path(user_id))) as conn, conn:
        result = import_points(conn, nights, steps, _now_iso())
        events = refresh_change_events(conn, last) if (nights or steps) else []
        summary = _summary(conn, result, events, first, last, scopes)
    with closing(_links_db()) as conn, conn:
        conn.execute("UPDATE google_health_links SET last_sync_at = ?, last_sync = ? WHERE user_id = ?",
                     (summary["synced_at"], dumps(summary), user_id))
    return summary


def _summary(conn: sqlite3.Connection, result: dict, events: list[dict], first: date, last: date,
             scopes: set[str]) -> dict:
    def stats(metric: str) -> tuple[int, float | None]:
        row = conn.execute(
            "SELECT COUNT(*) AS n, AVG(value) AS avg FROM observations"
            " WHERE metric = ? AND is_excluded = 0 AND date BETWEEN ? AND ?",
            (metric, first.isoformat(), last.isoformat()),
        ).fetchone()
        return int(row["n"]), (round(row["avg"], 1) if row["avg"] is not None else None)

    nights, avg_sleep = stats("sleep_min")
    step_days, avg_steps = stats("steps")
    recent = []
    for d in range(6, -1, -1):
        day = (last - timedelta(days=d)).isoformat()
        rows = {r["metric"]: r for r in conn.execute(
            "SELECT id, metric, value FROM observations WHERE date = ? AND metric IN ('sleep_min', 'steps')"
            " AND is_excluded = 0", (day,))}
        recent.append({
            "date": day,
            "sleep_min": rows["sleep_min"]["value"] if "sleep_min" in rows else None,
            "sleep_id": rows["sleep_min"]["id"] if "sleep_min" in rows else None,
            "steps": int(rows["steps"]["value"]) if "steps" in rows else None,
            "steps_id": rows["steps"]["id"] if "steps" in rows else None,
        })
    return {
        "synced_at": _now_iso(),
        "range": {"start": first.isoformat(), "end": last.isoformat()},
        "nights": nights,
        "avg_sleep_min": avg_sleep,
        "step_days": step_days,
        "avg_steps": int(avg_steps) if avg_steps is not None else None,
        "new_observations": result["added"],
        "already_present": result["already_present"],
        "excluded": result["excluded"],
        "change_events": [{"date": iso(e["date"]), "label": e["label"]} for e in events],
        "missing_scopes": [s.rsplit(".", 2)[-2] for s in SCOPES if s not in scopes],
        "recent": recent,
    }


def status(user_id: str) -> dict:
    with closing(_links_db()) as conn:
        link = conn.execute("SELECT * FROM google_health_links WHERE user_id = ?", (user_id,)).fetchone()
    connected = bool(link and link["refresh_token"])
    return {
        "configured": configured(),
        "connected": connected,
        "needs_reconnect": bool(link and not link["refresh_token"]),
        "linked_at": link["linked_at"] if link else None,
        "last_sync": loads(link["last_sync"]) if link and link["last_sync"] else None,
    }


def disconnect(user_id: str, delete_data: bool = False) -> dict:
    """Revoke Google's tokens and forget them. Imported data stays unless `delete_data`."""
    with closing(_links_db()) as conn:
        link = conn.execute("SELECT * FROM google_health_links WHERE user_id = ?", (user_id,)).fetchone()
    if link is not None:
        token = _open(link["refresh_token"]) or _open(link["access_token"])
        if token:
            try:
                _request("POST", REVOKE_URL, data={"token": token})
            except ConnectError:
                pass  # forgetting the token locally still signs the user out here
        with closing(_links_db()) as conn, conn:
            conn.execute("DELETE FROM google_health_links WHERE user_id = ?", (user_id,))
    deleted = False
    if delete_data:
        path = import_db_path(user_id)
        for suffix in ("", "-wal", "-shm", "-journal"):
            Path(f"{path}{suffix}").unlink(missing_ok=True)
        deleted = True
    return {"connected": False, "data_deleted": deleted}


def _now_iso() -> str:
    return datetime.now(IST).replace(microsecond=0).isoformat()
