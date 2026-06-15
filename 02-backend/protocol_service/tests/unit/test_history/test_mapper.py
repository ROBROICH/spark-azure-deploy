"""Unit tests for history.mapper — source classification, internal stripping, item build."""

from __future__ import annotations

import datetime
import uuid
from typing import Any

import pytest

from src.models.schemas.protocol_schemas import ChangeType, HistoryItem
from src.services.history.mapper import (
    _build_history_item,
    _strip_internals,
)
from src.services.history.query_builder import classify_source

_TS = datetime.datetime(2025, 6, 1, tzinfo=datetime.UTC)


def test_source_with_actor_user_id() -> None:
    assert classify_source({"actor_user_id": "some-uuid", "workflow_run_id": None, "workflow_type": None}) == "user"


def test_source_automated() -> None:
    assert classify_source({"update_type": "AUTOMATED"}) == "agent"


def test_source_missing_actor() -> None:
    assert classify_source({}) == "agent"


def test_source_workflow_row() -> None:
    assert classify_source({"workflow_run_id": "wf-123", "actor_user_id": "uid"}) == "agent"


def test_strip_internals_removes_sys_period() -> None:
    d = {"id": "abc", "sys_period": "[2025,)", "value": 42}
    result = _strip_internals(d)
    assert result is not None
    assert "sys_period" not in result
    assert result["id"] == "abc"
    assert result["value"] == 42


def test_strip_internals_removes_all_internal_keys() -> None:
    d = {
        "id": "abc",
        "sys_period": "...",
        "timestamp": "...",
        "change_type": "update",
        "update_type": "AUTOMATED",
        "value": 99,
    }
    result = _strip_internals(d)
    assert result is not None
    assert set(result.keys()) == {"id", "value"}


def test_strip_internals_none_returns_none() -> None:
    assert _strip_internals(None) is None


def test_strip_internals_empty_dict() -> None:
    assert _strip_internals({}) == {}


def test_build_history_item_create() -> None:
    entity_id = str(uuid.uuid4())
    row: dict[str, Any] = {
        "entity_type": "applicant",
        "change_type": "create",
        "id": entity_id,
        "update_type": "AUTOMATED",
        "ts": _TS,
        "new_row": {"id": entity_id, "name": "Foo", "sys_period": "[2025,)", "update_type": "AUTOMATED"},
        "old_row": None,
        "actor_user_id": "11111111-1111-1111-1111-111111111111",
        "workflow_run_id": None,
        "workflow_type": None,
        "total_count": 1,
    }
    item = _build_history_item(row, service="project_logic", service_label="Verfahrensdaten")
    assert isinstance(item, HistoryItem)
    assert item.change_type == ChangeType.CREATE
    assert item.source == "user"
    assert item.entity_type == "applicant"
    assert item.timestamp == _TS
    assert item.old_row is None
    assert item.new_row is not None
    assert "sys_period" not in item.new_row
    assert "update_type" not in item.new_row
    assert item.new_row["name"] == "Foo"


def test_build_history_item_update_strips_internals() -> None:
    entity_id = str(uuid.uuid4())
    row: dict[str, Any] = {
        "entity_type": "project",
        "change_type": "update",
        "id": entity_id,
        "update_type": "AUTOMATED",
        "ts": _TS,
        "new_row": {"id": entity_id, "title": "after", "sys_period": "...", "update_type": "X"},
        "old_row": {"id": entity_id, "title": "before", "sys_period": "...", "update_type": "X"},
        "total_count": 1,
    }
    item = _build_history_item(row, service="project_logic", service_label="Verfahrensdaten")
    assert item.change_type == ChangeType.UPDATE
    assert item.source == "agent"
    assert item.new_row is not None
    assert item.old_row is not None
    assert "sys_period" not in item.new_row
    assert "sys_period" not in item.old_row
    assert item.new_row["title"] == "after"
    assert item.old_row["title"] == "before"


def test_build_history_item_delete() -> None:
    entity_id = str(uuid.uuid4())
    row: dict[str, Any] = {
        "entity_type": "comment",
        "change_type": "delete",
        "id": entity_id,
        "update_type": "AUTOMATED",
        "ts": _TS,
        "new_row": None,
        "old_row": {"id": entity_id, "text": "bye", "sys_period": "...", "update_type": "AUTOMATED"},
        "total_count": 1,
    }
    item = _build_history_item(row, service="comment", service_label="Kommentare")
    assert item.change_type == ChangeType.DELETE
    assert item.new_row is None
    assert item.old_row is not None
    assert item.old_row["text"] == "bye"


def test_build_history_item_string_timestamp() -> None:
    entity_id = str(uuid.uuid4())
    row: dict[str, Any] = {
        "entity_type": "project",
        "change_type": "create",
        "id": entity_id,
        "update_type": "AUTOMATED",
        "ts": "2025-06-01T10:00:00+00:00",
        "new_row": {"id": entity_id},
        "old_row": None,
        "total_count": 1,
    }
    item = _build_history_item(row, service="project_logic", service_label="Verfahrensdaten")
    assert isinstance(item.timestamp, datetime.datetime)


def test_build_history_item_missing_ts_raises() -> None:
    entity_id = str(uuid.uuid4())
    row: dict[str, Any] = {
        "entity_type": "project",
        "change_type": "create",
        "id": entity_id,
        "update_type": "AUTOMATED",
        "ts": None,
        "new_row": None,
        "old_row": None,
        "total_count": 1,
    }
    with pytest.raises(TypeError, match="unexpected ts type"):
        _build_history_item(row, service="project_logic", service_label="Verfahrensdaten")
