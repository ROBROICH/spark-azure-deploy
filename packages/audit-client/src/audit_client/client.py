"""Audit log writer.

The INSERT joins the caller's active transaction so the audit entry
commits or rolls back together with the caller's main write. This
function does not commit; the caller is responsible for committing.
"""

from __future__ import annotations

from dataclasses import dataclass
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from audit_client.context import AuditContext, current_audit_context
from audit_client.enums import ChangeType
from audit_client.models import audit_log_table


def _require_active_transaction(session: AsyncSession) -> None:
    if not session.in_transaction():
        raise RuntimeError("audit persistence requires the caller's active transaction")


def _validate_action(change_type: ChangeType, action_type: str | None) -> None:
    if change_type is ChangeType.ACTION and action_type is None:
        raise ValueError("action_type is required when change_type is 'action'.")


def _resolved_context(
    *,
    actor_user_id: UUID | None,
    triggered_by_user_id: UUID | None,
    workflow_run_id: str | None,
    workflow_type: str | None,
) -> AuditContext:
    return current_audit_context(
        explicit=AuditContext(
            actor_user_id=actor_user_id,
            triggered_by_user_id=triggered_by_user_id,
            workflow_run_id=workflow_run_id,
            workflow_type=workflow_type,
        )
    )


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
    _require_active_transaction(session)
    _validate_action(change_type, action_type)
    context = _resolved_context(
        actor_user_id=actor_user_id,
        triggered_by_user_id=triggered_by_user_id,
        workflow_run_id=workflow_run_id,
        workflow_type=workflow_type,
    )

    await session.execute(
        audit_log_table.insert().values(
            id=uuid4(),
            project_id=project_id,
            entity_id=entity_id,
            entity_type=entity_type,
            change_type=change_type.value,
            action_type=action_type,
            actor_user_id=context.actor_user_id,
            triggered_by_user_id=context.triggered_by_user_id,
            workflow_run_id=context.workflow_run_id,
            workflow_type=context.workflow_type,
            request_start_time=context.request_start_time,
            request_id=context.request_id,
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

    _require_active_transaction(session)
    for entry in entries:
        _validate_action(entry.change_type, entry.action_type)
    context = _resolved_context(
        actor_user_id=actor_user_id,
        triggered_by_user_id=triggered_by_user_id,
        workflow_run_id=workflow_run_id,
        workflow_type=workflow_type,
    )

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
                "actor_user_id": context.actor_user_id,
                "triggered_by_user_id": context.triggered_by_user_id,
                "workflow_run_id": context.workflow_run_id,
                "workflow_type": context.workflow_type,
                "request_start_time": context.request_start_time,
                "request_id": context.request_id,
            }
            for entry in entries
        ],
    )
