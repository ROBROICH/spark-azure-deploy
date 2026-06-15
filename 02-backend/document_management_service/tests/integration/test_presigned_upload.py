import uuid

import httpx
import pytest
from fastapi import status

from tests.integration.helpers.upload import upload_file_via_presigned_url


@pytest.mark.integration
async def test_presigned_upload_pdf_roundtrip(integration_client):
    """Upload PDF via presigned URL → download → verify content identical."""
    project_id = uuid.uuid4()
    filename = f"roundtrip_{uuid.uuid4()}.pdf"
    file_content = b"%PDF-1.4 integration test PDF content"

    result = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=file_content,
        file_type="document",
        project_id=project_id,
    )
    file_id = result["id"]

    try:
        # Generate download URL
        resp = await integration_client.get(f"/v2/files/{file_id}/generate-download-url")
        assert resp.status_code == status.HTTP_200_OK
        download_url = resp.json()["downloadUrl"]

        # Download and verify content matches
        async with httpx.AsyncClient() as dl_client:
            dl_resp = await dl_client.get(download_url)
        assert dl_resp.status_code == status.HTTP_200_OK
        assert dl_resp.content == file_content
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")


@pytest.mark.integration
async def test_presigned_upload_correct_metadata(integration_client):
    """Verify response fields match input (filename, type, project_id, etc.)."""
    project_id = uuid.uuid4()
    filename = f"metadata_{uuid.uuid4()}.pdf"
    file_content = b"%PDF-1.4 metadata test content"

    result = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=file_content,
        file_type="document",
        project_id=project_id,
    )
    file_id = result["id"]

    try:
        assert result["filename"] == filename
        assert result["type"] == "document"
        assert result["projectId"] == str(project_id)
        assert result["mimeType"] == "application/pdf"
        assert result["version"] == 1
        assert "bucketPath" in result
        assert "createdAt" in result
        assert "updatedAt" in result
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")
