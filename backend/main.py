from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.routes import branches, experiments, graph

FRONTEND_ORIGINS = ["http://localhost:5173"]

app = FastAPI(
    title="RootTrace API",
    description="Backend for RootTrace health intelligence platform",
    version="0.2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Parikshit's routes (contracts/api.md 1-5). Mayank's /api/ask and /api/report/weekly plug in here too.
app.include_router(graph.router)
app.include_router(branches.router)
app.include_router(experiments.router)


@app.get("/")
def root():
    return {
        "message": "Welcome to RootTrace API",
        "status": "running",
    }


@app.get("/health")
def health_check():
    return {
        "status": "healthy",
        "project": "RootTrace",
        "version": "0.2.0",
    }
