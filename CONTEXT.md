# RootTrace — Shared Project Context & API Contract

## Product Summary
RootTrace turns wearable and phone health logs into honest, falsifiable self-experiments with an evidence-constrained AI layer.
- **Core Rule:** Python computes baselines, change points, and experiment outcomes. Claude Haiku 4.5 on Amazon Bedrock (`ap-south-1`, Mumbai) explains results and drafts 2–3 ranked hypotheses using 6 read-only tools. Python validates every cited record ID before rendering; uncited claims are dropped.
- **Privacy Pitch:** Your raw data never goes to the AI. Personal details are scrubbed locally via Presidio before Bedrock, Bedrock Guardrails run in Mask mode, and users can inspect "What the AI saw" beside every answer.

## Folder Ownership (Never Edit Another Person's Folder)
- **Satwik (`frontend/`):** React + Vite + TypeScript + `@xyflow/react` + Tailwind + Framer Motion + `lucide-react`.
- **Parikshit (`backend/app/data/`, `backend/app/analysis/`, `backend/app/routes/`):** SQLite (9 tables + `lock_criterion` trigger), 90-day demo dataset (`seed=42`), pandas baselines, `ruptures` PELT change detection, FastAPI routes.
- **Mayank (`backend/app/ai/`, `backend/app/privacy/`, `backend/app/integrations/`):** Bedrock Converse loop (`in.anthropic.claude-haiku-4-5-20251001-v1:0`), `submit_answer` tool schema, Presidio PII scrubbing, red-flag keyword gate, citation validator, ElevenLabs TTS, Obsidian export.
- **Presenter (`docs/`):** PPT, video, pitch script, Q&A prep.

## API Contract (`http://localhost:8000`, CORS allow `http://localhost:5173`)
1. `GET /api/graph` — Trunk series, change events, branches (`open|concluded|inconclusive`), merged knowledge nodes.
2. `GET /api/branches/{id}` — Full branch detail: question, triggering change event, ranked hypotheses, locked experiment, evidence list.
3. `GET /api/records/{id}` — Raw record provenance: value, unit, date, time, device, source_id, source_file, data_quality, normalization.
4. `POST /api/experiments/{id}/lock` — Locks `success_criterion` via SQLite trigger; returns updated experiment.
5. `POST /api/demo/advance` — Body `{"days": 10}` → fast-forwards demo clock and returns updated graph payload.
6. `POST /api/ask` — Body `{"branch_id": "br_1" | null, "question": "..."}` → returns `red_flag`, `hypotheses`, `dropped_claims`, `sent_to_ai`.
7. `GET /api/report/weekly` — Returns 5-line cited report + cached ElevenLabs `audio_url`.

See `contracts/api.md` and `contracts/sample_*.json` for exact JSON shapes.
