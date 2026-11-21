# Organization-level permissions
ORG_OWNER = "organization:owner"
ORG_ADMIN = "organization:admin"
ORG_BILLING_ADMIN = "organization:billing_admin"
ORG_SECURITY_ADMIN = "organization:security_admin"
ORG_VIEWER = "organization:viewer"

# Workspace-level permissions
WORKSPACE_ADMIN = "workspace:admin"
WORKSPACE_MANAGER = "workspace:manager"
WORKSPACE_MEMBER = "workspace:member"
WORKSPACE_VIEWER = "workspace:viewer"

# Organization role permission mapping
ORGANIZATION_ROLE_PERMISSIONS = {
    "Owner": {
        "organization:manage",
        "organization:delete",
        "organization:manage_members",
        "organization:manage_roles",
        "organization:manage_billing",
        "organization:manage_security",
        "workspace:create",
        "workspace:manage",
    },
    "Organization Admin": {
        "organization:manage",
        "organization:manage_members",
        "organization:manage_roles",
        "workspace:create",
        "workspace:manage",
    },
    "Billing Admin": {
        "organization:manage_billing",
        "billing:view",
    },
    "Security Admin": {
        "organization:manage_security",
        "security:audit:view",
        "security:manage_sessions",
    },
    "Organization Viewer": {
        "organization:view",
    },
}

# Workspace role permission mapping
WORKSPACE_ROLE_PERMISSIONS = {
    "Workspace Admin": {
        "workspace:view",
        "workspace:manage",
        "workspace:manage_members",
        "workspace:manage_roles",
        "workspace:data:view",
        "workspace:data:create",
        "workspace:data:edit",
        "workspace:data:delete",
    },
    "Manager": {
        "workspace:view",
        "workspace:manage_campaigns",
        "workspace:data:view",
        "workspace:data:create",
        "workspace:data:edit",
        "workspace:reports:view",
    },
    "Member": {
        "workspace:view",
        "workspace:data:view",
        "workspace:data:create",
        "workspace:data:edit",
    },
    "Viewer": {
        "workspace:view",
        "workspace:data:view",
        "workspace:reports:view",
    },
}