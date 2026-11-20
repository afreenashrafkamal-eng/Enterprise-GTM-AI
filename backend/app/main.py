from fastapi import FastAPI
from app.core.config.settings import settings

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
)

@app.get("/")
def root():
    return {
        "message": "Enterprise GTM AI API is running",
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }
