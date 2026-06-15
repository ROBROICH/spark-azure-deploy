from collections.abc import Mapping
from typing import cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, computed_field

from authentification.enums import OidcRole, OidcRoles
from authentification.exceptions import InvalidTokenError


class OidcUserInfo(BaseModel):
    """Parsed OIDC token payload with realm roles and identity claims.

    Attributes:
        sub: User or service account ID.
        preferred_username: Human-readable username (optional).
        azp: Authorized party (client that requested token, optional).
        email: User email address from the token (optional).
        name: Full display name from the token (optional).
        given_name: First name from the token (optional).
        family_name: Last name from the token (optional).
    """

    model_config = ConfigDict(
        extra="ignore",
        frozen=True,
        str_strip_whitespace=True,
    )

    sub: str = Field(
        ...,
        description="User or service account ID",
    )
    preferred_username: str | None = Field(
        None,
        description="Human-readable username",
    )
    azp: str | None = Field(
        None,
        description="Authorized party (client)",
    )
    realm_roles: list[str] = Field([], description="Realm roles")
    email: str | None = Field(None, description="User email address")
    name: str | None = Field(None, description="Full display name")
    given_name: str | None = Field(None, description="First name")
    family_name: str | None = Field(None, description="Last name")
    enabled: bool = Field(True, description="Enabled")

    @computed_field
    @property
    def role(self) -> OidcRole | None:
        """Application role derived from OIDC realm roles."""
        roles = set(self.realm_roles)
        if OidcRoles.ADMIN in roles:
            return OidcRoles.ADMIN
        if OidcRoles.USER in roles:
            return OidcRoles.USER
        if OidcRoles.SERVICE in roles:
            return OidcRoles.SERVICE
        return None

    @classmethod
    def from_payload(cls, payload: dict[str, object]) -> "OidcUserInfo":
        """Create instance from decoded JWT payload.

        Args:
            payload: Decoded JWT dictionary.

        Returns:
            User info from an OIDC token as Pydantic model.
        """
        sub = payload.get("sub")
        if not isinstance(sub, str) or not sub:
            raise InvalidTokenError("Missing 'sub' in token")

        # Verify string is UUID but still use string because of JSON serialization
        try:
            UUID(sub)
        except ValueError as e:
            raise InvalidTokenError(f"Could not convert 'sub' to UUID: {sub}") from e

        realm_access = payload.get("realm_access")
        realm_roles: list[str] = []
        if isinstance(realm_access, Mapping):
            roles = realm_access.get("roles", [])
            if isinstance(roles, list):
                realm_roles = [role for role in roles if isinstance(role, str)]

        enabled = payload.get("enabled", True)
        if not isinstance(enabled, bool):
            enabled = True

        return cls(
            sub=sub,
            preferred_username=cast(str | None, payload.get("preferred_username")),
            azp=cast(str | None, payload.get("azp")),
            realm_roles=realm_roles,
            email=cast(str | None, payload.get("email")),
            name=cast(str | None, payload.get("name")),
            given_name=cast(str | None, payload.get("given_name")),
            family_name=cast(str | None, payload.get("family_name")),
            enabled=enabled,
        )

    @classmethod
    def from_list_payload(cls, payload: list[dict[str, object]]) -> list["OidcUserInfo"]:
        """Create instances from a provider users-list payload.

        The token payload uses OIDC claim names like `sub`, `given_name`, and
        `family_name`. Provider Admin APIs can return `id`, `firstName`, and
        `lastName` instead. This reconciles that list shape before using the shared
        token-payload normalization.

        Args:
            payload: Response body from the provider users endpoint.

        Returns:
            User info objects as Pydantic models.
        """
        users = []
        for user_payload in payload:
            users.append(
                cls.from_payload(
                    {
                        **user_payload,
                        "sub": user_payload.get("id"),
                        "name": user_payload.get("username"),
                        "given_name": user_payload.get("firstName"),
                        "family_name": user_payload.get("lastName"),
                    }
                )
            )
        return users
