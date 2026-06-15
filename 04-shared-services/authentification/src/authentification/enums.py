from enum import StrEnum
from typing import Literal

type UserOidcRole = Literal["admin", "user"]
type OidcRole = Literal["admin", "user", "service"]


class AuthMode(StrEnum):
    DISABLED = "disabled"

    # verify first, fall back to unverified decode for dry-run only
    OPTIONAL_VERIFY_DRY_RUN = "optional_verify_dry_run"

    # token optional, but verified if present
    OPTIONAL_VERIFY = "optional_verify"

    # token required and verified
    STRICT = "strict"


class Permission(StrEnum):
    """SpiceDB permission names."""

    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    READ = "read"
    EXECUTE = "execute"
    ASSIGN = "assign"
    AUDIT = "audit"
    EXPORT = "export"
    APPROVE = "approve"


class Resource(StrEnum):
    """Enum for resource types"""

    PROJECT = "project"
    WORKFLOW = "workflow"
    USER = "user"
    GROUP = "group"


class Subject(StrEnum):
    """Enum for subject types"""

    USER = "user"
    GROUP = "group"


class Relation(StrEnum):
    """Enum for relationship types"""

    OWNER = "owner"
    MEMBER = "member"
    AUDITOR = "auditor"


class OidcRoles:
    """Application realm roles from the OIDC provider."""

    ADMIN: Literal["admin"] = "admin"
    USER: Literal["user"] = "user"
    SERVICE: Literal["service"] = "service"
