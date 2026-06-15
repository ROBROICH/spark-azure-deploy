"""Audit log writer.

The INSERT joins the caller's active transaction so the audit entry
commits or rolls back together with the caller's main write. This
function does not commit; the caller is responsible for committing.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from audit_client.enums import ChangeType
from audit_client.forwarding import (
    HEADER_ACTOR_USER_ID,
    HEADER_TRIGGERED_BY_USER_ID,
    HEADER_WORKFLOW_RUN_ID,
    HEADER_WORKFLOW_TYPE,
    actor_user_id_ctx,
    audit_headers_ctx,
    request_id_ctx,
    request_start_time_ctx,
)
from audit_client.models import audit_log_table


def _uuid_or_none(value: str | None) -> UUID | None:
    if not value:
        return None
    try:
        return UUID(value)
    except ValueError:
        return None


async def record_audit_entry(
    session: AsyncSession,
    *,
    project_id: UUID,
    entity_type: str,
    change_type: ChangeType,
    entity_id: UUID | None = None,
    action_type: str | None = None,
    actor_user_id: UUID | None = None,
    triggered_by_user_id: UUID | None = None,
    workflow_run_id: str | None = None,
    workflow_type: str | None = None,
) -> None:
    if change_type is ChangeType.ACTION and action_type is None:
        raise ValueError("action_type is required when change_type is 'action'.")

    headers = audit_headers_ctx.get() or {}
    actor_user_id = actor_user_id or actor_user_id_ctx.get() or _uuid_or_none(headers.get(HEADER_ACTOR_USER_ID))
    triggered_by_user_id = triggered_by_user_id or _uuid_or_none(headers.get(HEADER_TRIGGERED_BY_USER_ID))
    workflow_run_id = workflow_run_id or headers.get(HEADER_WORKFLOW_RUN_ID)
    workflow_type = workflow_type or headers.get(HEADER_WORKFLOW_TYPE)
    request_start_time = request_start_time_ctx.get()
    request_id = request_id_ctx.get()

    await session.execute(
        audit_log_table.insert().values(
            id=uuid4(),
            project_id=project_id,
            entity_id=entity_id,
            entity_type=entity_type,
            change_type=change_type.value,
            action_type=action_type,
            actor_user_id=actor_user_id,
            triggered_by_user_id=triggered_by_user_id,
            workflow_run_id=workflow_run_id,
            workflow_type=workflow_type,
            request_start_time=request_start_time,
            request_id=request_id,
        )
    )


@dataclass
class AuditEntry:
    entity_type: str
    change_type: ChangeType
    entity_id: UUID
    action_type: str | None = None


async def record_audit_entries(
    session: AsyncSession,
    *,
    project_id: UUID,
    entries: list[AuditEntry],
    actor_user_id: UUID | None = None,
    triggered_by_user_id: UUID | None = None,
    workflow_run_id: str | None = None,
    workflow_type: str | None = None,
) -> None:
    """Bulk-insert multiple audit log entries in the caller's active transaction."""
    if not entries:
        return

    headers = audit_headers_ctx.get() or {}
    resolved_actor = actor_user_id or actor_user_id_ctx.get() or _uuid_or_none(headers.get(HEADER_ACTOR_USER_ID))
    triggered_by_user_id = triggered_by_user_id or _uuid_or_none(headers.get(HEADER_TRIGGERED_BY_USER_ID))
    workflow_run_id = workflow_run_id or headers.get(HEADER_WORKFLOW_RUN_ID)
    workflow_type = workflow_type or headers.get(HEADER_WORKFLOW_TYPE)
    request_start_time = request_start_time_ctx.get()
    request_id = request_id_ctx.get()

    await session.execute(
        audit_log_table.insert(),
        [
            {
                "id": uuid4(),
                "project_id": project_id,
                "entity_id": entry.entity_id,
                "entity_type": entry.entity_type,
                "change_type": entry.change_type.value,
                "action_type": entry.action_type,
                "actor_user_id": resolved_actor,
                "triggered_by_user_id": triggered_by_user_id,
                "workflow_run_id": workflow_run_id,
                "workflow_type": workflow_type,
                "request_start_time": request_start_time,
                "request_id": request_id,
            }
            for entry in entries
        ],
    )
