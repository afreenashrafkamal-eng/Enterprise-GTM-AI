from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config.settings import settings
from app.api.routers.workspaces import router as workspaces_router
from app.api.organizations import router as organizations_router
from app.api.company_profiles import router as company_profiles_router
from app.api.company_research import router as company_research_router
from app.api.ideal_customer_profiles import (
    router as ideal_customer_profiles_router,
)
from app.api.target_accounts import router as target_accounts_router


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workspaces_router)
app.include_router(organizations_router)
app.include_router(company_profiles_router)
app.include_router(company_research_router)
app.include_router(ideal_customer_profiles_router)
app.include_router(target_accounts_router)


@app.get("/")
def root():
    return {
        "message": "Enterprise GTM AI API is running",
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }