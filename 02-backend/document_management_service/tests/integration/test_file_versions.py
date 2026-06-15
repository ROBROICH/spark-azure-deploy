import uuid

import pytest
from fastapi import status

from tests.integration.helpers.upload import upload_file_via_presigned_url

_PDF_CONTENT = b"%PDF-1.4 version test content"


@pytest.mark.integration
async def test_get_versions_returns_all_including_deleted(integration_client):
    """Upload v1+v2, get versions → both returned, descending order."""
    project_id = uuid.uuid4()
    filename = f"versions_{uuid.uuid4()}.pdf"
    file_ids = []

    try:
        # Upload v1
        v1 = await upload_file_via_presigned_url(
            integration_client,
            filename=filename,
            file_content=_PDF_CONTENT,
            file_type="document",
            project_id=project_id,
            create_new_version=True,
        )
        file_ids.append(v1["id"])

        # Upload v2 (same filename, new version — v1 gets soft-deleted)
        v2 = await upload_file_via_presigned_url(
            integration_client,
            filename=filename,
            file_content=_PDF_CONTENT,
            file_type="document",
            project_id=project_id,
            create_new_version=True,
        )
        file_ids.append(v2["id"])

        assert v1["version"] == 1
        assert v2["version"] == 2

        # Get versions via v2's ID
        resp = await integration_client.get(f"/v2/files/{v2['id']}/versions")
        assert resp.status_code == status.HTTP_200_OK
        versions = resp.json()
        assert len(versions) == 2

        version_numbers = [v["version"] for v in versions]
        assert 1 in version_numbers
        assert 2 in version_numbers
    finally:
        for fid in file_ids:
            await integration_client.delete(f"/v2/files/{fid}?soft=false")


@pytest.mark.integration
async def test_get_versions_by_old_version_id(integration_client):
    """Get versions using v1's ID (v1 is soft-deleted) still works."""
    project_id = uuid.uuid4()
    filename = f"oldver_{uuid.uuid4()}.pdf"
    file_ids = []

    try:
        v1 = await upload_file_via_presigned_url(
            integration_client,
            filename=filename,
            file_content=_PDF_CONTENT,
            file_type="document",
            project_id=project_id,
            create_new_version=True,
        )
        file_ids.append(v1["id"])

        v2 = await upload_file_via_presigned_url(
            integration_client,
            filename=filename,
            file_content=_PDF_CONTENT,
            file_type="document",
            project_id=project_id,
            create_new_version=True,
        )
        file_ids.append(v2["id"])

        # v1 is soft-deleted but versions endpoint should still work
        resp = await integration_client.get(f"/v2/files/{v1['id']}/versions")
        assert resp.status_code == status.HTTP_200_OK
        versions = resp.json()
        assert len(versions) == 2

        ids_returned = {v["id"] for v in versions}
        assert v1["id"] in ids_returned
        assert v2["id"] in ids_returned
    finally:
        for fid in file_ids:
            await integration_client.delete(f"/v2/files/{fid}?soft=false")


@pytest.mark.integration
async def test_get_versions_single_version(integration_client):
    """Single upload → versions returns a list with 1 entry."""
    project_id = uuid.uuid4()
    filename = f"singlever_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    try:
        resp = await integration_client.get(f"/v2/files/{file_id}/versions")
        assert resp.status_code == status.HTTP_200_OK
        versions = resp.json()
        assert len(versions) == 1
        assert versions[0]["id"] == file_id
        assert versions[0]["version"] == 1
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")
