"""Persistence-free construction of canonical audit changes."""

from __future__ import annotations

import re
from collections.abc import Iterable, Mapping
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from audit_client.enums import ChangeType

_UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_CHANGE_FIELDS = {"entityType", "entityId", "changeType", "actionType"}


@dataclass(frozen=True, slots=True)
class AuditChange:
    entity_type: str
    entity_id: UUID
    change_type: ChangeType
    action_type: str | None = None

    def to_dict(self) -> dict[str, str]:
        result = {
            "entityType": self.entity_type,
            "entityId": str(self.entity_id),
            "changeType": self.change_type.value,
        }
        if self.action_type is not None:
            result["actionType"] = self.action_type
        return result


def _required_text(value: object, field: str) -> str:
    if not isinstance(value, str) or not (normalized := value.strip()):
        raise ValueError(f"{field} must be a non-empty string")
    return normalized


def _required_uuid(value: object, field: str) -> UUID:
    normalized = _required_text(value, field)
    if not _UUID_PATTERN.fullmatch(normalized):
        raise ValueError(f"{field} must be a UUID")
    return UUID(normalized)


def build_audit_change(value: Mapping[str, Any]) -> AuditChange:
    """Validate one change before any persistence capability is involved."""

    if unknown := set(value) - _CHANGE_FIELDS:
        raise ValueError(f"unknown audit change fields: {', '.join(sorted(unknown))}")
    entity_type = _required_text(value.get("entityType"), "entityType")
    entity_id = _required_uuid(value.get("entityId"), "entityId")
    try:
        change_type = ChangeType(value.get("changeType"))
    except ValueError as error:
        raise ValueError("changeType must be create, update, delete, or action") from error

    raw_action = value.get("actionType")
    action_type = None if raw_action is None else _required_text(raw_action, "actionType")
    if change_type is ChangeType.ACTION and action_type is None:
        raise ValueError("actionType is required when changeType is action")
    return AuditChange(
        entity_type=entity_type,
        entity_id=entity_id,
        change_type=change_type,
        action_type=action_type,
    )


def build_audit_changes(values: Iterable[Mapping[str, Any]]) -> tuple[AuditChange, ...]:
    """Validate a whole bulk input; an empty input is an explicit no-op."""

    return tuple(build_audit_change(value) for value in values)
