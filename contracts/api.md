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
