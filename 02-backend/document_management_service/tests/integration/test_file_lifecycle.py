import uuid
from collections.abc import AsyncGenerator
from typing import Any

import httpx
import pytest
from fastapi import status

from tests.integration.helpers.upload import upload_file_via_presigned_url

_PDF_CONTENT = b"%PDF-1.4 mock content"


@pytest.fixture
async def create_test_file(integration_client) -> AsyncGenerator[dict, Any]:
    """Create a real file via presigned URL upload and clean up after."""
    project_id = uuid.uuid4()
    file_name = f"testfile_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=file_name,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )

    yield file_data

    file_id = file_data["id"]

    # Cleanup
    resp = await integration_client.delete(f"/v2/files/{file_id}?soft=false")
    assert resp.status_code == status.HTTP_200_OK


@pytest.mark.integration
async def test_file_versioning(integration_client):
    project_id = uuid.uuid4()
    file_name = f"testfile_{uuid.uuid4()}.pdf"

    # Upload v1
    file_data_1 = await upload_file_via_presigned_url(
        integration_client,
        filename=file_name,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
        create_new_version=True,
    )

    # Upload v2 (same filename, new version)
    file_data_2 = await upload_file_via_presigned_url(
        integration_client,
        filename=file_name,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
        create_new_version=True,
    )

    assert file_data_1["version"] == 1
    assert file_data_2["version"] == 2

    # Get versions
    resp = await integration_client.get(f"/v2/files/{file_data_1['id']}/versions")
    assert resp.status_code == status.HTTP_200_OK
    version_list = resp.json()
    assert len(version_list) == 2

    # Cleanup
    for file_id in [file_data_1["id"], file_data_2["id"]]:
        resp = await integration_client.delete(f"/v2/files/{file_id}?soft=false")
        assert resp.status_code == status.HTTP_200_OK


@pytest.mark.integration
async def test_confirm_upload_exists_raises_exception(integration_client):
    project_id = uuid.uuid4()
    file_name = f"testfile_{uuid.uuid4()}.pdf"

    # Upload file
    file_data_1 = await upload_file_via_presigned_url(
        integration_client,
        filename=file_name,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
        create_new_version=False,
    )
    assert file_data_1["version"] == 1

    # Attempt duplicate upload without create_new_version — should conflict
    # The conflict happens at generate-upload-url stage
    resp = await integration_client.post(
        "/v2/files/generate-upload-url",
        json={
            "type": "document",
            "projectId": str(project_id),
            "filename": file_name,
            "createNewVersion": False,
        },
    )
    assert resp.status_code == status.HTTP_409_CONFLICT

    # Cleanup
    resp = await integration_client.delete(f"/v2/files/{file_data_1['id']}?soft=false")
    assert resp.status_code == status.HTTP_200_OK


@pytest.mark.integration
async def test_list_files(integration_client, create_test_file):
    project_id = create_test_file["projectId"]
    file_name = create_test_file["filename"]
    file_id = create_test_file["id"]

    resp = await integration_client.get(
        "/v2/files",
        params={
            "file_type": "document",
            "projectId": str(project_id),
            "name": file_name[:10],  # partial match
        },
    )
    assert resp.status_code == status.HTTP_200_OK
    results = resp.json()
    assert len(results) >= 1
    match = next(f for f in results if f["id"] == file_id)
    assert match["filename"] == file_name


@pytest.mark.integration
async def test_get_file(integration_client, create_test_file):
    file_id = create_test_file["id"]

    resp = await integration_client.get(f"/v2/files/{file_id}")
    assert resp.status_code == status.HTTP_200_OK
    file_data = resp.json()
    assert file_data["id"] == file_id
    assert file_data["filename"] == create_test_file["filename"]


@pytest.mark.integration
async def test_update_file(integration_client, create_test_file):
    file_id = create_test_file["id"]
    payload = {"mimeType": "application/custom"}

    resp = await integration_client.patch(f"/v2/files/{file_id}", json=payload)
    assert resp.status_code == status.HTTP_200_OK
    file_data = resp.json()
    assert file_data["id"] == file_id
    assert file_data["mimeType"] == "application/custom"


@pytest.mark.integration
async def test_soft_delete_file(integration_client):
    project_id = uuid.uuid4()
    file_name = f"deletefile_{uuid.uuid4()}.pdf"

    # Upload via presigned URL flow
    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=file_name,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    # Soft Delete
    resp = await integration_client.delete(f"/v2/files/{file_id}")
    assert resp.status_code == status.HTTP_200_OK
    deleted = resp.json()
    assert deleted["id"] == file_id

    # Verify gone
    resp = await integration_client.get(f"/v2/files/{file_id}")
    assert resp.status_code == status.HTTP_404_NOT_FOUND

    # Clean up
    resp = await integration_client.delete(f"/v2/files/{file_id}?soft=false")
    assert resp.status_code == status.HTTP_200_OK


@pytest.mark.integration
async def test_generate_upload_signed_url(integration_client):
    project_id = uuid.uuid4()
    file_name = f"upload_test_{uuid.uuid4()}.pdf"

    payload = {
        "type": "document",
        "project_id": str(project_id),
        "filename": file_name,
    }

    resp = await integration_client.post("/v2/files/generate-upload-url", json=payload)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert "uploadUrl" in data
    assert data["mimeType"] == "application/pdf"


@pytest.mark.integration
async def test_generate_download_signed_url(integration_client, create_test_file):
    file_id = create_test_file["id"]

    resp = await integration_client.get(f"/v2/files/{file_id}/generate-download-url")
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    assert "downloadUrl" in data
    assert data["downloadUrl"].startswith("https://") or data["downloadUrl"].startswith("http://")


@pytest.mark.integration
async def test_confirm_upload_full_flow(integration_client):
    """
    Full v2 flow:
    1. Generate signed upload URL
    2. PUT file to S3-compatible storage
    3. Confirm upload
    4. Download via signed URL
    5. Delete
    """
    project_id = uuid.uuid4()
    file_name = f"fullflow_{uuid.uuid4()}.pdf"
    file_content = b"%PDF-1.4 full integration test content"

    # 1. Generate upload URL
    payload = {
        "type": "document",
        "project_id": str(project_id),
        "filename": file_name,
    }
    resp = await integration_client.post("/v2/files/generate-upload-url", json=payload)
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    upload_url = data["uploadUrl"]
    mime_type = data["mimeType"]

    # 2. Upload directly to signed URL
    async with httpx.AsyncClient() as client:
        put_resp = await client.put(
            upload_url,
            content=file_content,
            headers={"Content-Type": mime_type},
        )
    assert put_resp.status_code in (200, 201, 204)

    # 3. Confirm upload
    confirm_payload = {
        "type": "document",
        "project_id": str(project_id),
        "filename": file_name,
    }
    resp = await integration_client.post("/v2/files/confirm-upload", json=confirm_payload)
    assert resp.status_code == status.HTTP_200_OK
    file_data = resp.json()
    file_id = file_data["id"]
    assert file_data["filename"] == file_name

    # 4. Generate download URL and fetch content
    resp = await integration_client.get(f"/v2/files/{file_id}/generate-download-url")
    assert resp.status_code == status.HTTP_200_OK
    download_url = resp.json()["downloadUrl"]

    async with httpx.AsyncClient() as client:
        dl_resp = await client.get(download_url, headers={"Content-Type": mime_type})
    assert dl_resp.status_code == status.HTTP_200_OK
    assert dl_resp.content == file_content

    # 5. Delete
    resp = await integration_client.delete(f"/v2/files/{file_id}?soft=false")
    assert resp.status_code == status.HTTP_200_OK
