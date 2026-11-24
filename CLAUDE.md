@CONTEXT.md

## For Claude Code (Parikshit: data, analysis and the main API routes)

- Read `contracts/api.md` and every `contracts/sample_*.json` before changing a route. Responses must match those shapes exactly; the frontend depends on them.
- Stay in the data, analysis and route code. Don't edit `frontend/`, or Mayank's AI, privacy and integration code; ask instead.
- Use SQLite with plain `sqlite3` and pandas for analysis. Put the schema in a `.sql` file with the triggers that enforce rules 5 and 6.
- Run the tests after every change and add tests for change detection, the lock trigger and experiment evaluation.
- Show a plan before writing code, and work on a branch, not `main`.

### Next tasks, in order

1. Make `GET /api/graph` return the contract shape (`range`, `trunk`, `change_events`, `branches`, `knowledge`), and add `CORSMiddleware` for `http://localhost:5173`.
2. SQLite schema (9 tables) with the lock trigger and an "observations are immutable" trigger, plus tests.
3. A 90-day demo generator (fixed seed) that tells the demo story in `CONTEXT.md`, writing into SQLite.
4. `GET /api/branches/{id}` and `GET /api/records/{id}` from the database.
5. Baselines (30-day rolling median and MAD), change detection (5 of 7 days beyond 2 MADs, `ruptures` PELT for the start date, 14-day cooldown), and the pattern finder that returns counts with record IDs.
6. `POST /api/experiments/{id}/lock`, `POST /api/demo/advance`, and experiment evaluation (supported / not supported / insufficient data under 70% adherence or fewer than 7 days).
