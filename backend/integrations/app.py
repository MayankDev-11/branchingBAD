"""Run RootTrace with the workspace, AI and integration routes enabled."""

from fastapi import APIRouter, Depends, FastAPI
from fastapi.routing import APIRoute

from backend.auth import auth_router, get_current_user
from backend.integrations.branches import router as workspace_router
from backend.integrations.routes import router
from backend.integrations.voice import router as voice_router
from backend.main import app as demo_app
from backend.routes import branches, experiments, insights

app = FastAPI(
    title=demo_app.title,
    description=demo_app.description,
    version=demo_app.version,
    middleware=list(demo_app.user_middleware),
    lifespan=demo_app.router.lifespan_context,
)
app.router.routes.extend(
    route for route in demo_app.router.routes if isinstance(route, APIRoute)
)
app.include_router(auth_router)

# Reuse the original handlers for endpoints that don't need workspace data.
demo_routes = APIRouter()
for source, paths in (
    (branches.router, {"/api/records/{record_id}"}),
    (experiments.router, {"/api/experiments/{experiment_id}/lock"}),
    (insights.router, {"/api/insights", "/api/import/apple-health"}),
):
    demo_routes.routes.extend(route for route in source.routes if route.path in paths)
app.include_router(demo_routes, dependencies=[Depends(get_current_user)])
app.include_router(workspace_router)
app.include_router(router)
app.include_router(voice_router)
