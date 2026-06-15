import uuid

import pytest
from fastapi import status

from tests.integration.helpers.upload import (
    create_zip_bytes,
    delete_zip_file,
    upload_file_via_presigned_url,
)


@pytest.fixture
def sample_zip_content() -> bytes:
    """ZIP bytes with two PDF files, one in a subdirectory."""
    return create_zip_bytes(
        {
            "doc1.pdf": b"%PDF-1.4 first document content",
            "subdir/doc2.pdf": b"%PDF-1.4 second document content",
        }
    )


@pytest.fixture
async def uploaded_zip(integration_client, sample_zip_content):
    """Upload a ZIP via presigned URL, yield response, hard-delete on teardown."""
    project_id = uuid.uuid4()
    filename = f"test_upload_{uuid.uuid4()}.zip"

    result = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=sample_zip_content,
        file_type="zip",
        project_id=project_id,
    )

    yield result

    # Teardown: hard-delete the zip file
    file_id = result["id"]
    await delete_zip_file(file_id)


@pytest.mark.integration
async def test_zip_upload_via_presigned_url(uploaded_zip):
    """Full presigned URL flow for ZIP. Verifies ZipFileResponse fields."""
    data = uploaded_zip

    assert data["id"] is not None
    assert data["filename"].endswith(".zip")
    assert data["projectId"] is not None
    assert data["workflowStatus"] == "PENDING"
    assert "bucketPath" in data
    assert "createdAt" in data
    assert "updatedAt" in data


@pytest.mark.integration
async def test_zip_upload_duplicate_fails(integration_client, sample_zip_content):
    """Uploading the same ZIP filename twice to the same project fails."""
    project_id = uuid.uuid4()
    filename = f"duplicate_{uuid.uuid4()}.zip"

    result = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=sample_zip_content,
        file_type="zip",
        project_id=project_id,
    )
    file_id = result["id"]

    try:
        # Second upload with same filename — should fail at generate-upload-url
        # because the object already exists in storage
        generate_payload = {
            "type": "zip",
            "projectId": str(project_id),
            "filename": filename,
        }
        resp = await integration_client.post("/v2/files/generate-upload-url", json=generate_payload)
        # The API rejects this — zip already exists
        assert resp.status_code == status.HTTP_409_CONFLICT
    finally:
        await delete_zip_file(file_id)


@pytest.mark.integration
async def test_zip_versioning_not_supported(integration_client, sample_zip_content):
    """ZIP files do not support versioning — second upload with
    create_new_version=True should fail because the storage object
    already exists at the same path (version is always 1 for zips)."""
    project_id = uuid.uuid4()
    filename = f"versioned_{uuid.uuid4()}.zip"

    result = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=sample_zip_content,
        file_type="zip",
        project_id=project_id,
    )
    file_id = result["id"]

    try:
        # Attempting to upload the same zip again with create_new_version=True
        # should fail — zip versioning is not supported
        generate_payload = {
            "type": "zip",
            "projectId": str(project_id),
            "filename": filename,
            "createNewVersion": True,
        }
        resp = await integration_client.post("/v2/files/generate-upload-url", json=generate_payload)
        # Zip versioning is not supported — rejected as conflict
        assert resp.status_code == status.HTTP_409_CONFLICT
    finally:
        await delete_zip_file(file_id)
