"""Response schema for the /me identity endpoint."""

from authentification.enums import OidcRole, UserOidcRole
from pydantic import BaseModel, Field


class IdentityResponse(BaseModel):
    """Normalized user identity derived from the validated access token."""

    userId: str
    email: str
    firstName: str | None = None
    lastName: str | None = None
    role: OidcRole | None = None


class IdentityListResponse(BaseModel):
    """Response model for users list."""

    users: list[IdentityResponse]


class UpdateRolesRequest(BaseModel):
    """Request model for updating user roles."""

    roles: list[UserOidcRole] = Field(min_length=1)


class UpdateRolesResponse(BaseModel):
    """Request model for updating user roles."""

    success: bool
    roles: list[UserOidcRole]
