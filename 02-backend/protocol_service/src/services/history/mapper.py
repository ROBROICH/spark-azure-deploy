"""Row → HistoryItem mapping — no DB access."""

from __future__ import annotations

import datetime
from typing import Any

from src.models.schemas.protocol_schemas import ChangeType, HistoryItem
from src.services.history.query_builder import classify_source

_INTERNAL_KEYS: frozenset[str] = frozenset({"sys_period", "timestamp", "change_type", "update_type"})


def _strip_internals(d: dict[str, Any] | None) -> dict[str, Any] | None:
    if d is None:
        return None
    return {k: v for k, v in d.items() if k not in _INTERNAL_KEYS}


def _build_history_item(
    row: dict[str, Any],
    *,
    service: str,
    service_label: str,
) -> HistoryItem:
    ts_raw = row.get("ts")
    if isinstance(ts_raw, str):
        timestamp = datetime.datetime.fromisoformat(ts_raw)
    elif isinstance(ts_raw, datetime.datetime):
        timestamp = ts_raw
    else:
        raise TypeError(
            f"Aggregate row has unexpected ts type: {type(ts_raw).__name__}. "
            f"SQL guarantees lower/upper(sys_period) is a timestamp."
        )

    change_type = ChangeType(row["change_type"])
    entity_type: str = row["entity_type"]
    raw_id = row.get("id")
    entity_id = str(raw_id) if raw_id is not None else None
    source = classify_source(row)

    raw_old: Any = row.get("old_row")
    raw_new: Any = row.get("new_row")

    old_row: dict[str, Any] | None = _strip_internals(raw_old) if isinstance(raw_old, dict) else None
    new_row: dict[str, Any] | None = _strip_internals(raw_new) if isinstance(raw_new, dict) else None

    def _to_optional_str(value: Any) -> str | None:
        return str(value) if value is not None else None

    raw_group_count = row.get("group_count")
    group_count = int(raw_group_count) if raw_group_count is not None else 1

    return HistoryItem(
        timestamp=timestamp,
        entity_type=entity_type,
        entity_id=entity_id,
        service=service,
        service_label=service_label,
        change_type=change_type,
        source=source,
        actor_user_id=_to_optional_str(row.get("actor_user_id")),
        triggered_by_user_id=_to_optional_str(row.get("triggered_by_user_id")),
        workflow_run_id=_to_optional_str(row.get("workflow_run_id")),
        workflow_type=_to_optional_str(row.get("workflow_type")),
        action_type=_to_optional_str(row.get("action_type")),
        request_id=_to_optional_str(row.get("request_id")),
        old_row=old_row,
        new_row=new_row,
        group_count=group_count,
    )
