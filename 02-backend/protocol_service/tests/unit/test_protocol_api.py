"""API tests for GET /projects/{project_id}/history."""

from __future__ import annotations

import datetime
import uuid
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from src.models.schemas.protocol_schemas import ChangeType, HistoryItem, SourceFilter

PROJECT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
HISTORY_URL = f"/projects/{PROJECT_ID}/history"


def _sample_item() -> HistoryItem:
    return HistoryItem(
        timestamp=datetime.datetime(2025, 6, 1, tzinfo=datetime.UTC),
        entity_type="applicant",
        entity_id=str(uuid.uuid4()),
        service="project_logic",
        service_label="Verfahrensdaten",
        change_type=ChangeType.CREATE,
        source="user",
        old_row=None,
        new_row={"id": "abc"},
    )


# ---------------------------------------------------------------------------
# Happy path
# ---------------------------------------------------------------------------


def test_get_history_empty(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ):
        response = client.get(HISTORY_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 0
    assert body["items"] == []
    assert body["limit"] == 50
    assert body["offset"] == 0


def test_get_history_with_items(client: TestClient) -> None:
    item = _sample_item()
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([item], 1)),
    ):
        response = client.get(HISTORY_URL)

    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 1
    assert len(body["items"]) == 1
    first = body["items"][0]
    assert first["entity_type"] == "applicant"
    assert first["source"] == "user"
    assert first["change_type"] == "create"
    assert first["old_row"] is None
    assert first["new_row"] == {"id": "abc"}


# ---------------------------------------------------------------------------
# Date validation — Bug 4 regression
# ---------------------------------------------------------------------------


def test_invalid_from_date_returns_422(client: TestClient) -> None:
    response = client.get(f"{HISTORY_URL}?from=blah")
    assert response.status_code == 422


def test_invalid_to_date_returns_422(client: TestClient) -> None:
    response = client.get(f"{HISTORY_URL}?to=not-a-date")
    assert response.status_code == 422


def test_valid_iso_date_passes(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        response = client.get(f"{HISTORY_URL}?from=2025-01-01&to=2025-12-31")

    assert response.status_code == 200
    q = mock_fetch.call_args.args[0]
    assert q.from_ts is not None
    assert q.to_ts is not None


def test_valid_iso_datetime_passes(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ):
        response = client.get(f"{HISTORY_URL}?from=2025-06-01T12:00:00")

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Invalid project_id
# ---------------------------------------------------------------------------


def test_invalid_project_id_returns_422(client: TestClient) -> None:
    response = client.get("/projects/not-a-uuid/history")
    assert response.status_code == 422


# ---------------------------------------------------------------------------
# Filter parameters forwarded correctly
# ---------------------------------------------------------------------------


def test_source_filter_forwarded(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        client.get(f"{HISTORY_URL}?source=user")

    assert mock_fetch.call_args.args[0].source == SourceFilter.USER


def test_service_filter_forwarded(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        client.get(f"{HISTORY_URL}?service=formal_completeness")

    assert mock_fetch.call_args.args[0].service == "formal_completeness"


# ---------------------------------------------------------------------------
# Pagination
# ---------------------------------------------------------------------------


def test_pagination_params_forwarded(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        response = client.get(f"{HISTORY_URL}?limit=10&offset=20")

    assert response.status_code == 200
    body = response.json()
    assert body["limit"] == 10
    assert body["offset"] == 20
    q = mock_fetch.call_args.args[0]
    assert q.limit == 10
    assert q.offset == 20


def test_limit_too_large_rejected(client: TestClient) -> None:
    response = client.get(f"{HISTORY_URL}?limit=9999")
    assert response.status_code == 422


def test_negative_offset_rejected(client: TestClient) -> None:
    response = client.get(f"{HISTORY_URL}?offset=-1")
    assert response.status_code == 422


def test_zero_limit_rejected(client: TestClient) -> None:
    response = client.get(f"{HISTORY_URL}?limit=0")
    assert response.status_code == 422


def test_limit_at_maximum_accepted(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ):
        response = client.get(f"{HISTORY_URL}?limit=500")

    assert response.status_code == 200


# ---------------------------------------------------------------------------
# Source filter — agent and all variants
# ---------------------------------------------------------------------------


def test_source_filter_agent_forwarded(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        client.get(f"{HISTORY_URL}?source=agent")

    assert mock_fetch.call_args.args[0].source == SourceFilter.AGENT


def test_source_filter_all_forwarded(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        client.get(f"{HISTORY_URL}?source=all")

    assert mock_fetch.call_args.args[0].source == SourceFilter.ALL


# ---------------------------------------------------------------------------
# Response structure — UPDATE and DELETE items
# ---------------------------------------------------------------------------


def test_get_history_update_item_has_old_and_new_row(client: TestClient) -> None:
    item = HistoryItem(
        timestamp=datetime.datetime(2025, 6, 1, tzinfo=datetime.UTC),
        entity_type="topic",
        entity_id=str(uuid.uuid4()),
        service="project_logic",
        service_label="Verfahrensdaten",
        change_type=ChangeType.UPDATE,
        source="agent",
        old_row={"name": "before"},
        new_row={"name": "after"},
    )
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([item], 1)),
    ):
        response = client.get(HISTORY_URL)

    assert response.status_code == 200
    first = response.json()["items"][0]
    assert first["change_type"] == "update"
    assert first["source"] == "agent"
    assert first["old_row"] == {"name": "before"}
    assert first["new_row"] == {"name": "after"}


def test_get_history_delete_item_has_no_new_row(client: TestClient) -> None:
    item = HistoryItem(
        timestamp=datetime.datetime(2025, 6, 1, tzinfo=datetime.UTC),
        entity_type="applicant",
        entity_id=str(uuid.uuid4()),
        service="project_logic",
        service_label="Verfahrensdaten",
        change_type=ChangeType.DELETE,
        source="user",
        old_row={"name": "removed"},
        new_row=None,
    )
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([item], 1)),
    ):
        response = client.get(HISTORY_URL)

    first = response.json()["items"][0]
    assert first["change_type"] == "delete"
    assert first["old_row"] == {"name": "removed"}
    assert first["new_row"] is None


# ---------------------------------------------------------------------------
# Export endpoint
# ---------------------------------------------------------------------------

EXPORT_URL = f"/projects/{PROJECT_ID}/history/export"


def test_export_returns_200_with_attachment_header(client: TestClient) -> None:
    item = _sample_item()
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([item], 1)),
    ):
        response = client.get(EXPORT_URL)

    assert response.status_code == 200
    assert response.headers["content-disposition"] == 'attachment; filename="history.json"'
    assert response.headers["content-type"] == "application/json"


def test_export_response_structure(client: TestClient) -> None:
    item = _sample_item()
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([item], 1)),
    ):
        body = client.get(EXPORT_URL).json()

    assert body["project_id"] == PROJECT_ID
    assert body["total"] == 1
    assert len(body["items"]) == 1
    assert body["items"][0]["entity_type"] == "applicant"


def test_export_calls_fetch_with_large_limit_and_zero_offset(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        client.get(EXPORT_URL)

    q = mock_fetch.call_args.args[0]
    assert q.limit == 10_000
    assert q.offset == 0


def test_export_filters_forwarded(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        client.get(f"{EXPORT_URL}?source=user&service=examination&from=2025-01-01&to=2025-12-31")

    q = mock_fetch.call_args.args[0]
    assert q.source == SourceFilter.USER
    assert q.service == "examination"
    assert q.from_ts == datetime.datetime(2025, 1, 1)
    assert q.to_ts == datetime.datetime(2025, 12, 31)


def test_export_invalid_date_returns_422(client: TestClient) -> None:
    assert client.get(f"{EXPORT_URL}?from=blah").status_code == 422


def test_export_invalid_project_id_returns_422(client: TestClient) -> None:
    assert client.get("/projects/not-a-uuid/history/export").status_code == 422


# ---------------------------------------------------------------------------
# Both date filters forwarded with correct parsed values
# ---------------------------------------------------------------------------


def test_both_date_filters_forwarded(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        response = client.get(f"{HISTORY_URL}?from=2025-01-01&to=2025-12-31")

    assert response.status_code == 200
    q = mock_fetch.call_args.args[0]
    assert q.from_ts == datetime.datetime(2025, 1, 1)
    assert q.to_ts == datetime.datetime(2025, 12, 31)


def test_only_from_filter_forwarded(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        response = client.get(f"{HISTORY_URL}?from=2025-06-01")

    assert response.status_code == 200
    q = mock_fetch.call_args.args[0]
    assert q.from_ts is not None
    assert q.to_ts is None


def test_only_to_filter_forwarded(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        response = client.get(f"{HISTORY_URL}?to=2025-12-31")

    assert response.status_code == 200
    q = mock_fetch.call_args.args[0]
    assert q.from_ts is None
    assert q.to_ts is not None


def test_get_history_with_request_id_filter(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        response = client.get(f"{HISTORY_URL}?request_id=req-xyz-123")

    assert response.status_code == 200
    q = mock_fetch.call_args.args[0]
    assert q.request_id == "req-xyz-123"
    # When request_id is specified, collapsed should be False (since it is a drill-down query)
    assert q.collapsed is False


def test_export_history_with_request_id_filter(client: TestClient) -> None:
    with patch(
        "src.api.routes.protocol_api.fetch_history",
        new=AsyncMock(return_value=([], 0)),
    ) as mock_fetch:
        response = client.get(f"{HISTORY_URL}/export?request_id=req-xyz-123")

    assert response.status_code == 200
    q = mock_fetch.call_args.args[0]
    assert q.request_id == "req-xyz-123"
