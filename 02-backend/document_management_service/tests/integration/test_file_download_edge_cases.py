import uuid

import httpx
import pytest
from fastapi import status

from tests.integration.helpers.upload import upload_file_via_presigned_url

_PDF_CONTENT = b"%PDF-1.4 download edge case content"


@pytest.mark.integration
async def test_download_url_inline(integration_client):
    """Download URL with ?inline=true returns Content-Disposition: inline."""
    project_id = uuid.uuid4()
    filename = f"inline_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    try:
        resp = await integration_client.get(
            f"/v2/files/{file_id}/generate-download-url",
            params={"inline": "true"},
        )
        assert resp.status_code == status.HTTP_200_OK
        download_url = resp.json()["downloadUrl"]

        # Fetch the actual file and check Content-Disposition
        async with httpx.AsyncClient() as client:
            dl_resp = await client.get(download_url)
        assert dl_resp.status_code == status.HTTP_200_OK
        content_disp = dl_resp.headers.get("content-disposition", "")
        assert "inline" in content_disp
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")


@pytest.mark.integration
async def test_download_soft_deleted_with_include_deleted(integration_client):
    """Soft-deleted file can still be downloaded with includeDeleted=true."""
    project_id = uuid.uuid4()
    filename = f"softdl_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    try:
        # Soft-delete
        resp = await integration_client.delete(f"/v2/files/{file_id}")
        assert resp.status_code == status.HTTP_200_OK

        # Download with includeDeleted=true
        resp = await integration_client.get(
            f"/v2/files/{file_id}/generate-download-url",
            params={"includeDeleted": "true"},
        )
        assert resp.status_code == status.HTTP_200_OK
        download_url = resp.json()["downloadUrl"]

        # Verify URL actually works
        async with httpx.AsyncClient() as client:
            dl_resp = await client.get(download_url)
        assert dl_resp.status_code == status.HTTP_200_OK
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")


@pytest.mark.integration
async def test_download_soft_deleted_without_include_deleted(integration_client):
    """Soft-deleted file returns 404 on download without includeDeleted."""
    project_id = uuid.uuid4()
    filename = f"softdl_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    try:
        # Soft-delete
        resp = await integration_client.delete(f"/v2/files/{file_id}")
        assert resp.status_code == status.HTTP_200_OK

        # Default download (includeDeleted=false)
        resp = await integration_client.get(f"/v2/files/{file_id}/generate-download-url")
        assert resp.status_code == status.HTTP_404_NOT_FOUND
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")
