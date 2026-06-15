"""FastAPI dependency for populating the audit actor ContextVar."""

from __future__ import annotations

from uuid import UUID

from authentification.dependencies import get_current_user
from authentification.models import OidcUserInfo
from fastapi import Depends

from audit_client.forwarding import actor_user_id_ctx


async def audit_actor_dependency(
    user: OidcUserInfo | None = Depends(get_current_user),
) -> None:
    token = actor_user_id_ctx.set(UUID(user.sub) if user else None)
    yield
    actor_user_id_ctx.reset(token)
