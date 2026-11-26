import os
from contextlib import asynccontextmanager

from fastapi import APIRouter, Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from backend.auth import auth_router, get_current_user, init_auth_db
from backend.integrations.branches import router as workspace_router
from backend.integrations.routes import router as integrations_router
from backend.integrations.voice import router as voice_router
from backend.routes import branches, experiments, insights

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


@app.middleware("http")
async def add_api_no_store_header(request: Request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


# Sign-in routes: /api/auth/register, /login, /logout, /me, /demo.
app.include_router(auth_router)

# Mount workspace_router before core fallback routes so /api/branches/history,
# /api/graph, and /api/demo/* resolve cleanly without path shadowing.
app.include_router(workspace_router)
app.include_router(integrations_router)
app.include_router(voice_router)

core_routes = APIRouter()
for source, paths in (
    (branches.router, {"/api/records/{record_id}"}),
    (experiments.router, {"/api/experiments/{experiment_id}/lock"}),
    (insights.router, {"/api/insights", "/api/import/apple-health"}),
):
    core_routes.routes.extend(route for route in source.routes if route.path in paths)
app.include_router(core_routes, dependencies=[Depends(get_current_user)])


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
