import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.dependencies import get_current_user
from app.core.config.settings import settings
from app.core.gmail import decrypt_token, encrypt_token
from app.db.dependencies import get_db
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.organization_role import OrganizationRole
from app.models.gmail_credential import GmailCredential
from app.models.user import User

try:
    from authlib.integrations.starlette_client import OAuth
except ImportError:  # The UI can explain that the optional auth dependency is missing.
    OAuth = None

try:
    import itsdangerous  # noqa: F401
except ImportError:
    SESSION_DEPENDENCY_AVAILABLE = False
else:
    SESSION_DEPENDENCY_AVAILABLE = True


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentication"])
oauth = OAuth() if OAuth is not None else None

if oauth is not None and settings.google_client_id and settings.google_client_secret:
    oauth.register(
        name="google",
        client_id=settings.google_client_id,
        client_secret=settings.google_client_secret,
        server_metadata_url="https://accounts.google.com/.well-known/openid-configuration",
        client_kwargs={"scope": "openid email profile"},
    )


class CurrentUserResponse(BaseModel):
    id: str
    email: str
    full_name: str | None
    display_name: str | None


def google_is_configured() -> bool:
    return bool(
        oauth is not None
        and SESSION_DEPENDENCY_AVAILABLE
        and settings.google_client_id
        and settings.google_client_secret
    )


def _frontend_redirect(error: str | None = None) -> RedirectResponse:
    url = settings.frontend_url.rstrip("/") + "/"
    if error:
        url += f"?auth_error={error}"
    return RedirectResponse(url=url, status_code=status.HTTP_303_SEE_OTHER)


def _provision_user(db: Session, claims: dict) -> User:
    subject = claims.get("sub")
    email = claims.get("email")
    email_verified = claims.get("email_verified")

    if not isinstance(subject, str) or not subject:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Google did not return a valid account identifier.",
        )
    if not isinstance(email, str) or not email or email_verified is not True:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Use a Google account with a verified email address.",
        )

    user = db.scalar(
        select(User).where(
            User.auth_provider == "google",
            User.auth_provider_user_id == subject,
        )
    )
    first_google_user = db.scalar(
        select(User.id)
        .where(User.auth_provider == "google")
        .limit(1)
    ) is None

    if user is None:
        user = User(
            auth_provider="google",
            auth_provider_user_id=subject,
            email=email,
            email_verified=True,
            full_name=claims.get("name"),
            display_name=claims.get("given_name") or claims.get("name"),
            avatar_url=claims.get("picture"),
            status="active",
        )
        db.add(user)
        db.flush()
    else:
        if user.status != "active" or user.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="This account is not active.",
            )
        user.email = email
        user.email_verified = True
        user.full_name = claims.get("name")
        user.display_name = claims.get("given_name") or claims.get("name")
        user.avatar_url = claims.get("picture")

    # On the first Google sign-in, assign existing local demo organizations to
    # the initial owner so existing prototype data remains available privately.
    if first_google_user and settings.environment == "development":
        for organization in db.scalars(select(Organization)).all():
            membership_exists = db.scalar(
                select(OrganizationMembership.id)
                .where(
                    OrganizationMembership.organization_id == organization.id,
                )
                .limit(1)
            )
            if membership_exists:
                continue

            membership = OrganizationMembership(
                organization_id=organization.id,
                user_id=user.id,
                status="active",
            )
            db.add(membership)
            db.flush()
            db.add(
                OrganizationRole(
                    organization_membership_id=membership.id,
                    role="Owner",
                    assigned_by_user_id=user.id,
                )
            )

    db.commit()
    db.refresh(user)
    return user


@router.get("/google/status")
def google_status(response: Response):
    response.headers["Cache-Control"] = "no-store, max-age=0"
    return {
        "configured": google_is_configured(),
        "authentication_required": settings.google_auth_required,
        "dependency_installed": oauth is not None and SESSION_DEPENDENCY_AVAILABLE,
        "credentials_present": bool(
            settings.google_client_id and settings.google_client_secret
        ),
    }


@router.get("/google/login")
async def google_login(request: Request):
    if not google_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google sign-in is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env.",
        )

    assert oauth is not None
    google = oauth.create_client("google")
    return await google.authorize_redirect(
        request,
        settings.oauth_redirect_uri,
    )


@router.get("/google/gmail/connect")
async def google_gmail_connect(
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """Start a separate, send-only Gmail authorization flow."""
    if not google_is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth is not configured.",
        )

    assert oauth is not None
    request.session["gmail_link_user_id"] = current_user.id
    google = oauth.create_client("google")
    return await google.authorize_redirect(
        request,
        settings.oauth_redirect_uri,
        scope="openid email profile https://www.googleapis.com/auth/gmail.send",
        access_type="offline",
        prompt="consent",
        include_granted_scopes="true",
    )


@router.get("/google/gmail/status")
def google_gmail_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    connection = db.scalar(
        select(GmailCredential).where(GmailCredential.user_id == current_user.id)
    )
    if not connection or (connection.expires_at <= datetime.now(timezone.utc) and not connection.refresh_token_encrypted):
        return {"connected": False, "email": None}
    try:
        decrypt_token(connection.access_token_encrypted)
        if connection.refresh_token_encrypted:
            decrypt_token(connection.refresh_token_encrypted)
    except RuntimeError:
        return {"connected": False, "email": None}
    return {"connected": True, "email": connection.email}


@router.get("/email/sender/status")
def email_sender_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    provider = settings.outbound_email_provider.strip().lower()
    if provider == "gmail":
        connection = db.scalar(
            select(GmailCredential).where(GmailCredential.user_id == current_user.id)
        )
        if connection:
            try:
                decrypt_token(connection.access_token_encrypted)
                if connection.refresh_token_encrypted:
                    decrypt_token(connection.refresh_token_encrypted)
                return {"provider": "gmail", "connected": True, "email": connection.email}
            except RuntimeError:
                pass
        return {"provider": "gmail", "connected": False, "email": None}
    if provider == "smtp":
        ready = all((settings.smtp_host, settings.smtp_username, settings.smtp_password, settings.smtp_from_email))
        return {
            "provider": "smtp",
            "connected": bool(ready),
            "email": settings.smtp_from_email if ready else None,
        }
    return {"provider": provider, "connected": False, "email": None}


@router.post("/google/gmail/disconnect", status_code=status.HTTP_204_NO_CONTENT)
def google_gmail_disconnect(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    db.query(GmailCredential).filter(GmailCredential.user_id == current_user.id).delete()
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/google/callback", name="google_callback")
async def google_callback(
    request: Request,
    db: Session = Depends(get_db),
):
    if not google_is_configured():
        return _frontend_redirect("google_not_configured")

    assert oauth is not None
    google = oauth.create_client("google")
    try:
        token = await google.authorize_access_token(request)
    except Exception:
        logger.exception("Google OAuth callback failed")
        return _frontend_redirect("google_login_failed")

    claims = token.get("userinfo")
    if not isinstance(claims, dict):
        return _frontend_redirect("google_profile_unavailable")

    gmail_user_id = request.session.pop("gmail_link_user_id", None)
    if gmail_user_id:
        email = claims.get("email")
        access_token = token.get("access_token")
        if (
            not isinstance(email, str)
            or not email
            or claims.get("email_verified") is not True
            or not isinstance(access_token, str)
        ):
            return _frontend_redirect("gmail_connection_failed")
        expires_at = token.get("expires_at")
        if not isinstance(expires_at, (int, float)):
            expires_at = datetime.now(timezone.utc).timestamp() + float(token.get("expires_in", 3600))
        credential = db.scalar(
            select(GmailCredential).where(GmailCredential.user_id == gmail_user_id)
        )
        if credential is None:
            credential = GmailCredential(user_id=gmail_user_id, email=email)
            db.add(credential)
        try:
            credential.email = email
            credential.access_token_encrypted = encrypt_token(access_token)
            credential.expires_at = datetime.fromtimestamp(float(expires_at), tz=timezone.utc)
            refresh_token = token.get("refresh_token")
            if isinstance(refresh_token, str) and refresh_token:
                credential.refresh_token_encrypted = encrypt_token(refresh_token)
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Could not save encrypted Gmail credentials")
            return _frontend_redirect("gmail_connection_failed")
        return RedirectResponse(
            url=settings.frontend_url.rstrip("/") + "/?gmail_connected=1",
            status_code=status.HTTP_303_SEE_OTHER,
        )

    try:
        user = _provision_user(db, claims)
    except HTTPException as error:
        db.rollback()
        if error.status_code == status.HTTP_403_FORBIDDEN:
            return _frontend_redirect("google_email_not_verified")
        return _frontend_redirect("google_profile_unavailable")

    request.session.clear()
    request.session["user_id"] = user.id
    return _frontend_redirect()


@router.get("/me", response_model=CurrentUserResponse)
def who_am_i(current_user: User = Depends(get_current_user)):
    return CurrentUserResponse(
        id=current_user.id,
        email=current_user.email,
        full_name=current_user.full_name,
        display_name=current_user.display_name,
    )


@router.post(
    "/logout",
    status_code=status.HTTP_204_NO_CONTENT,
    response_class=Response,
)
def logout(request: Request) -> Response:
    session = request.scope.get("session")
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Install the authentication dependencies and restart the backend.",
        )
    session.clear()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
