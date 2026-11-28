import secrets
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.base import BaseHTTPMiddleware

try:
    from starlette.middleware.sessions import SessionMiddleware
except (ImportError, RuntimeError):
    SessionMiddleware = None

from app.core.config.settings import settings
from app.api.auth import router as auth_router
from app.api.routers.workspaces import router as workspaces_router
from app.api.organizations import router as organizations_router
from app.api.company_profiles import router as company_profiles_router
from app.api.company_research import router as company_research_router
from app.api.marketing_intelligence import router as marketing_intelligence_router
from app.api.prospect_agent import router as prospect_agent_router
from app.api.ideal_customer_profiles import (
    router as ideal_customer_profiles_router,
)
from app.api.target_accounts import router as target_accounts_router
from app.api.target_contacts import router as target_contacts_router
from app.api.call_activities import router as call_activities_router
from app.api.outbound_strategies import router as outbound_strategies_router
from app.api.crm_integrations import router as crm_integrations_router
from app.api.prospect_data_integrations import router as prospect_data_integrations_router
from app.api.phone_integrations import router as phone_integrations_router, stream_router as phone_stream_router


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    debug=settings.debug,
    docs_url=None if settings.environment == "production" else "/docs",
    redoc_url=None if settings.environment == "production" else "/redoc",
    openapi_url=None if settings.environment == "production" else "/openapi.json",
)

FRONTEND_DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
FRONTEND_INDEX = FRONTEND_DIST / "index.html"

if settings.environment == "production":
    if settings.debug:
        raise RuntimeError("DEBUG must be false in production.")
    if len(settings.session_secret) < 32:
        raise RuntimeError("SESSION_SECRET must be at least 32 characters in production.")
    if len(settings.gmail_token_encryption_key) < 32:
        raise RuntimeError("GMAIL_TOKEN_ENCRYPTION_KEY must be at least 32 characters in production.")
    if not settings.google_client_id or not settings.google_client_secret:
        raise RuntimeError("Google sign-in credentials must be configured in production.")
    if not settings.frontend_url.startswith("https://") or not settings.oauth_redirect_uri.startswith("https://"):
        raise RuntimeError("FRONTEND_URL and GOOGLE_REDIRECT_URI must use HTTPS in production.")
    if SessionMiddleware is None:
        raise RuntimeError("Install itsdangerous to enable authenticated sessions.")

if SessionMiddleware is not None:
    app.add_middleware(
        SessionMiddleware,
        secret_key=settings.session_secret or secrets.token_urlsafe(32),
        session_cookie="enterprise_gtm_session",
        max_age=60 * 60 * 24 * 14,
        same_site="lax",
        https_only=settings.environment == "production",
    )

cors_origins = {settings.frontend_url.rstrip("/")}
if settings.environment != "production":
    cors_origins.update(
        f"http://{host}:{port}"
        for host in ("localhost", "127.0.0.1")
        for port in range(5173, 5178)
    )
cors_origins.update(
    origin.strip().rstrip("/")
    for origin in settings.additional_cors_origins.split(",")
    if origin.strip()
)
if settings.environment == "production" and any(not origin.startswith("https://") for origin in cors_origins):
    raise RuntimeError("All production CORS origins must use HTTPS.")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
        if settings.environment == "production":
            response.headers.setdefault("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
        return response


app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=sorted(cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(workspaces_router)
app.include_router(auth_router)
app.include_router(organizations_router)
app.include_router(company_profiles_router)
app.include_router(company_research_router)
app.include_router(marketing_intelligence_router)
app.include_router(prospect_agent_router)
app.include_router(ideal_customer_profiles_router)
app.include_router(target_accounts_router)
app.include_router(target_contacts_router)
app.include_router(call_activities_router)
app.include_router(outbound_strategies_router)
app.include_router(crm_integrations_router)
app.include_router(prospect_data_integrations_router)
app.include_router(phone_integrations_router)
app.include_router(phone_stream_router)


@app.get("/")
def root():
    if FRONTEND_INDEX.is_file():
        return FileResponse(FRONTEND_INDEX)
    return {
        "message": "Enterprise GTM AI API is running",
        "app_name": settings.app_name,
        "version": settings.app_version,
        "environment": settings.environment,
    }


@app.get("/health")
def health():
    return {"status": "ok"}


class SpaStaticFiles(StaticFiles):
    """Serve the React app for client-side routes while preserving API 404s."""

    async def get_response(self, path: str, scope):
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as error:
            if error.status_code != 404:
                raise
            api_prefixes = ("auth", "organizations", "workspaces", "calls")
            if any(path == prefix or path.startswith(f"{prefix}/") for prefix in api_prefixes):
                raise
            if FRONTEND_INDEX.is_file():
                return await super().get_response("index.html", scope)
            raise


if FRONTEND_DIST.is_dir():
    # Registered last so API routes take precedence over the SPA catch-all.
    app.mount("/", SpaStaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
