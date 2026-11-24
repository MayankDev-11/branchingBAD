# RootTrace API Contract

Base URL (local): `http://localhost:8000`
Frontend dev origin (add to FastAPI CORSMiddleware): `http://localhost:5173`

## Endpoints
- `GET /api/graph` -> matches `contracts/sample_graph.json`
- `GET /api/branches/{id}` -> matches `contracts/sample_branch.json`
- `GET /api/records/{id}` -> matches `contracts/sample_record.json`
- `POST /api/experiments/{id}/lock` -> locks `success_criterion`, sets `locked=true`, `locked_at`
- `POST /api/demo/advance` -> body `{"days": number}`, returns updated `GET /api/graph` shape
- `POST /api/ask` -> body `{"branch_id": string | null, "question": string}`, returns `contracts/sample_ask.json` shape
- `GET /api/report/weekly` -> returns `{ "lines": [{ "text": string, "record_ids": string[] }], "audio_url": string }`
- `GET /api/insights` -> matches `contracts/sample_insights.json` (lists shortened in the sample). Every number on the Insights, Profile and Data & help pages: the sleep shift and its normal range, the last 28 days with record ids, weekly late screen time, all hypotheses with k/n/j/m, the running experiment night by night, and record counts per metric, source and week.
- `POST /api/import/apple-health?filename=export.zip` -> body is the raw file (export.zip or export.xml, up to 2 GB, not multipart). Runs the Apple Health importer into its own database (`backend/data/apple_health.db`), never the demo one. Returns the import summary: `source_file`, `records_read`, `records_used`, `records_skipped`, `profile_skipped`, `raw_inserted`, `observations` (`{metric: days}`), `excluded`, `already_present`, `first_date`, `last_date`. 400 for other file types or unreadable exports.

All `/api/*` data routes need the signed-in session cookie (`roottrace_session`) from `/api/auth/*`.
