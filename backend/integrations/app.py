"""Run RootTrace with the AI and integration routes enabled."""

from backend.integrations.routes import router
from backend.main import app

app.include_router(router)
