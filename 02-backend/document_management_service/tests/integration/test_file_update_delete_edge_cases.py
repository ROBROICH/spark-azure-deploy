import uuid

import pytest
from fastapi import status

from tests.integration.helpers.upload import upload_file_via_presigned_url

_PDF_CONTENT = b"%PDF-1.4 update/delete edge case content"


@pytest.mark.integration
async def test_update_vector_searchable(integration_client):
    """PATCH vectorSearchable=true persists on re-GET."""
    project_id = uuid.uuid4()
    filename = f"vector_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    try:
        # Patch vectorSearchable
        resp = await integration_client.patch(
            f"/v2/files/{file_id}",
            json={"vectorSearchable": True},
        )
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["vectorSearchable"] is True

        # Verify on re-GET
        resp = await integration_client.get(f"/v2/files/{file_id}")
        assert resp.status_code == status.HTTP_200_OK
        assert resp.json()["vectorSearchable"] is True
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")


@pytest.mark.integration
async def test_update_empty_payload(integration_client):
    """PATCH with empty payload returns 200 without changing anything."""
    project_id = uuid.uuid4()
    filename = f"empty_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    try:
        original_resp = await integration_client.get(f"/v2/files/{file_id}")
        original = original_resp.json()

        resp = await integration_client.patch(f"/v2/files/{file_id}", json={})
        assert resp.status_code == status.HTTP_200_OK
        updated = resp.json()

        # Key fields unchanged
        assert updated["filename"] == original["filename"]
        assert updated["mimeType"] == original["mimeType"]
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")


@pytest.mark.integration
async def test_hard_delete_removes_from_storage(integration_client):
    """Hard delete removes the file; GET and download both return 404."""
    project_id = uuid.uuid4()
    filename = f"harddelete_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    # Hard delete
    resp = await integration_client.delete(f"/v2/files/{file_id}?soft=false")
    assert resp.status_code == status.HTTP_200_OK

    # GET should 404
    resp = await integration_client.get(f"/v2/files/{file_id}")
    assert resp.status_code == status.HTTP_404_NOT_FOUND

    # Download URL should 404
    resp = await integration_client.get(f"/v2/files/{file_id}/generate-download-url")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
async def test_double_soft_delete(integration_client):
    """Soft-deleting an already soft-deleted file returns 404."""
    project_id = uuid.uuid4()
    filename = f"doublesoftdel_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    try:
        # First soft delete succeeds
        resp = await integration_client.delete(f"/v2/files/{file_id}")
        assert resp.status_code == status.HTTP_200_OK

        # Second soft delete — file is already "gone"
        resp = await integration_client.delete(f"/v2/files/{file_id}")
        assert resp.status_code == status.HTTP_404_NOT_FOUND
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")


@pytest.mark.integration
async def test_hard_delete_after_soft_delete(integration_client):
    """Soft → hard delete both succeed; final GET returns 404."""
    project_id = uuid.uuid4()
    filename = f"softhard_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    # Soft delete
    resp = await integration_client.delete(f"/v2/files/{file_id}")
    assert resp.status_code == status.HTTP_200_OK

    # Hard delete
    resp = await integration_client.delete(f"/v2/files/{file_id}?soft=false")
    assert resp.status_code == status.HTTP_200_OK

    # Final GET — truly gone
    resp = await integration_client.get(f"/v2/files/{file_id}")
    assert resp.status_code == status.HTTP_404_NOT_FOUND
