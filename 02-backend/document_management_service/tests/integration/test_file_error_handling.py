import uuid

import pytest
from fastapi import status

_PDF_CONTENT = b"%PDF-1.4 mock content"


@pytest.mark.integration
async def test_get_file_not_found(integration_client):
    """GET /v2/files/{random} returns 404 for non-existent UUID."""
    resp = await integration_client.get(f"/v2/files/{uuid.uuid4()}")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
async def test_get_versions_not_found(integration_client):
    """GET /v2/files/{random}/versions returns 404 for non-existent file."""
    resp = await integration_client.get(f"/v2/files/{uuid.uuid4()}/versions")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
async def test_update_file_not_found(integration_client):
    """PATCH /v2/files/{random} returns 404 for non-existent file."""
    resp = await integration_client.patch(
        f"/v2/files/{uuid.uuid4()}",
        json={"mimeType": "application/pdf"},
    )
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
async def test_delete_file_not_found(integration_client):
    """DELETE /v2/files/{random} (soft) returns 404 for non-existent file."""
    resp = await integration_client.delete(f"/v2/files/{uuid.uuid4()}")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
async def test_delete_file_not_found_hard(integration_client):
    """DELETE /v2/files/{random}?soft=false returns 404 for non-existent file."""
    resp = await integration_client.delete(f"/v2/files/{uuid.uuid4()}?soft=false")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
async def test_generate_download_url_not_found(integration_client):
    """GET /v2/files/{random}/generate-download-url returns 404."""
    resp = await integration_client.get(f"/v2/files/{uuid.uuid4()}/generate-download-url")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
async def test_generate_upload_url_invalid_extension(integration_client):
    """POST generate-upload-url with .exe extension returns 415."""
    resp = await integration_client.post(
        "/v2/files/generate-upload-url",
        json={
            "type": "document",
            "projectId": str(uuid.uuid4()),
            "filename": "evil.exe",
        },
    )
    assert resp.status_code == status.HTTP_415_UNSUPPORTED_MEDIA_TYPE


@pytest.mark.integration
async def test_generate_upload_url_no_extension(integration_client):
    """POST generate-upload-url with no file extension returns 415."""
    resp = await integration_client.post(
        "/v2/files/generate-upload-url",
        json={
            "type": "document",
            "projectId": str(uuid.uuid4()),
            "filename": "noextension",
        },
    )
    assert resp.status_code == status.HTTP_415_UNSUPPORTED_MEDIA_TYPE


@pytest.mark.integration
async def test_confirm_upload_not_in_storage(integration_client):
    """POST confirm-upload without actually uploading the file returns 404."""
    project_id = uuid.uuid4()
    filename = f"ghost_{uuid.uuid4()}.pdf"

    # Generate upload URL but skip the PUT step
    resp = await integration_client.post(
        "/v2/files/generate-upload-url",
        json={
            "type": "document",
            "projectId": str(project_id),
            "filename": filename,
        },
    )
    assert resp.status_code == status.HTTP_200_OK

    # Confirm without uploading — file not in storage
    resp = await integration_client.post(
        "/v2/files/confirm-upload",
        json={
            "type": "document",
            "projectId": str(project_id),
            "filename": filename,
        },
    )
    assert resp.status_code == status.HTTP_404_NOT_FOUND
