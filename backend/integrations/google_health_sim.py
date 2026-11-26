"""A SIMULATED Google Health for the Judge Demo account only.

The demo account has no real Fitbit and no real Google account, so pressing Connect there goes to
a simulated sign-in page (served by our backend and labelled SIMULATED) and this module answers
the same Google requests the real flow makes: token exchange, identity, sleep reconcile, steps
dailyRollUp and revoke. The real download and import code in google_health.py processes the
answers, so the demo shows our actual import code working, just on made-up data.

Real accounts never reach this module: connect.py switches it on only for `is_demo` users.

The made-up data follows the demo story: sleep is normal until 3 Nov, then about 47 min lower and
later to bed. A few days have no reading (watch not worn), and some days have a nap, which the
importer leaves out.
"""

import random
from datetime import date, datetime, time, timedelta, timezone
from urllib.parse import parse_qs

import httpx

from backend.integrations import google_health as gh

SIM_CODE = "simulated-demo-code"
SIM_HEALTH_USER = "simulated-judge-demo"
DROP_DATE = date(2026, 11, 3)
SEED = 4207
IST_OFFSET = timedelta(hours=5, minutes=30)


# ---------------------------------------------------------------------------------------------
# The made-up wearer: one deterministic day at a time, so Sync always sees the same history
# ---------------------------------------------------------------------------------------------

def _rng(day: date, salt: int) -> random.Random:
    return random.Random(SEED * 1_000_003 + day.toordinal() * 31 + salt)


def worn(day: date) -> bool:
    return _rng(day, 1).random() >= 0.03


def night(day: date) -> dict | None:
    """The main sleep that ended on the morning of `day`, or None if the watch wasn't worn."""
    if not worn(day):
        return None
    r = _rng(day, 2)
    after = day >= DROP_DATE
    asleep = round(r.gauss(378 if after else 425, 11))
    bed = r.gauss(23 * 60 + 50 if after else 23 * 60 + 5, 18)          # minutes after midnight, local
    start_local = datetime.combine(day - timedelta(days=1), time(0, 0)) + timedelta(minutes=bed)
    end_local = start_local + timedelta(minutes=asleep + r.randint(15, 35))  # some time awake in bed
    return {"asleep": asleep, "start": start_local, "end": end_local}


def nap(day: date) -> dict | None:
    r = _rng(day, 3)
    if not worn(day) or r.random() >= 0.12:
        return None
    start = datetime.combine(day, time(14, 0)) + timedelta(minutes=r.randint(0, 90))
    minutes = r.randint(20, 45)
    return {"asleep": minutes, "start": start, "end": start + timedelta(minutes=minutes + 3)}


def steps(day: date) -> int | None:
    if not worn(day):
        return None
    r = _rng(day, 4)
    return max(600, int(r.gauss(6400 if day >= DROP_DATE else 8100, 1300)))


# ---------------------------------------------------------------------------------------------
# Google's answers, in Google Health API v4 shapes
# ---------------------------------------------------------------------------------------------

def _utc(local: datetime) -> str:
    return (local - IST_OFFSET).replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _civil(day: date) -> dict:
    return {"date": {"year": day.year, "month": day.month, "day": day.day}, "time": {}}


def _sleep_point(day: date, session: dict, main: bool) -> dict:
    return {
        "dataPointName": f"simulated/sleep/{day.isoformat()}/{'main' if main else 'nap'}",
        "sleep": {
            "interval": {
                "startTime": _utc(session["start"]), "endTime": _utc(session["end"]),
                "startUtcOffset": "19800s", "endUtcOffset": "19800s",
                "civilEndTime": _civil(session["end"].date()),
            },
            "metadata": {"mainSleep": main, "nap": not main},
            "type": "STAGES",
            "summary": {"minutesAsleep": str(session["asleep"])},
        },
    }


def _filter_dates(text: str) -> tuple[date, date]:
    """'sleep.interval.civil_end_time >= "A" AND sleep.interval.civil_end_time < "B"' -> (A, B)."""
    quoted = text.split('"')[1::2]
    return date.fromisoformat(quoted[0]), date.fromisoformat(quoted[1])


def _sleep_page(params: dict) -> dict:
    first, end_exclusive = _filter_dates(params["filter"])
    points = []
    day = first
    while day < end_exclusive:
        for session, main in ((night(day), True), (nap(day), False)):
            if session is not None:
                points.append(_sleep_point(day, session, main))
        day += timedelta(days=1)
    size = max(1, min(25, int(params.get("pageSize", 25))))
    offset = int(params.get("pageToken") or 0)
    page = points[offset:offset + size]
    more = offset + size < len(points)
    return {"dataPoints": page, "nextPageToken": str(offset + size) if more else ""}


def _steps_rollup(body: dict) -> dict:
    first = gh._civil_date(body["range"]["start"])
    end_exclusive = gh._civil_date(body["range"]["end"])
    points = []
    day = first
    while day < end_exclusive:
        point = {"civilStartTime": _civil(day), "civilEndTime": _civil(day + timedelta(days=1))}
        count = steps(day)
        if count is not None:  # an unworn day comes back without a value, as Google sends it
            point["steps"] = {"countSum": str(count)}
        points.append(point)
        day += timedelta(days=1)
    return {"rollupDataPoints": points}


def _reply(method: str, url: str, status: int, body: dict) -> httpx.Response:
    return httpx.Response(status, json=body, request=httpx.Request(method, url))


def handle(method: str, url: str, params: dict | None = None, data: dict | None = None,
           json: dict | None = None, **_ignored) -> httpx.Response:
    """Answer one request the real flow would send to Google."""
    method = method.upper()
    if method == "POST" and url == gh.TOKEN_URL:
        form = data or {}
        if form.get("grant_type") == "authorization_code":
            if form.get("code") != SIM_CODE:
                return _reply(method, url, 400, {"error": "invalid_grant"})
            refresh = "simulated-refresh-token"
        elif form.get("grant_type") == "refresh_token":
            refresh = None
        else:
            return _reply(method, url, 400, {"error": "unsupported_grant_type"})
        tokens = {"access_token": "simulated-access-token", "expires_in": 3599,
                  "scope": " ".join(gh.SCOPES), "token_type": "Bearer"}
        if refresh:
            tokens["refresh_token"] = refresh
        return _reply(method, url, 200, tokens)
    if method == "POST" and url == gh.REVOKE_URL:
        return _reply(method, url, 200, {})
    if method == "GET" and url == f"{gh.API}/identity":
        return _reply(method, url, 200, {"name": "users/me/identity", "healthUserId": SIM_HEALTH_USER})
    if method == "GET" and url == f"{gh.API}/dataTypes/sleep/dataPoints:reconcile":
        return _reply(method, url, 200, _sleep_page(params or {}))
    if method == "POST" and url == f"{gh.API}/dataTypes/steps/dataPoints:dailyRollUp":
        return _reply(method, url, 200, _steps_rollup(json or {}))
    return _reply(method, url, 404, {"error": {"status": "NOT_FOUND"}})


def consent_page(state: str, account: str) -> str:
    """The simulated sign-in page. It always sends the browser back to our own callback."""
    from html import escape
    from urllib.parse import urlencode

    callback = "/api/connect/google/callback?"
    allow = escape(callback + urlencode({"state": state, "code": SIM_CODE}))
    cancel = escape(callback + urlencode({"state": state, "error": "access_denied"}))
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>SIMULATED sign-in · RootTrace demo</title>
<style>
 body {{ margin: 0; font-family: system-ui, -apple-system, "Segoe UI", Arial, sans-serif; background: #0b0f14; color: #e6edf3; }}
 .bar {{ background: #b3261e; color: #fff; text-align: center; padding: 12px; font-weight: 700; letter-spacing: .4px; }}
 .card {{ max-width: 480px; margin: 56px auto; background: #111821; border: 1px solid #263241; border-radius: 16px; padding: 32px; }}
 h1 {{ font-size: 21px; font-weight: 600; margin: 0 0 6px; }}
 .muted {{ color: #8b98a5; font-size: 13.5px; line-height: 1.5; }}
 .acct {{ display: inline-block; border: 1px solid #263241; border-radius: 20px; padding: 6px 14px; margin: 14px 0; font-size: 14px; }}
 li {{ margin: 8px 0; }}
 .btns {{ display: flex; justify-content: flex-end; gap: 12px; margin-top: 26px; }}
 a.btn {{ padding: 10px 22px; border-radius: 12px; text-decoration: none; font-weight: 600; font-size: 14px; }}
 #allow {{ background: #14b8a6; color: #04201d; }}
 #cancel {{ color: #8b98a5; border: 1px solid #263241; }}
</style></head>
<body>
<div class="bar">SIMULATED SIGN-IN · JUDGE DEMO ACCOUNT ONLY · NOT REAL GOOGLE</div>
<div class="card">
 <div class="muted">Stand-in for the Google sign-in page</div>
 <h1>RootTrace wants read-only access to your Google Health data</h1>
 <div class="acct">{escape(account)}</div>
 <p>This would allow RootTrace to:</p>
 <ul><li>See your <b>sleep</b> (read-only)</li><li>See your <b>activity and fitness</b>, such as steps (read-only)</li></ul>
 <p class="muted">The demo account has no real Fitbit, so Allow imports 90 days of made-up Fitbit sleep and steps.
 Real accounts go to the real Google sign-in instead.</p>
 <div class="btns"><a class="btn" id="cancel" href="{cancel}">Cancel</a><a class="btn" id="allow" href="{allow}">Allow</a></div>
</div>
</body></html>"""
