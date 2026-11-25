"""Signed-in API routes for RootTrace AI and integrations."""

from typing import Annotated

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError, field_validator

from backend.ai.ask import Answer, ModelUnavailable, ask
from backend.ai.evidence import UnknownBranch
from backend.ai.gemini import GeminiUnavailable
from backend.auth.dependencies import CurrentUser, get_current_user
from backend.integrations.branches import workspace_branch
from backend.integrations.obsidian import build_vault
from backend.integrations.weekly import AudioUnavailable, audio_path, weekly_report
from backend.privacy.questions import PrivacyUnavailable, is_red_flag

load_dotenv()

router = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)], tags=["AI and integrations"])
User = Annotated[CurrentUser, Depends(get_current_user)]


class AskRequest(BaseModel):
    branch_id: str | None = Field(max_length=64)
    question: str = Field(min_length=1, max_length=4000)

    @field_validator("question")
    @classmethod
    def reject_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter a question.")
        return value.strip()


@router.post("/ask", response_model=Answer)
def ask_route(body: AskRequest, user: User, response: Response) -> Answer:
    response.headers["Cache-Control"] = "no-store"
    if body.branch_id and body.branch_id.startswith("br_custom_") and not is_red_flag(body.question):
        if workspace_branch(user.id, body.branch_id) is None:
            raise HTTPException(404, "Branch not found.")
        return Answer(red_flag=False, hypotheses=[], dropped_claims=0, sent_to_ai="")
    try:
        return ask(body.question, body.branch_id, user.full_name, user.email)
    except UnknownBranch:
        raise HTTPException(404, "Branch not found.") from None
    except GeminiUnavailable as exc:
        raise HTTPException(503, str(exc)) from None
    except (ModelUnavailable, PrivacyUnavailable):
        raise HTTPException(503, "Ask is unavailable. Check Bedrock and local privacy setup.") from None
    except (ImportError, ValidationError):
        raise HTTPException(503, "Ask could not produce a validated answer.") from None
    except Exception as exc:
        # Botocore exceptions may contain provider request details, so omit them from HTTP errors.
        if type(exc).__module__.startswith("botocore"):
            raise HTTPException(502, "Bedrock is temporarily unavailable.") from None
        raise


@router.get("/report/weekly")
def report_route(response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    try:
        return weekly_report()
    except AudioUnavailable:
        raise HTTPException(503, "Weekly audio is unavailable. Check ElevenLabs setup.") from None


@router.get("/report/weekly/audio/{audio_id}")
def report_audio_route(audio_id: str) -> FileResponse:
    path = audio_path(audio_id)
    if path is None:
        raise HTTPException(404, "Audio not found.")
    return FileResponse(path, media_type="audio/mpeg", headers={"Cache-Control": "private, no-store"})


@router.get("/export/obsidian")
def obsidian_route() -> Response:
    return Response(build_vault(), media_type="application/zip", headers={
        "Content-Disposition": 'attachment; filename="roottrace-obsidian.zip"',
        "Cache-Control": "no-store",
    })
