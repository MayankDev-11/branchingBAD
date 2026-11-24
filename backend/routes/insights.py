"""GET /api/insights and POST /api/import/apple-health.

/api/insights carries every number on the Insights, Profile and Data & help pages (rule 9).
/api/import/apple-health runs the Apple Health importer on an uploaded export.zip / export.xml.
The import goes into its own database (backend/data/apple_health.db, git-ignored), never the
demo one, so the demo story stays the same however many files are uploaded.
"""

import os
import shutil
import tempfile
from dataclasses import asdict
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request
from starlette.concurrency import run_in_threadpool

from backend.analysis.insights import build_insights
from backend.data.db import connect
from backend.data.import_apple_health import import_export
from backend.data.store import store

router = APIRouter(prefix="/api", tags=["insights"])

MAX_UPLOAD_BYTES = 2 * 1024**3  # 2 GB: big multi-year exports are a few hundred MB zipped
IMPORT_DB = Path(__file__).resolve().parents[1] / "data" / "apple_health.db"


@router.get("/insights")
def get_insights() -> dict:
    with store.connection() as conn:
        return build_insights(conn, store.clock, store.range_start)


def _import(path: Path) -> dict:
    conn = connect(os.environ.get("ROOTTRACE_IMPORT_DB", IMPORT_DB))
    try:
        summary = import_export(conn, path)
        conn.commit()
        return asdict(summary)
    finally:
        conn.close()


@router.post("/import/apple-health")
async def import_apple_health(request: Request, filename: str = "export.zip") -> dict:
    """Body: the raw bytes of export.zip or export.xml (not multipart). ?filename= gives the type."""
    suffix = Path(filename).suffix.lower()
    if suffix not in (".zip", ".xml"):
        raise HTTPException(400, "Upload export.zip or export.xml from the Health app")
    tmp_dir = Path(tempfile.mkdtemp(prefix="roottrace_import_"))
    path = tmp_dir / f"export{suffix}"
    try:
        size = 0
        with open(path, "wb") as fh:
            async for chunk in request.stream():
                size += len(chunk)
                if size > MAX_UPLOAD_BYTES:
                    raise HTTPException(413, "File is larger than 2 GB")
                fh.write(chunk)
        if size == 0:
            raise HTTPException(400, "The file is empty")
        try:
            summary = await run_in_threadpool(_import, path)
        except Exception as exc:  # zip without export.xml, broken XML, ...
            raise HTTPException(400, f"Could not read this export: {exc}") from exc
        summary["source_file"] = Path(filename).name
        return summary
    finally:
        shutil.rmtree(tmp_dir, ignore_errors=True)
