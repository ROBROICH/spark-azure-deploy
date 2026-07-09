"""Unit tests for FilesApiClient.list_files pagination."""

from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import httpx
import pytest
from temporal.project_context import use_project_context
from temporalio.exceptions import ApplicationError

from src.services.api_clients import ApiClient, FileObject, FilesApiClient, ObjectionsServiceClient, PlsApiClient
from src.services.project_version_errors import (
    PROJECT_VERSION_LOCKED_ERROR_TYPE,
    VERSION_NOT_LATEST_ERROR_TYPE,
)

PAGE_SIZE = 500
EXPECTED_LATEST_VERSION = 3
HTTP_OK = 200
HTTP_BAD_GATEWAY = 502


def _make_file_dict(**kwargs: Any) -> dict[str, Any]:
    """Return a minimal valid file dict (camelCase as returned by DMS)."""
    return {
        "id": str(uuid4()),
        "type": "document",
        "filename": "test.pdf",
        "mimeType": "application/pdf",
        "bucketPath": "projects/test/test.pdf",
        "projectId": str(uuid4()),
        "workflowId": None,
        "runId": None,
        "vectorSearchable": None,
        "topics": [],
        "createdAt": datetime.now(UTC).isoformat(),
        "updatedAt": datetime.now(UTC).isoformat(),
        **kwargs,
    }


def _make_response(data: Any) -> MagicMock:
    """Return a mock httpx.Response whose .json() returns data."""
    mock = MagicMock()
    mock.json.return_value = data
    return mock


@pytest.mark.asyncio
async def test_list_files_empty_project(monkeypatch: pytest.MonkeyPatch) -> None:
    """Returns empty list when DMS returns no files."""
    mock_get = AsyncMock(return_value=_make_response([]))
    monkeypatch.setattr(FilesApiClient, "get", mock_get)

    result = await FilesApiClient.list_files("proj-123")

    assert result == []
    mock_get.assert_called_once()


@pytest.mark.asyncio
async def test_list_files_single_partial_page(monkeypatch: pytest.MonkeyPatch) -> None:
    """Returns FileObject instances when result fits in one page."""
    expected_count = 3
    files = [_make_file_dict() for _ in range(expected_count)]
    mock_get = AsyncMock(return_value=_make_response(files))
    monkeypatch.setattr(FilesApiClient, "get", mock_get)

    result = await FilesApiClient.list_files("proj-123")

    assert len(result) == expected_count
    assert all(isinstance(f, FileObject) for f in result)
    mock_get.assert_called_once()
    assert mock_get.call_args.kwargs["params"]["page"] == 1
    assert mock_get.call_args.kwargs["params"]["page_size"] == PAGE_SIZE


@pytest.mark.asyncio
async def test_list_files_exactly_one_full_page(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fetches a second page when first page is exactly page_size, stops on empty second page."""
    full_page = [_make_file_dict() for _ in range(PAGE_SIZE)]
    mock_get = AsyncMock(side_effect=[_make_response(full_page), _make_response([])])
    monkeypatch.setattr(FilesApiClient, "get", mock_get)

    result = await FilesApiClient.list_files("proj-123")

    expected_page_count = 2
    assert len(result) == PAGE_SIZE
    assert mock_get.call_count == expected_page_count
    calls = mock_get.call_args_list
    for index, call in enumerate(calls):
        assert call.kwargs["params"]["page"] == index + 1


@pytest.mark.asyncio
async def test_list_files_multiple_pages(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fetches all pages and concatenates results as FileObject instances."""
    last_page_count = 200
    expected_page_count = 3
    expected_total = PAGE_SIZE + PAGE_SIZE + last_page_count
    page1 = [_make_file_dict() for _ in range(PAGE_SIZE)]
    page2 = [_make_file_dict() for _ in range(PAGE_SIZE)]
    page3 = [_make_file_dict() for _ in range(last_page_count)]
    mock_get = AsyncMock(
        side_effect=[
            _make_response(page1),
            _make_response(page2),
            _make_response(page3),
        ]
    )
    monkeypatch.setattr(FilesApiClient, "get", mock_get)

    result = await FilesApiClient.list_files("proj-123")

    assert len(result) == expected_total
    assert all(isinstance(f, FileObject) for f in result)
    assert mock_get.call_count == expected_page_count
    calls = mock_get.call_args_list
    for index, call in enumerate(calls):
        assert call.kwargs["params"]["page"] == index + 1


@pytest.mark.asyncio
async def test_list_files_passes_project_id_and_file_type_on_every_page(monkeypatch: pytest.MonkeyPatch) -> None:
    """Passes projectId (camelCase) and file_type params on every paginated request."""
    page1 = [_make_file_dict() for _ in range(500)]
    mock_get = AsyncMock(side_effect=[_make_response(page1), _make_response([])])
    monkeypatch.setattr(FilesApiClient, "get", mock_get)

    await FilesApiClient.list_files("my-project", file_type="zip")

    for call in mock_get.call_args_list:
        assert call.kwargs["params"]["projectId"] == "my-project"
        assert call.kwargs["params"]["file_type"] == "zip"


@pytest.mark.asyncio
async def test_list_files_default_file_type_is_document(monkeypatch: pytest.MonkeyPatch) -> None:
    """Default file_type parameter sends 'document' to the DMS."""
    mock_get = AsyncMock(return_value=_make_response([]))
    monkeypatch.setattr(FilesApiClient, "get", mock_get)

    await FilesApiClient.list_files("proj-123")

    assert mock_get.call_args.kwargs["params"]["file_type"] == "document"


def test_api_client_adds_project_version_from_context() -> None:
    """Adds Temporal project_version context to internal API query params."""
    with use_project_context("proj-123", 7):
        params = FilesApiClient._with_project_version({"projectId": "proj-123"})

    assert params == {"projectId": "proj-123", "project_version": 7}


@pytest.mark.asyncio
async def test_get_file_by_id_sends_project_version_from_context(monkeypatch: pytest.MonkeyPatch) -> None:
    """The EWMS DMS file lookup must include Temporal project_version context."""
    file_id = uuid4()
    project_id = uuid4()
    requests: list[tuple[str, dict[str, Any] | None]] = []

    class RecordingAsyncClient:
        def __init__(self, **kwargs: object) -> None:
            pass

        async def __aenter__(self) -> "RecordingAsyncClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        async def get(
            self,
            url: str,
            params: dict[str, Any] | None = None,
            headers: dict[str, str] | None = None,
        ) -> httpx.Response:
            requests.append((url, params))
            request = httpx.Request("GET", url, params=params, headers=headers)
            return httpx.Response(
                200,
                json=_make_file_dict(
                    id=str(file_id),
                    projectId=str(project_id),
                    type="ewms_document",
                ),
                request=request,
            )

    monkeypatch.setattr(httpx, "AsyncClient", RecordingAsyncClient)

    with use_project_context(project_id, 7):
        file = await FilesApiClient.get_file_by_id(file_id)

    assert file.id == file_id
    assert requests == [
        (
            f"{FilesApiClient.BASE_URL}/v2/files/{file_id}",
            {"project_version": 7},
        )
    ]


@pytest.mark.parametrize(
    ("detail", "error_type"),
    [
        (
            "Provided project version 1 is not the latest version 2",
            VERSION_NOT_LATEST_ERROR_TYPE,
        ),
        (
            "Project 123 has an active version creation lock",
            PROJECT_VERSION_LOCKED_ERROR_TYPE,
        ),
    ],
)
def test_api_client_marks_project_version_conflicts_non_retryable(detail: str, error_type: str) -> None:
    request = httpx.Request("POST", "http://service/project/update?project_version=1")
    response = httpx.Response(409, json={"detail": detail}, request=request)
    status_error = httpx.HTTPStatusError("conflict", request=request, response=response)

    with pytest.raises(ApplicationError) as exc_info:
        FilesApiClient._raise_non_retryable_project_version_error(status_error)

    assert exc_info.value.type == error_type
    assert exc_info.value.non_retryable is True
    assert exc_info.value.message == detail


def test_api_client_handles_http_status_error_without_response() -> None:
    request = httpx.Request("GET", "http://service/unavailable")
    status_error = httpx.HTTPStatusError("connect failed", request=request, response=None)

    FilesApiClient._raise_non_retryable_project_version_error(status_error)

    assert FilesApiClient._http_error_status(status_error) == HTTP_BAD_GATEWAY
    assert FilesApiClient._http_error_body(status_error) == "No upstream response"


@pytest.mark.asyncio
async def test_get_stream_uses_bounded_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    captured_client_kwargs: dict[str, Any] = {}

    class StreamingResponseContext:
        async def __aenter__(self) -> httpx.Response:
            request = httpx.Request("GET", "http://service/file")
            return httpx.Response(HTTP_OK, request=request)

        async def __aexit__(self, *args: object) -> None:
            return None

    class RecordingAsyncClient:
        def __init__(self, **kwargs: object) -> None:
            captured_client_kwargs.update(kwargs)

        async def __aenter__(self) -> "RecordingAsyncClient":
            return self

        async def __aexit__(self, *args: object) -> None:
            return None

        def stream(self, method: str, url: str, params: dict[str, str] | None = None) -> StreamingResponseContext:
            return StreamingResponseContext()

    monkeypatch.setattr(httpx, "AsyncClient", RecordingAsyncClient)

    async with FilesApiClient.get_stream("http://service/file") as response:
        assert response.status_code == HTTP_OK

    assert captured_client_kwargs["timeout"] == ApiClient.stream_timeout


@pytest.mark.asyncio
async def test_list_files_raises_on_non_list_response(monkeypatch: pytest.MonkeyPatch) -> None:
    """Raises a descriptive error when DMS returns a non-list JSON body."""
    mock_get = AsyncMock(return_value=_make_response({"error": "unexpected"}))
    monkeypatch.setattr(FilesApiClient, "get", mock_get)

    with pytest.raises(TypeError, match="Expected a list"):
        await FilesApiClient.list_files("proj-123")


@pytest.mark.asyncio
async def test_list_processed_file_ids_parses_objection_service_response(monkeypatch: pytest.MonkeyPatch) -> None:
    """Returns UUIDs from the objection service processed-file-ids endpoint."""
    project_id = uuid4()
    file_id = uuid4()
    mock_get = AsyncMock(return_value=_make_response({"file_ids": [str(file_id)]}))
    monkeypatch.setattr(ObjectionsServiceClient, "get", mock_get)

    result = await ObjectionsServiceClient.list_processed_file_ids(project_id)

    assert result == [file_id]
    mock_get.assert_awaited_once_with(f"{ObjectionsServiceClient.BASE_URL}/{project_id}/ewms/processed-file-ids")


@pytest.mark.asyncio
async def test_get_latest_project_version_reads_pls_response(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    mock_get = AsyncMock(return_value=_make_response({"latest_version": EXPECTED_LATEST_VERSION}))
    monkeypatch.setattr(PlsApiClient, "get", mock_get)

    result = await PlsApiClient.get_latest_project_version(project_id)

    assert result == EXPECTED_LATEST_VERSION
    mock_get.assert_awaited_once_with(f"{PlsApiClient.BASE_URL}/projects/{project_id}/latest-version")


@pytest.mark.asyncio
async def test_update_project_status_patches_pls_without_project_version(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    mock_patch = AsyncMock(return_value=_make_response({}))
    monkeypatch.setattr(PlsApiClient, "patch", mock_patch)

    await PlsApiClient.update_project_status(project_id, "IN_PROGRESS")

    mock_patch.assert_awaited_once_with(
        f"{PlsApiClient.BASE_URL}/projects/{project_id}/status",
        json={"internalName": "IN_PROGRESS"},
        include_project_version=False,
    )
