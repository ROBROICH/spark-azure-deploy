from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import status

from src.models.db.db_models import File, FileTopic
from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import WorkflowStatusEnum
from src.models.schemas.approval_schema import FileDiffResponse
from src.models.schemas.file_schema import (
    ProjectDocumentUpload,
    StartFileProcessingRequest,
    StartFileProcessingResponse,
)


@pytest.mark.asyncio
async def test_list_files_with_filters(client):
    """Test listing with type + project + name filter"""
    project_id = uuid4()
    file_id = uuid4()
    topic_id = uuid4()

    mock_files = [
        File(
            id=file_id,
            type=FileTypeEnum.DOCUMENT,
            filename="report_2025.pdf",
            project_id=project_id,
            is_deleted=False,
            bucket_path=f"documents/{project_id}/report_2025.pdf",
            mime_type="application/pdf",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
            version=1,
            project_version=1,
            topics=[FileTopic(topic_id=topic_id, file_id=file_id)],
        )
    ]

    with patch(
        "src.services.files.file_service.FileService.list_files",
        return_value=mock_files,
    ):
        response = await client.get(
            "/v2/files",
            params={
                "file_type": "document",
                "projectId": str(project_id),
                "include_deleted": False,
                "project_version": 1,
                "name": "report",
                "topicIds": [str(topic_id)],
                "page": 1,
                "page_size": 10,
            },
        )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["filename"] == "report_2025.pdf"


@pytest.mark.asyncio
async def test_list_files_empty_result(client):
    """Test empty list when no files match"""
    with patch(
        "src.services.files.file_service.FileService.list_files",
        return_value=[],
    ):
        response = await client.get("/v2/files?file_type=document&project_version=1")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []


@pytest.mark.asyncio
async def test_get_file_success(client):
    """Test retrieving a file by ID"""
    file_id = uuid4()
    mock_file = File(
        id=file_id,
        type=FileTypeEnum.DOCUMENT,
        is_deleted=False,
        filename="test.pdf",
        project_id=uuid4(),
        bucket_path="documents/.../test.pdf",
        mime_type="application/pdf",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        version=1,
        project_version=1,
        topics=[],
    )

    with patch(
        "src.services.files.file_service.FileService.get_file",
        return_value=mock_file,
    ):
        response = await client.get(f"/v2/files/{file_id}?project_version=1")

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == str(file_id)
    assert data["filename"] == "test.pdf"


@pytest.mark.asyncio
async def test_get_file_not_found(client):
    """Test 404 when file doesn't exist"""
    file_id = uuid4()
    with patch(
        "src.services.files.file_service.FileService.get_file",
        return_value=None,
    ):
        response = await client.get(f"/v2/files/{file_id}?project_version=1")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert response.json()["detail"] == "File not found"


@pytest.mark.asyncio
async def test_update_file_success(client):
    """Test updating file metadata"""
    file_id = uuid4()
    topic_id = str(uuid4())
    payload = {"mime_type": "application/custom", "topics": [topic_id]}
    updated_file = File(
        id=file_id,
        type=FileTypeEnum.DOCUMENT,
        filename="updated.pdf",
        is_deleted=False,
        bucket_path="documents/.../updated.pdf",
        mime_type="application/custom",
        project_id=uuid4(),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        version=1,
        project_version=1,
        topics=[FileTopic(id=uuid4(), file_id=file_id, topic_id=topic_id)],
    )

    with patch(
        "src.services.files.file_service.FileService.update_file",
        return_value=updated_file,
    ):
        response = await client.patch(f"/v2/files/{file_id}?project_version=1", json=payload)

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["mimeType"] == "application/custom"
    assert response.json()["topics"] == [topic_id]


@pytest.mark.asyncio
async def test_delete_file_success(client):
    """Test successful file deletion"""
    file_id = uuid4()
    deleted_file = File(
        id=file_id,
        filename="delete-me.pdf",
        type=FileTypeEnum.DOCUMENT,
        is_deleted=False,
        bucket_path="documents/.../delete-me.pdf",
        mime_type="application/custom",
        project_id=uuid4(),
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        version=1,
        project_version=1,
        topics=[],
    )

    with patch(
        "src.services.files.file_service.FileService.delete_file",
        return_value=deleted_file,
    ):
        response = await client.delete(f"/v2/files/{file_id}?project_version=1")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == str(file_id)


@pytest.mark.asyncio
async def test_generate_download_url_success(client):
    """Test generating signed download URL"""
    file_id = uuid4()
    mock_file = File(id=file_id, bucket_path="some/path.pdf", mime_type="application/pdf")
    signed_url = "https://storage.example.com/signed-url"

    with patch(
        "src.services.files.file_service.FileService.generate_download_url",
        return_value=(mock_file, signed_url),
    ):
        response = await client.get(f"/v2/files/{file_id}/generate-download-url?project_version=1")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["downloadUrl"] == signed_url


@pytest.mark.asyncio
async def test_generate_upload_url_success(client):
    """Test generating signed upload URL"""
    project_id = uuid4()
    payload = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="upload-me.pdf",
    )

    signed_url = "https://storage.example.com/upload-url"
    mime_type = "application/pdf"

    with patch(
        "src.services.files.file_service.FileService.generate_upload_url",
        return_value=(signed_url, mime_type),
    ):
        response = await client.post(
            "/v2/files/generate-upload-url",
            json=payload.model_dump(mode="json", by_alias=True),
        )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["uploadUrl"] == signed_url
    assert data["mimeType"] == mime_type


@pytest.mark.asyncio
async def test_confirm_upload_success(client):
    """Test confirming a direct upload"""
    project_id = uuid4()
    payload = ProjectDocumentUpload(
        type="document",
        project_id=project_id,
        filename="confirmed.pdf",
    )

    confirmed_file = File(
        id=uuid4(),
        type=FileTypeEnum.DOCUMENT,
        filename="confirmed.pdf",
        is_deleted=False,
        project_id=project_id,
        bucket_path=f"documents/{project_id}/confirmed.pdf",
        mime_type="application/pdf",
        version=1,
        project_version=1,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
        topics=[],
    )

    with patch(
        "src.services.files.file_service.FileService.confirm_upload",
        return_value=confirmed_file,
    ):
        response = await client.post(
            "/v2/files/confirm-upload",
            json=payload.model_dump(mode="json", by_alias=True),
        )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["filename"] == "confirmed.pdf"
    assert data["projectId"] == str(project_id)


@pytest.mark.asyncio
async def test_confirm_upload_file_not_in_bucket(client):
    """Test 404 when file missing after upload"""
    payload = ProjectDocumentUpload(
        type="document",
        project_id=uuid4(),
        filename="ghost.pdf",
    )

    with patch(
        "src.services.files.file_service.FileService.confirm_upload",
        side_effect=FileNotFoundError,
    ):
        response = await client.post(
            "/v2/files/confirm-upload",
            json=payload.model_dump(mode="json", by_alias=True),
        )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "not found" in response.json()["detail"]


@pytest.mark.asyncio
async def test_start_file_processing_success(client):
    """Test starting a file processing workflow via start-file-processing"""
    project_id = uuid4()
    payload = StartFileProcessingRequest(
        file_id=uuid4(),
        project_id=project_id,
    )

    mock_response = StartFileProcessingResponse(
        workflow_id="file-processing-xxx",
        run_id="run-abc123",
        workflow_status=WorkflowStatusEnum.PENDING,
    )

    with patch(
        "src.services.files.file_service.FileService.start_file_processing",
        return_value=mock_response,
    ):
        response = await client.post(
            "/v2/files/start-file-processing",
            json=payload.model_dump(mode="json", by_alias=True),
        )

    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["workflowId"] == "file-processing-xxx"
    assert data["runId"] == "run-abc123"
    assert data["workflowStatus"] == WorkflowStatusEnum.PENDING.value


@pytest.mark.asyncio
async def test_start_file_processing_file_not_found(client):
    """Test 404 when uploaded file is not found in storage"""
    payload = StartFileProcessingRequest(
        file_id=uuid4(),
        project_id=uuid4(),
    )

    with patch(
        "src.services.files.file_service.FileService.start_file_processing",
        side_effect=FileNotFoundError,
    ):
        response = await client.post(
            "/v2/files/start-file-processing",
            json=payload.model_dump(mode="json", by_alias=True),
        )

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "not found" in response.json()["detail"]


# --- Security tests: internal file types must be rejected on public endpoints ---


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "endpoint",
    ["/v2/files/generate-upload-url", "/v2/files/confirm-upload"],
)
@pytest.mark.parametrize(
    "payload",
    [
        {
            "type": "temporal_checkpoint",
            "filename": "checkpoint.json",
            "workflowId": "wf-123",
            "runId": "run-456",
        },
        {
            "type": "content_extraction",
            "filename": "extracted.json",
            "projectId": "00000000-0000-0000-0000-000000000001",
        },
        {
            "type": "law_data",
            "filename": "law.json",
        },
        {
            "type": "erwiderungs_export",
            "filename": "export.csv",
            "projectId": "00000000-0000-0000-0000-000000000001",
        },
    ],
    ids=["temporal_checkpoint", "content_extraction", "law_data", "erwiderungs_export"],
)
async def test_internal_file_types_rejected_by_public_endpoints(client, endpoint, payload):
    """Internal file types must return 422 on public upload endpoints."""
    response = await client.post(endpoint, json=payload)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "endpoint",
    ["/v2/files/generate-upload-url", "/v2/files/confirm-upload"],
)
async def test_unknown_file_type_rejected(client, endpoint):
    """Unknown/fabricated file types must return 422."""
    payload = {
        "type": "malicious_type",
        "filename": "evil.pdf",
        "projectId": "00000000-0000-0000-0000-000000000001",
    }
    response = await client.post(endpoint, json=payload)
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


# --- Internal endpoint guard tests ---


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "endpoint",
    [
        "/v2/internal/files/generate-upload-url",
        "/v2/internal/files/confirm-upload",
    ],
)
async def test_internal_endpoints_reject_requests_with_auth_header(client, endpoint):
    """Requests with Authorization header (= external via Envoy) must be blocked."""
    payload = {
        "type": "content_extraction",
        "filename": "extracted.json",
        "projectId": "00000000-0000-0000-0000-000000000001",
    }
    response = await client.post(
        endpoint,
        json=payload,
        headers={"Authorization": "Bearer fake-jwt-token"},
    )
    assert response.status_code == status.HTTP_403_FORBIDDEN


@pytest.mark.asyncio
async def test_internal_endpoint_allows_requests_without_auth_header(client):
    """Requests without Authorization header (= internal K8s service) are allowed."""
    signed_url = "https://storage.example.com/upload-url"
    mime_type = "application/json"

    with patch(
        "src.services.files.file_service.FileService.generate_upload_url",
        return_value=(signed_url, mime_type),
    ):
        response = await client.post(
            "/v2/internal/files/generate-upload-url",
            json={
                "type": "content_extraction",
                "filename": "extracted.json",
                "projectId": "00000000-0000-0000-0000-000000000001",
            },
        )

    assert response.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
async def test_internal_get_zip_diff_uses_source_version(client):
    project_id = uuid4()
    zip_file_id = uuid4()
    get_zip_file = AsyncMock(return_value=SimpleNamespace(project_id=project_id))
    get_file_diff = AsyncMock(return_value=FileDiffResponse())

    with (
        patch("src.services.zip_files.zip_file_service.ZipFileService.get_zip_file", get_zip_file),
        patch("src.services.zip_files.zip_file_service.ZipFileService.get_file_diff", get_file_diff),
    ):
        response = await client.get(
            f"/v2/internal/files/{project_id}/zips/{zip_file_id}/diff",
            params={"source_version": 2},
        )

    assert response.status_code == status.HTTP_200_OK
    get_zip_file.assert_awaited_once_with(zip_file_id, project_version=2)
    get_file_diff.assert_awaited_once_with(zip_file_id, project_version=2)


@pytest.mark.asyncio
async def test_public_endpoint_allows_erwiderungs_import(client):
    """Erwiderungs CSV imports are accepted via public upload endpoints."""
    signed_url = "https://storage.example.com/upload-url"
    mime_type = "text/csv"

    with patch(
        "src.services.files.file_service.FileService.generate_upload_url",
        return_value=(signed_url, mime_type),
    ):
        response = await client.post(
            "/v2/files/generate-upload-url",
            json={
                "type": "erwiderungs_import",
                "filename": "import.csv",
                "projectId": "00000000-0000-0000-0000-000000000001",
            },
        )

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["mimeType"] == "text/csv"
