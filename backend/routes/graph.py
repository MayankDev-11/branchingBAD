"""GET /api/graph: homepage trunk, change events, branches and knowledge.

Shape fixed by contracts/sample_graph.json; data from SQLite, up to the demo clock.
"""

from fastapi import APIRouter

from backend.data.queries import build_graph
from backend.data.store import store

router = APIRouter(prefix="/api", tags=["graph"])


@router.get("/graph")
def get_graph() -> dict:
    with store.connection() as conn:
        return build_graph(conn, store.clock, store.range_start)
