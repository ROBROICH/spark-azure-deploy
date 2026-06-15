"""Workflow-side audit context.

Activities cannot read the four audit HTTP headers — they run inside a
Temporal worker, not behind FastAPI. So workflows carry the audit
attribution in their input model instead. The triggering service builds a
``WorkflowActorContext`` from the request's audit context and embeds it
into the workflow input; the activity then converts it back into
``record_audit_entry`` kwargs via :func:`audit_context_from_workflow`.

The ``workflow_run_id`` is intentionally *not* part of the model: Temporal
assigns it when the workflow starts, and activities read it from
``temporalio.activity.info().workflow_run_id`` at write time.
"""

from __future__ import annotations

from typing import Any
from uuid import UUID

from pydantic import BaseModel


class WorkflowActorContext(BaseModel):
    """Audit attribution carried through a Temporal workflow input."""

    actor_user_id: UUID | None = None
    triggered_by_user_id: UUID | None = None
    workflow_type: str | None = None


def workflow_actor_context_from_request_kwargs(
    audit_context: dict[str, Any],
) -> WorkflowActorContext:
    """Build a workflow actor context from a request's audit context.

    ``workflow_run_id`` from the request (if any) is dropped: a freshly
    started workflow gets a new run id from Temporal.
    """
    return WorkflowActorContext(
        actor_user_id=audit_context.get("actor_user_id"),
        triggered_by_user_id=audit_context.get("triggered_by_user_id"),
        workflow_type=audit_context.get("workflow_type"),
    )


def audit_context_from_workflow(
    actor: WorkflowActorContext | None,
    *,
    workflow_run_id: str | None,
) -> dict[str, Any]:
    """Convert workflow actor + Temporal run id into ``record_audit_entry`` kwargs.

    Pass ``workflow_run_id`` from ``temporalio.activity.info().workflow_run_id``.
    Returns an empty-shape dict when ``actor`` is ``None`` so callers can
    splat unconditionally.
    """
    if actor is None:
        return {
            "actor_user_id": None,
            "triggered_by_user_id": None,
            "workflow_run_id": workflow_run_id,
            "workflow_type": None,
        }
    return {
        "actor_user_id": actor.actor_user_id,
        "triggered_by_user_id": actor.triggered_by_user_id,
        "workflow_run_id": workflow_run_id,
        "workflow_type": actor.workflow_type,
    }
