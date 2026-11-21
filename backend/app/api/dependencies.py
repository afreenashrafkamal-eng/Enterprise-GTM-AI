from fastapi import HTTPException, Request, status


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