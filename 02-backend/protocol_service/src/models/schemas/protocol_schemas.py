"""Pydantic schemas for the protocol / audit-trail API."""

from __future__ import annotations

import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class SourceFilter(str, Enum):
    """Filter for change origin."""

    USER = "user"
    AGENT = "agent"
    ALL = "all"


class ChangeType(str, Enum):
    """Type of change recorded."""

    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    ACTION = "action"


class HistoryItem(BaseModel):
    """One audit-trail entry - one row change across any service."""

    model_config = ConfigDict(populate_by_name=True)

    timestamp: datetime.datetime = Field(..., description="When the change occurred")
    entity_type: str = Field(..., description="Table / entity name, e.g. 'applicant'")
    entity_id: str | None = Field(None, description="UUID of the changed row (null for pure action events)")
    service: str = Field(..., description="Source service key, e.g. 'project_logic'")
    service_label: str = Field(..., description="Human-readable service name, e.g. 'Verfahrensdaten'")
    change_type: ChangeType = Field(..., description="create | update | delete | action")
    source: str = Field(..., description="user | agent")
    actor_user_id: str | None = Field(None, description="UUID of the user who performed the action (from audit_log)")
    triggered_by_user_id: str | None = Field(
        None, description="For AI workflows: UUID of the user who triggered the workflow"
    )
    workflow_run_id: str | None = Field(
        None, description="Temporal workflow run ID, when the change happened inside a workflow"
    )
    workflow_type: str | None = Field(None, description="Workflow type, e.g. 'plausibility'")
    action_type: str | None = Field(None, description="For pure action events without a DB diff, e.g. 'export'")
    request_id: str | None = Field(None, description="Envoy correlation request ID (from audit_log)")
    old_row: dict[str, Any] | None = Field(None, description="Row state BEFORE the change (null for create)")
    new_row: dict[str, Any] | None = Field(None, description="Row state AFTER the change (null for delete)")
    group_count: int = Field(
        1,
        description=(
            "1 for single events; > 1 when this item represents a collapsed "
            "workflow group or request group. Drill-down via ?workflow_run_id=<id> "
            "or ?request_id=<id>."
        ),
    )


class HistoryResponse(BaseModel):
    """Paginated response for GET /projects/{id}/history."""

    total: int = Field(..., description="Total items across all pages")
    limit: int = Field(..., description="Requested page size")
    offset: int = Field(..., description="Requested offset")
    items: list[HistoryItem] = Field(..., description="History entries")
