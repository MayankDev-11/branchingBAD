@CONTEXT.md

## For Claude Code (Parikshit: data, analysis and the main API routes)

- Read `contracts/api.md` and every `contracts/sample_*.json` before changing a route. Responses must match those shapes exactly; the frontend depends on them.
- Stay in the data, analysis and route code. Don't edit `frontend/`, or Mayank's AI, privacy and integration code; ask instead.
- Use SQLite with plain `sqlite3` and pandas for analysis. Put the schema in a `.sql` file with the triggers that enforce rules 5 and 6.
- Run the tests after every change and add tests for change detection, the lock trigger and experiment evaluation.
- Show a plan before writing code, and work on a branch, not `main`.

### Status (24 Nov): tasks 1-6 done on branch `data`

Layout (kept in `backend/`, not `backend/app/`): `backend/data/` (schema.sql, generate_demo.py, store.py, queries.py, metrics.py), `backend/analysis/` (baselines, change_detection, patterns, experiments, state), `backend/routes/` (graph, branches, experiments). The demo DB is rebuilt from seed 42 on first request; the demo clock starts on 2026-11-20. Windows: build `.venv` with Python 3.12 (ruptures has no 3.14 wheel).

Functions for Mayank's six AI tools: `queries.build_branch` (get_branch), `patterns.summarize_metric`, `patterns.compare_periods`, `patterns.find_patterns` (via `state.branch_patterns`), `baselines.get_baseline`, `queries.get_records`.

Apple Health importer done: `python -m backend.data.import_apple_health export.zip --db backend/data/apple_health.db --detect` (writes its own git-ignored DB, never the demo one).

### Next tasks, in order

1. Help Mayank wire his tools to the functions above; help Satwik flip `USE_MOCK` to false.
2. When the login work (landing page, `/auth`, `backend/app/auth/`) is pushed: mount its `auth_router` in `backend/main.py` and drop its `protected_dashboard.py` (it serves the sample JSON on the same `/api/graph`, `/api/branches`, `/api/records` paths as the real routes). Tested locally on 24 Nov: works with the real backend through the Vite `/api` proxy.
