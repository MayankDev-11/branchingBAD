"""POST /api/experiments/{id}/lock, POST /api/demo/advance, POST /api/demo/reset."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from backend.analysis.experiments import ExperimentError, lock_experiment
from backend.data.queries import build_experiment, build_graph, experiment_rank
from backend.data.store import store

router = APIRouter(prefix="/api", tags=["experiments"])


@router.post("/experiments/{experiment_id}/lock")
def lock(experiment_id: str) -> dict:
    """Freeze the baseline and lock the success criterion. Locking twice changes nothing."""
    with store.connection() as conn:
        try:
            exp = lock_experiment(conn, experiment_id, store.clock)
        except ExperimentError as err:
            raise HTTPException(status_code=err.status_code, detail=err.detail) from err
        return build_experiment(conn, exp, store.clock, experiment_rank(conn, exp, store.clock))


class AdvanceBody(BaseModel):
    days: int = Field(ge=1, le=365)


@router.post("/demo/advance")
def advance(body: AdvanceBody) -> dict:
    """Fast-forward the demo clock; finished experiments are scored and returns the new graph."""
    store.advance(body.days)
    with store.connection() as conn:
        return build_graph(conn, store.clock, store.range_start)


@router.post("/demo/reset")
def reset() -> dict:
    """Rebuild the demo data and put the clock back to the start (for rehearsals)."""
    store.reset()
    with store.connection() as conn:
        return build_graph(conn, store.clock, store.range_start)
