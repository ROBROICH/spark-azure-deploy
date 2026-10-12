"""FastAPI dependency for populating the audit actor ContextVar."""

from __future__ import annotations

from authentification.dependencies import get_current_user
from authentification.models import OidcUserInfo
from fastapi import Depends

from audit_client.context import audit_identity_context


async def audit_actor_dependency(
    user: OidcUserInfo | None = Depends(get_current_user),
) -> None:
    with audit_identity_context(user):
        yield
