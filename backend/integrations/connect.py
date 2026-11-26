"""Signed-in routes for connecting a Fitbit / Pixel Watch through the Google Health API.

GET  /api/connect/google/status      is it set up, connected, and the last sync summary
GET  /api/connect/google/start       {"url": Google's consent page}; the browser goes there
GET  /api/connect/google/callback    Google sends the user back here; we finish and redirect
                                     to /dashboard?connect=google&result=connected|<reason>
POST /api/connect/google/sync        download the last 90 days again (new days only)
POST /api/connect/google/disconnect  {"delete_data": bool}: revoke Google's access
GET  /api/connect/google/simulated-consent  Judge Demo only: the SIMULATED sign-in page

The Judge Demo account has no real Fitbit or Google account, so for it (and only it) every call
runs inside google_health.simulated(): the sign-in page is our own, labelled SIMULATED, and the
Google answers come from google_health_sim. Every other account uses the real Google.
"""

from contextlib import nullcontext
from typing import Annotated, Callable, Optional
from urllib.parse import urlencode

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response
from fastapi.responses import HTMLResponse, RedirectResponse
from pydantic import BaseModel
from starlette.concurrency import run_in_threadpool

from backend.auth.dependencies import SESSION_COOKIE_NAME, CurrentUser, get_current_user
from backend.integrations import google_health
from backend.integrations.google_health import ConnectError

router = APIRouter(prefix="/api/connect/google", tags=["Google Health (Fitbit)"])
User = Annotated[CurrentUser, Depends(get_current_user)]


def _fail(exc: ConnectError) -> HTTPException:
    return HTTPException(exc.status_code, {"reason": exc.reason, "message": exc.message})


def _mode(user: CurrentUser):
    """Simulated Google for the Judge Demo account, the real Google for everyone else."""
    return google_health.simulated() if user.is_demo else nullcontext()


def _in_mode(user: CurrentUser, fn: Callable) -> Callable:
    """Run `fn` in the user's mode inside the worker thread."""
    def run(*args):
        with _mode(user):
            return fn(*args)
    return run


@router.get("/status")
def connect_status(user: User, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    with _mode(user):
        return google_health.status(user.id)


@router.get("/start")
def connect_start(user: User, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    try:
        with _mode(user):
            return {"url": google_health.start_url(user.id)}
    except ConnectError as exc:
        raise _fail(exc) from None


@router.get("/simulated-consent", response_class=HTMLResponse)
def simulated_consent(user: User, state: str = "") -> HTMLResponse:
    if not user.is_demo:
        raise HTTPException(404, "Not found")
    from backend.integrations.google_health_sim import consent_page

    return HTMLResponse(consent_page(state, user.full_name), headers={"Cache-Control": "no-store"})


def _back(result: str) -> RedirectResponse:
    return RedirectResponse("/dashboard?" + urlencode({"connect": "google", "result": result}), status_code=303)


@router.get("/callback")
async def connect_callback(
    state: str = "",
    code: str = "",
    error: str = "",
    roottrace_session: Optional[str] = Cookie(default=None, alias=SESSION_COOKIE_NAME),
) -> RedirectResponse:
    """Always ends on the dashboard with a result code, never on a raw JSON error page."""
    try:
        user = get_current_user(roottrace_session)
    except HTTPException:
        return _back("signed_out")
    if error:
        return _back("denied" if error == "access_denied" else "google_error")
    if not state or not code:
        return _back("bad_state")
    try:
        await run_in_threadpool(_in_mode(user, google_health.finish), user.id, state, code)
    except ConnectError as exc:
        return _back(exc.reason)
    return _back("connected")


@router.post("/sync")
async def connect_sync(user: User, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    try:
        return await run_in_threadpool(_in_mode(user, google_health.sync), user.id)
    except ConnectError as exc:
        raise _fail(exc) from None


class DisconnectBody(BaseModel):
    delete_data: bool = False


@router.post("/disconnect")
def connect_disconnect(body: DisconnectBody, user: User, response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    with _mode(user):
        return google_health.disconnect(user.id, body.delete_data)
