"""Signed-in API routes for RootTrace AI and integrations."""

import re
from typing import Annotated

from dotenv import load_dotenv
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field, ValidationError, field_validator

from backend.ai.ask import Answer, Hypothesis, ModelUnavailable, ask
from backend.ai.demo_questions import MEDICAL, interpret_demo_question
from backend.ai.evidence import UnknownBranch
from backend.ai.gemini import GeminiUnavailable
from backend.ai.knowledge_catalog import DEMO_OUTCOMES, TOPICS, URINARY, question_outcome
from backend.auth.dependencies import CurrentUser, get_current_user
from backend.data.store import store
from backend.integrations.branch_evidence import workspace_hypotheses
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
    try:
        if is_red_flag(body.question):
            return ask(body.question, body.branch_id)
        workspace = None
        if body.branch_id and body.branch_id.startswith("br_custom_"):
            workspace = workspace_branch(user.id, body.branch_id)
            if workspace is None:
                raise HTTPException(404, "Branch not found.")
        outcome = question_outcome(body.question)
        if outcome == URINARY:
            return ask(body.question, body.branch_id)
        if workspace or (body.branch_id in (None, *DEMO_OUTCOMES.values()) and outcome not in DEMO_OUTCOMES):
            intent = interpret_demo_question(body.question, None, store.clock)
            if intent and intent.kind in {"reading", "change"} and workspace:
                return ask(body.question, None, user.full_name, user.email)
            if outcome in TOPICS and (not intent or intent.kind == "patterns"):
                text = body.question.casefold()
                if not MEDICAL.search(text) and re.search(
                    r"\b(?:why|reason\w*|relat\w*|affect\w*|influenc\w*|trigger\w*|lead to|caus\w*|"
                    r"contribut\w*|test\w*|track\w*|pattern\w*)\b", text,
                ):
                    return _catalog_answer(body.question, outcome, workspace)
            if workspace:
                return Answer(red_flag=False, hypotheses=[], dropped_claims=0, sent_to_ai="")
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


def _catalog_answer(question: str, outcome: str, workspace: dict | None) -> Answer:
    with store.connection() as conn:
        clock = store.clock
        factors = workspace_hypotheses(conn, {
            "title": question, "outcome": outcome, "branch_type": "investigation",
            "start_date": workspace["start_date"] if workspace else clock.isoformat(),
            "metrics": [], "hypotheses": [],
        }, clock)
    return Answer(
        red_flag=False, dropped_claims=0, sent_to_ai="",
        hypotheses=[Hypothesis(rank=item["rank"], text=item["label"], claims=item["claims"], test=item["test"])
                    for item in factors],
    )


@router.get("/report/weekly")
def report_route(response: Response) -> dict:
    response.headers["Cache-Control"] = "no-store"
    try:
        return weekly_report()
    except AudioUnavailable as exc:
        raise HTTPException(exc.status_code, str(exc)) from None


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
