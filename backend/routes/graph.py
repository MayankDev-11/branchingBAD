"""GET /api/graph: homepage trunk, change events, branches and knowledge.

The response shape is fixed by contracts/sample_graph.json. Until the SQLite
schema and the 90-day demo generator land (tasks 2 and 3 in CLAUDE.md), this
route serves that sample file as-is, so the frontend can flip USE_MOCK off
without breaking.
"""

import json
from pathlib import Path

from fastapi import APIRouter

router = APIRouter(prefix="/api", tags=["graph"])

REPO_ROOT = Path(__file__).resolve().parents[2]
SAMPLE_GRAPH_PATH = REPO_ROOT / "contracts" / "sample_graph.json"


def load_sample_graph() -> dict:
    with SAMPLE_GRAPH_PATH.open(encoding="utf-8") as f:
        return json.load(f)


@router.get("/graph")
def get_graph() -> dict:
    return load_sample_graph()
