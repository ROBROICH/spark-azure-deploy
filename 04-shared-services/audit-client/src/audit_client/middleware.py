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
from datetime import UTC, datetime
from typing import TypedDict
from uuid import UUID

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response
from starlette.types import ASGIApp

from audit_client.forwarding import (
    HEADER_ACTOR_USER_ID,
    HEADER_REQUEST_ID,
    HEADER_REQUEST_START_TIME,
    HEADER_TRIGGERED_BY_USER_ID,
    HEADER_WORKFLOW_RUN_ID,
    HEADER_WORKFLOW_TYPE,
    actor_user_id_ctx,
    audit_headers_ctx,
    bearer_token_ctx,
    request_id_ctx,
    request_start_time_ctx,
)


def _parse_uuid(value: str | None) -> UUID | None:
    if value is None:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


def _parse_start_time(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        pass
    try:
        return datetime.fromtimestamp(int(value) / 1000, tz=UTC)
    except ValueError:
        pass
    return None


class AuditContextMiddleware(BaseHTTPMiddleware):
    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(
        self,
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        request.state.actor_user_id = _parse_uuid(request.headers.get(HEADER_ACTOR_USER_ID))
        request.state.triggered_by_user_id = _parse_uuid(request.headers.get(HEADER_TRIGGERED_BY_USER_ID))
        request.state.workflow_run_id = request.headers.get(HEADER_WORKFLOW_RUN_ID)
        request.state.workflow_type = request.headers.get(HEADER_WORKFLOW_TYPE)

        raw_start_time = request.headers.get(HEADER_REQUEST_START_TIME)
        parsed_start_time = _parse_start_time(raw_start_time)
        raw_request_id = request.headers.get(HEADER_REQUEST_ID)
        request.state.request_start_time = parsed_start_time
        request.state.request_id = raw_request_id

        auth_header = request.headers.get("Authorization", "")
        raw_token = auth_header.removeprefix("Bearer ") if auth_header.startswith("Bearer ") else None
        bearer_ctx_token = bearer_token_ctx.set(raw_token)
        actor_ctx_token = actor_user_id_ctx.set(request.state.actor_user_id)
        start_time_ctx_token = request_start_time_ctx.set(parsed_start_time)
        request_id_ctx_token = request_id_ctx.set(raw_request_id)

        forward_headers: dict[str, str] = {}
        if raw_start_time:
            forward_headers[HEADER_REQUEST_START_TIME] = raw_start_time
        if raw_request_id:
            forward_headers[HEADER_REQUEST_ID] = raw_request_id
        headers_ctx_token = audit_headers_ctx.set(forward_headers or None)
        try:
            return await call_next(request)
        finally:
            audit_headers_ctx.reset(headers_ctx_token)
            request_id_ctx.reset(request_id_ctx_token)
            request_start_time_ctx.reset(start_time_ctx_token)
            bearer_token_ctx.reset(bearer_ctx_token)
            actor_user_id_ctx.reset(actor_ctx_token)


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
    return {
        "actor_user_id": getattr(request.state, "actor_user_id", None) or actor_user_id_ctx.get(),
        "triggered_by_user_id": getattr(request.state, "triggered_by_user_id", None),
        "workflow_run_id": getattr(request.state, "workflow_run_id", None),
        "workflow_type": getattr(request.state, "workflow_type", None),
    }
