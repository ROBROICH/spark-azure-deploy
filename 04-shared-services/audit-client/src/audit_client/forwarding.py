from __future__ import annotations

import contextvars
from datetime import datetime
from typing import Any
from uuid import UUID

from audit_client.settings import settings
from audit_client.workflow import WorkflowActorContext

HEADER_ACTOR_USER_ID = "X-Actor-User-Id"
HEADER_TRIGGERED_BY_USER_ID = "X-Triggered-By-User-Id"
HEADER_WORKFLOW_RUN_ID = "X-Workflow-Run-Id"
HEADER_WORKFLOW_TYPE = "X-Workflow-Type"
HEADER_REQUEST_START_TIME = settings.HEADER_REQUEST_START_TIME
HEADER_REQUEST_ID = settings.HEADER_REQUEST_ID

audit_headers_ctx: contextvars.ContextVar[dict[str, str] | None] = contextvars.ContextVar(
    "audit_headers", default=None
)
bearer_token_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "bearer_token", default=None
)
actor_user_id_ctx: contextvars.ContextVar[UUID | None] = contextvars.ContextVar(
    "actor_user_id", default=None
)
request_start_time_ctx: contextvars.ContextVar[datetime | None] = contextvars.ContextVar(
    "request_start_time", default=None
)
request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id", default=None
)


def set_audit_headers_context(
    workflow_actor: WorkflowActorContext | None,
    *,
    workflow_run_id: str | None,
) -> contextvars.Token[dict[str, str] | None]:
    """Install the audit header set for the current task.

    Returns the token from ``ContextVar.set`` so callers can revert via
    ``audit_headers_ctx.reset(token)`` once the scope ends. Empty header
    values are skipped — only attributes that are actually present are
    propagated downstream.
    """
    headers: dict[str, str] = {}
    if workflow_run_id:
        headers[HEADER_WORKFLOW_RUN_ID] = workflow_run_id
    if workflow_actor is not None:
        if workflow_actor.workflow_type:
            headers[HEADER_WORKFLOW_TYPE] = workflow_actor.workflow_type
        if workflow_actor.triggered_by_user_id is not None:
            headers[HEADER_TRIGGERED_BY_USER_ID] = str(workflow_actor.triggered_by_user_id)
        if workflow_actor.actor_user_id is not None:
            headers[HEADER_ACTOR_USER_ID] = str(workflow_actor.actor_user_id)
    return audit_headers_ctx.set(headers or None)


def current_audit_headers() -> dict[str, str]:
    """Return a fresh dict of the audit headers active in this context.

    Empty when no activity has installed any — outbound clients are then a
    no-op. Always returns a new dict so callers can mutate the result.
    """
    return dict(audit_headers_ctx.get() or {})


def merge_audit_headers(headers: dict[str, Any] | None) -> dict[str, Any]:
    """Merge caller-supplied headers with the current audit headers.

    Caller-supplied keys win — useful when an activity wants to override
    one of the audit headers for a specific outbound call.
    """
    merged = current_audit_headers()
    if headers:
        merged.update(headers)
    return merged
