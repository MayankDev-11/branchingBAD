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
from backend.ai.knowledge_catalog import DEMO_OUTCOMES, TOPICS, URINARY, off_topic_question, question_outcome
from backend.auth.dependencies import CurrentUser, get_current_user
from backend.data.store import store
from backend.integrations.branch_evidence import workspace_hypotheses
from backend.integrations.branches import _detail, workspace_branch
from backend.integrations.obsidian import build_vault
from backend.integrations.weekly import AudioUnavailable, audio_path, weekly_report
from backend.privacy.questions import PrivacyUnavailable, is_red_flag

load_dotenv()

router = APIRouter(prefix="/api", dependencies=[Depends(get_current_user)], tags=["AI and integrations"])
User = Annotated[CurrentUser, Depends(get_current_user)]
BRANCH_FOLLOW_UP = re.compile(
    r"\b(?:this (?:branch|investigation)|these (?:hypotheses|factors)|"
    r"(?:show|explain|summarize) (?:the |my )?(?:evidence|findings|results))\b",
    re.IGNORECASE,
)


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
        elif body.branch_id not in (None, *DEMO_OUTCOMES.values()):
            raise HTTPException(404, "Branch not found.")
        if off_topic_question(body.question):
            raise HTTPException(422, "RootTrace answers questions about your tracked health patterns. Try asking about sleep, activity, or the evidence in an investigation.")
        outcome = question_outcome(body.question)
        if outcome == URINARY:
            return ask(body.question, body.branch_id)
        intent = interpret_demo_question(body.question, None if workspace else body.branch_id, store.clock)
        if outcome == "untracked" and intent is None and not (
            workspace and BRANCH_FOLLOW_UP.search(body.question)
        ):
            raise HTTPException(422, "There is no matching outcome in the available logs. Try asking about tracked sleep, headaches, activity, or the evidence for a branch.")
        if workspace or (body.branch_id in (None, *DEMO_OUTCOMES.values()) and outcome not in DEMO_OUTCOMES):
            if (workspace and not MEDICAL.search(body.question.casefold())
                    and (intent and intent.kind == "next" or outcome == "untracked" and BRANCH_FOLLOW_UP.search(body.question))):
                return _workspace_follow_up(body.branch_id, workspace)
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
    return _local_answer(factors)


def _workspace_follow_up(branch_id: str, workspace: dict) -> Answer:
    detail = _detail(branch_id, workspace)
    if detail.get("guidance"):
        guidance = detail["guidance"]
        return _local_answer([{"rank": 1, "label": guidance["title"], "claims": [], "test": guidance["message"]}])
    return _local_answer(detail["hypotheses"])


def _local_answer(factors: list[dict]) -> Answer:
    return Answer(
        red_flag=False, dropped_claims=0, sent_to_ai="",
        hypotheses=[Hypothesis(rank=item["rank"], text=item["label"], claims=item["claims"], test=item["test"][:500])
                    for item in factors[:3]],
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
