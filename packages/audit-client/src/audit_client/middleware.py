"""Audit context middleware.

Reads the four audit headers from every request into ``request.state``.
Handlers retrieve the context via ``audit_context_kwargs(request)`` and
splat it into :func:`record_audit_entry`. Pass ``actor_user_id`` explicitly
(from ``user.sub`` via the auth dependency) to set the actor directly.
Service-to-service workflow calls set the workflow headers via
:mod:`audit_client.forwarding`. Malformed UUIDs degrade silently to
``None`` — audit attribution is best-effort, not a request-blocking concern.
"""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import TypedDict
from uuid import UUID

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from audit_client.context import (
    AuditContext,
    audit_context_scope,
    bearer_token_ctx,
    current_audit_context,
    parse_audit_headers,
)


class AuditContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        forwarded = parse_audit_headers(request.headers)
        request.state.audit_context = forwarded
        request.state.actor_user_id = forwarded.actor_user_id
        request.state.triggered_by_user_id = forwarded.triggered_by_user_id
        request.state.workflow_run_id = forwarded.workflow_run_id
        request.state.workflow_type = forwarded.workflow_type
        request.state.request_start_time = forwarded.request_start_time
        request.state.request_id = forwarded.request_id

        auth_header = request.headers.get("Authorization", "")
        raw_token = auth_header.removeprefix("Bearer ") if auth_header.startswith("Bearer ") else None
        bearer_ctx_token = bearer_token_ctx.set(raw_token)
        try:
            with audit_context_scope(forwarded=forwarded):
                return await call_next(request)
        finally:
            bearer_token_ctx.reset(bearer_ctx_token)


class AuditContextKwargs(TypedDict):
    actor_user_id: UUID | None
    triggered_by_user_id: UUID | None
    workflow_run_id: str | None
    workflow_type: str | None


def audit_context_kwargs(request: Request | None) -> AuditContextKwargs:
    """Extract the audit context kwargs for splatting into ``record_audit_entry``."""
    if request is None:
        return {
            "actor_user_id": None,
            "triggered_by_user_id": None,
            "workflow_run_id": None,
            "workflow_type": None,
        }
    forwarded = getattr(request.state, "audit_context", None)
    if isinstance(forwarded, AuditContext):
        # Middleware-derived request state is forwarded context; normalized auth
        # installed later remains the active, higher-precedence attribution.
        resolved = current_audit_context()
    else:
        # Preserve the pre-context-package surface for manually constructed
        # requests that set the four legacy state fields themselves.
        legacy_explicit = AuditContext(
            actor_user_id=getattr(request.state, "actor_user_id", None),
            triggered_by_user_id=getattr(request.state, "triggered_by_user_id", None),
            workflow_run_id=getattr(request.state, "workflow_run_id", None),
            workflow_type=getattr(request.state, "workflow_type", None),
        )
        resolved = current_audit_context(explicit=legacy_explicit)
    return {
        "actor_user_id": resolved.actor_user_id,
        "triggered_by_user_id": resolved.triggered_by_user_id,
        "workflow_run_id": resolved.workflow_run_id,
        "workflow_type": resolved.workflow_type,
    }
