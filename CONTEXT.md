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

## Rules that make it trustworthy (never break these)

1. **The AI suggests, Python decides, the user approves.** Experiment outcomes are computed in Python against the locked criterion, never by the model.
2. **Every AI claim cites record IDs.** Python checks each ID exists and each number appears in a tool result from the same conversation (2% tolerance). Failing claims are dropped and counted in `dropped_claims`.
3. **Raw data never goes to the AI.** It gets scrubbed summaries only. Save exactly what was sent as `sent_to_ai`.
4. **Red-flag symptoms skip the AI** (chest pain, fainting, sudden severe headache, trouble breathing, one-sided weakness, self-harm) and show "See a doctor now, or call 112 in an emergency."
5. **Observations are never edited.** A bad reading is excluded with a reason, not changed.
6. **A locked success criterion never changes.** Enforce it in the database, not only in the UI.
7. **No diagnoses, no medicines, no doses.** If data is thin, say "not enough data yet" and what to log.
8. **Only generated demo data goes in the repo.** Never commit real health exports, `.env`, `*.db` or `node_modules/`.
9. **Every number shown to the user comes from Python.** Confidence percentages, averages and counts in the UI must be computed from records, not written by hand or by the model.

## Conventions

- The JSON shapes in `contracts/sample_*.json` are the source of truth. Change a shape only by editing the sample, `contracts/api.md` and both sides in the same pull request, and tell the team.
- `frontend/src/contracts/` holds copies of `contracts/`; keep them identical (`cmp` them before merging).
- Dates are ISO `YYYY-MM-DD`; times are ISO 8601 with `+05:30` where a time is shown.
- IDs follow the samples: `sl_0412` sleep, `hd_0031` headache, `wt_0210` water; `br_` branch, `ce_` change event, `exp_` experiment.
- Branch status colours: open teal, concluded/solved green, change event red, shared link purple (as in the frontend legend).
- One demo user. Demo range: 2026-08-25 to 2026-11-22.

## The demo story (the data must show this)

- Sleep is normal until **3 Nov**, then about **47 min** lower and stays there, while late screen time rises.
- 4 of the 5 headache days after 3 Nov came after nights under 6 hours. Water is low on some days: a weaker second explanation. At least one headache after a good night: a counterexample.
- An earlier October investigation is already concluded: "Caffeine after 4 PM cuts my sleep by about 30 min".
- A lights-out experiment runs from mid-November; with the demo clock advanced, sleep recovers and headaches stop.

## How to run (as the repo is today)

```bash
# frontend: from frontend/
npm install          # needed on each machine; node_modules must not be committed
npm run dev          # http://localhost:5173, mock data while USE_MOCK = true in src/api.ts

# backend: from the repo root (imports use the backend. package prefix)
python -m venv .venv && .venv\Scripts\activate      # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
uvicorn backend.main:app --reload                    # http://localhost:8000/docs
python -m pytest backend/tests
```

## Status on 24 Nov and what to fix first

Frontend (Satwik): builds cleanly (`tsc -b` and `vite build` pass) and the full demo path works on mock data: graph, investigation panel, record modal, ask box with the dropped-claim banner, "What the AI saw", demo clock.
Before the demo:
- `frontend/node_modules/` (about 8,500 files, built for Linux) is committed. Remove it from git with `git rm -r --cached frontend/node_modules`, commit, and everyone runs `npm install`.
- Fonts load from Google Fonts; download them into `frontend/public/fonts` so the app looks right on venue Wi-Fi or offline.
- The "Connected · 847" badge shows in mock mode too; show "Demo data" while `USE_MOCK` is true.
- Graph labels are very small at the default 45–57% zoom; raise the default zoom or the node font size so text is readable on a projector and in the video.
- Hypothesis confidence percentages in the mock (72%, 41%, 28%) must come from Python once the backend is live (rule 9).

Backend (currently `backend/main.py`, `schemas.py`, `generators/demo_data.py`):
- `GET /api/graph` returns `{observations, branches, evidence, experiments}`, which does **not** match `contracts/sample_graph.json` (`{range, trunk, change_events, branches, knowledge}`). Flipping `USE_MOCK = false` today would break the frontend. Make every route return the contract shape first.
- Missing routes: `GET /api/records/{id}`, `POST /api/experiments/{id}/lock`, `POST /api/demo/advance`, `POST /api/ask`, `GET /api/report/weekly`.
- No `CORSMiddleware` yet; the frontend at `http://localhost:5173` needs it.
- `database.py` and `models.py` are empty; there is no SQLite schema or lock trigger yet.
- Demo data covers 14 days with a generic sleep/energy drop; it needs the 90-day story above.
- The code lives in `backend/` directly, while the ownership section above names `backend/app/...` folders. Agree as a team: either move to `backend/app/` now, or keep `backend/` and put new modules in `backend/data/`, `backend/analysis/`, `backend/ai/`, `backend/privacy/`, `backend/integrations/` with the same owners.

## Working with AI coding tools

- Start every session by giving the tool this file and `contracts/api.md` (Claude Code reads `CLAUDE.md`, Codex reads `AGENTS.md`; Antigravity: attach this file).
- One feature per prompt. Ask for a plan first, approve it, then implement.
- Ask for tests and have the tool run them. Tests must mock Bedrock and ElevenLabs so they never spend credits.
- Never paste API keys into a chat. Keys live in a git-ignored `.env` only.
- Only edit your own area; ask the owner for changes elsewhere.
- Work on your own branch and merge to `main` through a pull request. Pull `main` before you start each session.
