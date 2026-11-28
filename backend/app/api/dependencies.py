from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.dependencies import get_db
from app.core.config.settings import settings
from app.models.organization import Organization
from app.models.organization_membership import OrganizationMembership
from app.models.user import User


LOCAL_ADMIN_PROVIDER_ID = "local-development-admin"


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
) -> User:
    # Local development defaults to a single-user workspace. Setting
    # GOOGLE_AUTH_REQUIRED=true opts the local app into the normal session flow.
    if settings.environment == "development" and not settings.google_auth_required:
        user = db.scalar(
            select(User).where(
                User.auth_provider == "local",
                User.auth_provider_user_id == LOCAL_ADMIN_PROVIDER_ID,
            )
        )
        if user is None:
            user = User(
                auth_provider="local",
                auth_provider_user_id=LOCAL_ADMIN_PROVIDER_ID,
                email="local-admin@localhost",
                email_verified=True,
                full_name="Local administrator",
                display_name="Local admin",
                status="active",
            )
            db.add(user)
            db.commit()
            db.refresh(user)
        return user

    session = request.scope.get("session")
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Install the authentication dependencies and restart the backend.",
        )

    user_id = session.get("user_id")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Sign in is required.",
        )

    user = db.get(User, user_id)
    if user is None or user.status != "active" or user.deleted_at is not None:
        session.clear()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Your sign-in is no longer active.",
        )

    return user


def ensure_organization_access(
    db: Session,
    user: User,
    organization_id: str,
) -> None:
    if (
        settings.environment == "development"
        and not settings.google_auth_required
        and user.auth_provider == "local"
    ):
        exists = db.scalar(
            select(Organization.id).where(
                Organization.id == organization_id,
                Organization.status == "active",
            )
        )
        if exists is not None:
            return

    membership = db.scalar(
        select(OrganizationMembership.id)
        .join(Organization, Organization.id == OrganizationMembership.organization_id)
        .where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == user.id,
            OrganizationMembership.status == "active",
            Organization.status == "active",
        )
    )
    if membership is None:
        # Do not disclose whether another user's organization exists.
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Organization not found.",
        )


def require_organization_access(
    organization_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> User:
    ensure_organization_access(db, current_user, organization_id)
    return current_user


def require_permission(required_permission: str):
    def permission_checker(request: Request):
        permissions = getattr(request.state, "permissions", set())

        if required_permission not in permissions:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Permission denied",
            )

        return True

    return permission_checker
