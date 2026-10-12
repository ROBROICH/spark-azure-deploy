from __future__ import annotations

import contextvars
from typing import Any

from audit_client.context import (
    HEADER_ACTOR_USER_ID,
    HEADER_REQUEST_ID,
    HEADER_REQUEST_START_TIME,
    HEADER_TRIGGERED_BY_USER_ID,
    HEADER_WORKFLOW_RUN_ID,
    HEADER_WORKFLOW_TYPE,
    AuditContext,
    actor_user_id_ctx,
    audit_context_headers,
    audit_headers_ctx,
    bearer_token_ctx,
    current_audit_context,
    request_id_ctx,
    request_start_time_ctx,
)
from audit_client.workflow import WorkflowActorContext

__all__ = [
    "HEADER_ACTOR_USER_ID",
    "HEADER_REQUEST_ID",
    "HEADER_REQUEST_START_TIME",
    "HEADER_TRIGGERED_BY_USER_ID",
    "HEADER_WORKFLOW_RUN_ID",
    "HEADER_WORKFLOW_TYPE",
    "actor_user_id_ctx",
    "audit_headers",
    "audit_headers_ctx",
    "bearer_token_ctx",
    "current_audit_headers",
    "merge_audit_headers",
    "request_id_ctx",
    "request_start_time_ctx",
    "set_audit_headers_context",
]


def audit_headers(context: AuditContext) -> dict[str, str]:
    """Return the canonical header representation of a validated context."""

    return audit_context_headers(context)


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
    context = AuditContext(
        actor_user_id=workflow_actor.actor_user_id if workflow_actor is not None else None,
        triggered_by_user_id=(workflow_actor.triggered_by_user_id if workflow_actor is not None else None),
        workflow_run_id=workflow_run_id.strip() if workflow_run_id and workflow_run_id.strip() else None,
        workflow_type=(
            workflow_actor.workflow_type.strip()
            if workflow_actor is not None and workflow_actor.workflow_type and workflow_actor.workflow_type.strip()
            else None
        ),
    )
    return audit_headers_ctx.set(audit_headers(context) or None)


def current_audit_headers() -> dict[str, str]:
    """Return a fresh dict of the audit headers active in this context.

    Empty when no activity has installed any — outbound clients are then a
    no-op. Always returns a new dict so callers can mutate the result.
    """
    return audit_headers(current_audit_context())


def merge_audit_headers(headers: dict[str, Any] | None) -> dict[str, Any]:
    """Merge caller-supplied headers with the current audit headers.

    Caller-supplied keys win — useful when an activity wants to override
    one of the audit headers for a specific outbound call.
    """
    merged: dict[str, Any] = current_audit_headers()
    for name, value in (headers or {}).items():
        collision = next(
            (existing for existing in merged if existing.lower() == str(name).lower()),
            None,
        )
        if collision is not None:
            del merged[collision]
        merged[str(name)] = value
    return merged
