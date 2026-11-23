# RootTrace — Git for Your Body

RootTrace turns wearable and phone health logs into honest, falsifiable experiments on yourself—backed by an AI that must cite immutable record IDs.

## Quick Start (Frontend Prototype — Ring 1)
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173`. Runs immediately on `contracts/sample_*.json` (`USE_MOCK = true` in `frontend/src/api.ts`). Flip `USE_MOCK = false` to connect to the FastAPI backend at `http://localhost:8000`.
