import uuid

import pytest
from fastapi import status

from tests.integration.helpers.upload import upload_file_via_presigned_url

_PDF_CONTENT = b"%PDF-1.4 list edge case content"


@pytest.mark.integration
async def test_list_files_empty_result(integration_client):
    """List files for a project with no uploads returns empty list."""
    resp = await integration_client.get(
        "/v2/files",
        params={
            "file_type": "document",
            "projectId": str(uuid.uuid4()),
        },
    )
    assert resp.status_code == status.HTTP_200_OK
    assert resp.json() == []


@pytest.mark.integration
async def test_list_files_pagination(integration_client):
    """Upload 3 files, page_size=2 → page 1 has 2, page 2 has 1, no overlap."""
    project_id = uuid.uuid4()
    file_ids = []

    try:
        for i in range(3):
            file_data = await upload_file_via_presigned_url(
                integration_client,
                filename=f"page_{i}_{uuid.uuid4()}.pdf",
                file_content=_PDF_CONTENT,
                file_type="document",
                project_id=project_id,
            )
            file_ids.append(file_data["id"])

        # Page 1
        resp = await integration_client.get(
            "/v2/files",
            params={
                "file_type": "document",
                "projectId": str(project_id),
                "page": 1,
                "page_size": 2,
            },
        )
        assert resp.status_code == status.HTTP_200_OK
        page1 = resp.json()
        assert len(page1) == 2

        # Page 2
        resp = await integration_client.get(
            "/v2/files",
            params={
                "file_type": "document",
                "projectId": str(project_id),
                "page": 2,
                "page_size": 2,
            },
        )
        assert resp.status_code == status.HTTP_200_OK
        page2 = resp.json()
        assert len(page2) == 1

        # No overlap
        page1_ids = {f["id"] for f in page1}
        page2_ids = {f["id"] for f in page2}
        assert page1_ids.isdisjoint(page2_ids)
    finally:
        for fid in file_ids:
            await integration_client.delete(f"/v2/files/{fid}?soft=false")


@pytest.mark.integration
async def test_list_files_combined_filters(integration_client):
    """projectId + partial name returns only the matching file."""
    project_id = uuid.uuid4()
    unique_tag = uuid.uuid4().hex[:8]
    target_name = f"combo_{unique_tag}.pdf"
    other_name = f"other_{uuid.uuid4()}.pdf"
    file_ids = []

    try:
        target = await upload_file_via_presigned_url(
            integration_client,
            filename=target_name,
            file_content=_PDF_CONTENT,
            file_type="document",
            project_id=project_id,
        )
        file_ids.append(target["id"])

        other = await upload_file_via_presigned_url(
            integration_client,
            filename=other_name,
            file_content=_PDF_CONTENT,
            file_type="document",
            project_id=project_id,
        )
        file_ids.append(other["id"])

        resp = await integration_client.get(
            "/v2/files",
            params={
                "file_type": "document",
                "projectId": str(project_id),
                "name": unique_tag,
            },
        )
        assert resp.status_code == status.HTTP_200_OK
        results = resp.json()
        assert len(results) == 1
        assert results[0]["id"] == target["id"]
    finally:
        for fid in file_ids:
            await integration_client.delete(f"/v2/files/{fid}?soft=false")


@pytest.mark.integration
async def test_list_files_path_filter(integration_client):
    """?path=<bucket_path_substring> finds the uploaded file."""
    project_id = uuid.uuid4()
    filename = f"pathfilter_{uuid.uuid4()}.pdf"

    file_data = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_PDF_CONTENT,
        file_type="document",
        project_id=project_id,
    )
    file_id = file_data["id"]

    try:
        # Use a substring of the bucket path
        bucket_path = file_data["bucketPath"]
        path_fragment = bucket_path.split("/")[-1]  # filename portion

        resp = await integration_client.get(
            "/v2/files",
            params={
                "file_type": "document",
                "path": path_fragment,
            },
        )
        assert resp.status_code == status.HTTP_200_OK
        results = resp.json()
        ids = [f["id"] for f in results]
        assert file_id in ids
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")


@pytest.mark.integration
async def test_list_files_soft_deleted_excluded(integration_client):
    """Soft-deleted file does not appear in list results."""
    project_id = uuid.uuid4()
    filename = f"softexcl_{uuid.uuid4()}.pdf"

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

        # List should not include the deleted file
        resp = await integration_client.get(
            "/v2/files",
            params={
                "file_type": "document",
                "projectId": str(project_id),
            },
        )
        assert resp.status_code == status.HTTP_200_OK
        ids = [f["id"] for f in resp.json()]
        assert file_id not in ids
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")


@pytest.mark.integration
async def test_list_files_name_ilike(integration_client):
    """Name filter is case-insensitive (ilike): upload lowercase, search UPPERCASE."""
    project_id = uuid.uuid4()
    unique_tag = uuid.uuid4().hex[:8].lower()
    filename = f"ilike_{unique_tag}.pdf"

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
            "/v2/files",
            params={
                "file_type": "document",
                "projectId": str(project_id),
                "name": unique_tag.upper(),
            },
        )
        assert resp.status_code == status.HTTP_200_OK
        results = resp.json()
        assert len(results) >= 1
        ids = [f["id"] for f in results]
        assert file_id in ids
    finally:
        await integration_client.delete(f"/v2/files/{file_id}?soft=false")
