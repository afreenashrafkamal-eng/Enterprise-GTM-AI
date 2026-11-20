from fastapi import FastAPI

from app.core.config.settings import settings
from app.api.routers.workspaces import router as workspaces_router


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
)


app.include_router(workspaces_router)


@app.get("/")
def root():
    return {
        "message": "Enterprise GTM AI API is running",
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }