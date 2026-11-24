import os
from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.auth import auth_router, get_current_user, init_auth_db
from backend.routes import branches, experiments, graph, insights

# Exact origins only: cookies are sent with allow_credentials, so never '*'.
FRONTEND_ORIGINS = list(dict.fromkeys(
    ["http://localhost:5173", "http://127.0.0.1:5173"]
    + [o.strip() for o in os.getenv("FRONTEND_ORIGINS", "").split(",") if o.strip()]
))


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_auth_db()
    yield


app = FastAPI(
    title="RootTrace API",
    description="Backend for RootTrace health intelligence platform",
    version="0.3.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=FRONTEND_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Satwik's sign-in routes: /api/auth/register, /login, /logout, /me, /demo.
app.include_router(auth_router)

# Parikshit's routes (contracts/api.md 1-5) need a signed-in session cookie.
# Mayank's /api/ask and /api/report/weekly plug in the same way.
signed_in = [Depends(get_current_user)]
app.include_router(graph.router, dependencies=signed_in)
app.include_router(branches.router, dependencies=signed_in)
app.include_router(experiments.router, dependencies=signed_in)
app.include_router(insights.router, dependencies=signed_in)


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
        "version": "0.3.0",
    }
