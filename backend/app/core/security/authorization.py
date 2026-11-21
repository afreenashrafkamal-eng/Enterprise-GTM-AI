from app.core.security.permissions import (
    ORGANIZATION_ROLE_PERMISSIONS,
    WORKSPACE_ROLE_PERMISSIONS,
)


def get_organization_permissions(roles: list[str]) -> set[str]:
    permissions = set()

    for role in roles:
        permissions.update(
            ORGANIZATION_ROLE_PERMISSIONS.get(role, set())
        )

    return permissions


def get_workspace_permissions(roles: list[str]) -> set[str]:
    permissions = set()

    for role in roles:
        permissions.update(
            WORKSPACE_ROLE_PERMISSIONS.get(role, set())
        )

    return permissions


def has_permission(
    user_permissions: set[str],
    required_permission: str,
) -> bool:
    return required_permission in user_permissions