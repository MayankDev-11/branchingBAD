"""GET /api/branches/{id} (contracts/sample_branch.json) and GET /api/records/{id} (sample_record.json)."""

from fastapi import APIRouter, HTTPException

from backend.data.queries import build_branch, build_record
from backend.data.store import store

router = APIRouter(prefix="/api", tags=["branches"])


@router.get("/branches/{branch_id}")
def get_branch(branch_id: str) -> dict:
    with store.connection() as conn:
        branch = build_branch(conn, branch_id, store.clock)
    if branch is None:
        raise HTTPException(status_code=404, detail=f"Branch '{branch_id}' not found")
    return branch


@router.get("/records/{record_id}")
def get_record(record_id: str) -> dict:
    with store.connection() as conn:
        record = build_record(conn, record_id, store.clock)
    if record is None:
        raise HTTPException(status_code=404, detail=f"Record '{record_id}' not found")
    return record
