"""Unit tests for history.service — fetch_history orchestration and cross-DB merging."""

from __future__ import annotations

import datetime
import uuid
from collections.abc import AsyncGenerator
from typing import Any
from unittest.mock import AsyncMock, patch

from src.config.settings import SOURCE_DB_KEYS
from src.models.schemas.protocol_schemas import ChangeType, HistoryItem, SourceFilter
from src.services.history.query import HistoryQuery
from src.services.history.query_builder import HISTORY_SOURCES
from src.services.history.repository import AUDIT_LOG_ENABLED_SERVICES, SERVICE_LABELS
from src.services.history.service import _merge_groups_across_dbs, fetch_history

PROJECT_ID = uuid.UUID("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee")
_TS = datetime.datetime(2025, 6, 1, tzinfo=datetime.UTC)


def test_service_labels_covers_all_db_keys() -> None:
    db_keys = {db_key for db_key, _ in HISTORY_SOURCES}
    for key in db_keys:
        assert key in SERVICE_LABELS, f"SERVICE_LABELS missing key '{key}'"


def _make_aggregate_row(
    *,
    entity_type: str = "project",
    change_type: str = "create",
    update_type: str = "AUTOMATED",
    actor_user_id: str | None = None,
    workflow_run_id: str | None = None,
    workflow_type: str | None = None,
    request_id: str | None = None,
    ts: datetime.datetime | None = None,
    total_count: int = 1,
) -> dict[str, Any]:
    return {
        "entity_type": entity_type,
        "change_type": change_type,
        "id": str(uuid.uuid4()),
        "update_type": update_type,
        "ts": ts or _TS,
        "new_row": {"id": str(uuid.uuid4()), "value": 1} if change_type != "delete" else None,
        "old_row": {"id": str(uuid.uuid4()), "value": 0} if change_type != "create" else None,
        "actor_user_id": actor_user_id,
        "triggered_by_user_id": None,
        "workflow_run_id": workflow_run_id,
        "workflow_type": workflow_type,
        "action_type": None,
        "request_id": request_id,
        "total_count": total_count,
    }


async def _mock_session_for(db_key: str) -> AsyncGenerator[AsyncMock]:
    yield AsyncMock()


async def test_fetch_history_empty() -> None:
    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch(
            "src.services.history.repository._run_aggregate_query",
            new=AsyncMock(return_value=[]),
        ),
    ):
        items, total = await fetch_history(HistoryQuery(project_id=PROJECT_ID))

    assert items == []
    assert total == 0


async def test_fetch_history_returns_items_from_multiple_dbs() -> None:
    row = _make_aggregate_row(total_count=1)

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        return [row]

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        items, total = await fetch_history(HistoryQuery(project_id=PROJECT_ID))

    # Dynamic unique DB keys → calls, each returns 1 row with total_count=1.
    num_dbs = len(SOURCE_DB_KEYS)
    assert total == num_dbs
    assert len(items) == num_dbs


async def test_fetch_history_source_filter_user_pushed_to_sql() -> None:
    user_row = _make_aggregate_row(actor_user_id="11111111-1111-1111-1111-111111111111", total_count=2)
    captured_sql: list[str] = []

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        captured_sql.append(sql)
        return [user_row]

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        items, total = await fetch_history(HistoryQuery(project_id=PROJECT_ID, source=SourceFilter.USER))

    assert all("actor_user_id IS NOT NULL" in s for s in captured_sql)
    assert all("upper(update_type)" not in s for s in captured_sql)
    assert all(i.source == "user" for i in items)
    # COUNT(*) OVER () runs after the SQL filter, so per-DB total reflects
    # the filtered count.
    assert total == len(SOURCE_DB_KEYS) * 2


async def test_fetch_history_source_filter_agent_pushed_to_sql() -> None:
    agent_row = _make_aggregate_row(update_type="AUTOMATED", total_count=2)
    captured_sql: list[str] = []

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        captured_sql.append(sql)
        return [agent_row]

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        items, total = await fetch_history(HistoryQuery(project_id=PROJECT_ID, source=SourceFilter.AGENT))

    assert all("NOT (workflow_run_id IS NULL AND workflow_type IS NULL" in s for s in captured_sql)
    assert all(i.source == "agent" for i in items)
    assert total == len(SOURCE_DB_KEYS) * 2


async def test_fetch_history_source_filter_all_skips_sql_clause() -> None:
    user_row = _make_aggregate_row(actor_user_id="11111111-1111-1111-1111-111111111111", total_count=2)
    agent_row = _make_aggregate_row(total_count=2)
    captured_sql: list[str] = []

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        captured_sql.append(sql)
        return [user_row, agent_row]

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        items, _total = await fetch_history(HistoryQuery(project_id=PROJECT_ID, source=SourceFilter.ALL))

    assert all("upper(update_type)" not in s for s in captured_sql)
    sources = {i.source for i in items}
    assert "user" in sources
    assert "agent" in sources


async def test_fetch_history_service_filter_limits_dbs() -> None:
    row = _make_aggregate_row(entity_type="category", total_count=1)

    call_count = 0

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        nonlocal call_count
        call_count += 1
        return [row]

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        items, _total = await fetch_history(HistoryQuery(project_id=PROJECT_ID, service="formal_completeness"))

    # formal_completeness has 1 DB → 1 aggregate query call.
    assert call_count == 1
    assert all(i.service == "formal_completeness" for i in items)


async def test_fetch_history_service_filter_excludes_other_services() -> None:
    call_count = 0

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        nonlocal call_count
        call_count += 1
        return []

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        _items, total = await fetch_history(HistoryQuery(project_id=PROJECT_ID, service="comment"))

    assert call_count == 1
    assert total == 0


async def test_fetch_history_unknown_service_filter_returns_empty() -> None:
    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch(
            "src.services.history.repository._run_aggregate_query",
            new=AsyncMock(return_value=[]),
        ),
    ):
        items, total = await fetch_history(HistoryQuery(project_id=PROJECT_ID, service="nonexistent_service"))

    assert items == []
    assert total == 0


async def test_fetch_history_sorted_descending() -> None:
    ts_old = datetime.datetime(2025, 1, 1, tzinfo=datetime.UTC)
    ts_new = datetime.datetime(2025, 6, 1, tzinfo=datetime.UTC)
    old_row = _make_aggregate_row(ts=ts_old, total_count=2)
    new_row = _make_aggregate_row(ts=ts_new, total_count=2)

    call_count = 0

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return [old_row, new_row]
        return []

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        items, _total = await fetch_history(HistoryQuery(project_id=PROJECT_ID))

    assert len(items) >= 2
    for i in range(len(items) - 1):
        assert items[i].timestamp >= items[i + 1].timestamp


async def test_fetch_history_pagination() -> None:
    rows = [_make_aggregate_row(total_count=5) for _ in range(5)]

    call_count = 0

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return rows
        return []

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        items, total = await fetch_history(HistoryQuery(project_id=PROJECT_ID, limit=2, offset=1))

    assert len(items) == 2
    assert total == 5


async def test_fetch_history_total_count_from_window_function() -> None:
    rows = [_make_aggregate_row(total_count=100) for _ in range(10)]

    call_count = 0

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        nonlocal call_count
        call_count += 1
        if call_count == 1:
            return rows
        return []

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        _items, total = await fetch_history(HistoryQuery(project_id=PROJECT_ID, limit=10, offset=0))

    assert total == 100


async def test_fetch_history_oversample_limit_passed_to_query() -> None:
    captured_params: list[dict[str, Any]] = []

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        captured_params.append(dict(params))
        return []

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        await fetch_history(HistoryQuery(project_id=PROJECT_ID, limit=25, offset=10))

    # Each DB should receive lim = offset + limit = 35.
    assert all(p["lim"] == 35 for p in captured_params)


def _wf_item(
    *,
    workflow_run_id: str | None = None,
    request_id: str | None = None,
    timestamp: datetime.datetime,
    service: str = "examination",
    group_count: int = 1,
) -> HistoryItem:
    return HistoryItem(
        timestamp=timestamp,
        entity_type="norm",
        entity_id=str(uuid.uuid4()),
        service=service,
        service_label=SERVICE_LABELS.get(service, service),
        change_type=ChangeType.CREATE,
        source="agent" if workflow_run_id else "user",
        workflow_run_id=workflow_run_id,
        workflow_type="plausibility" if workflow_run_id else None,
        request_id=request_id,
        group_count=group_count,
    )


def test_merge_groups_keeps_singletons_unchanged() -> None:
    a = _wf_item(workflow_run_id=None, request_id=None, timestamp=_TS)
    b = _wf_item(workflow_run_id=None, request_id=None, timestamp=_TS + datetime.timedelta(seconds=1))
    merged = _merge_groups_across_dbs([a, b])
    assert len(merged) == 2
    assert all(i.group_count == 1 for i in merged)


def test_merge_groups_collapses_same_run_across_dbs() -> None:
    # Same workflow_run_id, two DBs → one merged item, group_count summed.
    earliest = _wf_item(
        workflow_run_id="wf-1",
        timestamp=_TS,
        service="examination",
        group_count=450,
    )
    later = _wf_item(
        workflow_run_id="wf-1",
        timestamp=_TS + datetime.timedelta(seconds=2),
        service="plausibility",
        group_count=50,
    )
    merged = _merge_groups_across_dbs([earliest, later])

    assert len(merged) == 1
    rep = merged[0]
    assert rep.group_count == 500
    # Earliest event wins as representative — service field reflects that DB.
    assert rep.service == "examination"
    assert rep.timestamp == _TS


def test_merge_groups_collapses_same_request_across_dbs() -> None:
    # Same request_id, two DBs → one merged item, group_count summed.
    earliest = _wf_item(
        request_id="req-1",
        timestamp=_TS,
        service="examination",
        group_count=5,
    )
    later = _wf_item(
        request_id="req-1",
        timestamp=_TS + datetime.timedelta(seconds=1),
        service="plausibility",
        group_count=10,
    )
    merged = _merge_groups_across_dbs([earliest, later])

    assert len(merged) == 1
    rep = merged[0]
    assert rep.group_count == 15
    assert rep.service == "examination"
    assert rep.timestamp == _TS


def test_merge_groups_mixes_groups_and_singletons() -> None:
    grouped_a = _wf_item(workflow_run_id="wf-1", timestamp=_TS, group_count=10)
    grouped_b = _wf_item(
        workflow_run_id="wf-1",
        timestamp=_TS + datetime.timedelta(seconds=1),
        group_count=5,
    )
    grouped_req = _wf_item(request_id="req-1", timestamp=_TS + datetime.timedelta(seconds=5), group_count=2)
    single = _wf_item(workflow_run_id=None, request_id=None, timestamp=_TS + datetime.timedelta(minutes=1))
    merged = _merge_groups_across_dbs([grouped_a, grouped_b, grouped_req, single])
    assert len(merged) == 3
    counts = sorted(i.group_count for i in merged)
    assert counts == [1, 2, 15]


async def test_fetch_history_collapsed_passes_flag_to_sql_builder() -> None:
    captured_sql: list[str] = []

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        captured_sql.append(sql)
        return []

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        await fetch_history(HistoryQuery(project_id=PROJECT_ID, collapsed=True))

    # Every per-DB SQL got the aggregation wrapper.
    assert all("ROW_NUMBER() OVER" in s for s in captured_sql)


async def test_fetch_history_drill_down_filter_propagates() -> None:
    captured_params: list[dict[str, Any]] = []

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        captured_params.append(dict(params))
        return []

    with (
        patch("src.services.history.repository.session_for", _mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        await fetch_history(
            HistoryQuery(
                project_id=PROJECT_ID,
                workflow_run_id="wf-drill-1",
                collapsed=False,
            )
        )

    assert all(p.get("workflow_run_id") == "wf-drill-1" for p in captured_params)


async def test_fetch_history_audit_log_flag_per_service() -> None:
    """Für migrierte Services kommt has_audit_log=True (audit_log im SQL),
    für nicht-migrierte False (kein audit_log im SQL)."""
    captured: dict[str, str] = {}

    async def mock_run(session: Any, sql: str, params: dict[str, Any]) -> list[dict[str, Any]]:
        # session_for liefert pro DB einen "session" der die db_key kennt.
        captured[session.db_key] = sql
        return []

    def mock_session_for(db_key: str) -> AsyncGenerator[Any]:
        async def _gen() -> AsyncGenerator[Any]:
            class _S:
                def __init__(self, key: str) -> None:
                    self.db_key = key

            yield _S(db_key)

        return _gen()

    with (
        patch("src.services.history.repository.session_for", mock_session_for),
        patch("src.services.history.repository._run_aggregate_query", side_effect=mock_run),
    ):
        await fetch_history(HistoryQuery(project_id=PROJECT_ID))

    assert captured, "fetch_history should have queried at least one service-DB"
    for db_key, sql in captured.items():
        if db_key in AUDIT_LOG_ENABLED_SERVICES:
            assert "audit_log" in sql, f"{db_key} should JOIN audit_log"
        else:
            assert "audit_log" not in sql, f"{db_key} must not reference audit_log"
