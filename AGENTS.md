# Instructions for coding agents

Read `CONTEXT.md` first. It holds the product summary, the rules, folder ownership, the API contract, the demo story and the current status. `contracts/api.md` and `contracts/sample_*.json` are the exact response shapes.

## For Codex (Mayank: AI, privacy, integrations)

- Stay in the AI, privacy and integration code. Don't edit the frontend or Parikshit's data, analysis and route code; ask instead.
- Model: Claude Haiku 4.5 on Amazon Bedrock via `boto3` `bedrock-runtime` `converse()`, region `ap-south-1`, model id from `.env` (`BEDROCK_MODEL_ID=in.anthropic.claude-haiku-4-5-20251001-v1:0`).
- The India inference profile doesn't support structured outputs. Force the answer format with a `submit_answer` tool whose input schema matches `contracts/sample_ask.json`.
- The model only receives scrubbed text and tool results: never raw rows, names, phone numbers, Aadhaar or PAN. Save the exact text sent as `sent_to_ai`.
- Drop any claim whose record IDs don't exist or whose numbers don't appear in a tool result from the same conversation (2% tolerance); count them in `dropped_claims`.
- Red-flag symptoms return the "see a doctor" response without calling the model.
- Tests must mock Bedrock and ElevenLabs. Read keys from `.env`; never hard-code or print them.
- Show a plan before writing code, and work on a branch, not `main`.

## For Antigravity (Satwik: frontend)

- Stay in `frontend/`. Keep `src/contracts/` identical to `contracts/`. Load data only through `src/api.ts`.
- The fixes listed under "Status on 24 Nov" in `CONTEXT.md` come first.
