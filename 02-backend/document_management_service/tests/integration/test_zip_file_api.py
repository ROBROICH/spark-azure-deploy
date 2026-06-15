import uuid

import pytest
from fastapi import status

from src.models.db.file_enum import FileTypeEnum
from tests.integration.helpers.upload import (
    create_zip_bytes,
    delete_zip_file,
    upload_file_via_presigned_url,
)

_ZIP_CONTENT = create_zip_bytes({"doc1.pdf": b"%PDF-1.4 zip api test content"})


@pytest.fixture
async def uploaded_zip(integration_client):
    """Upload a ZIP via presigned URL, yield response, hard-delete on teardown."""
    project_id = uuid.uuid4()
    filename = f"zipapi_{uuid.uuid4()}.zip"

    result = await upload_file_via_presigned_url(
        integration_client,
        filename=filename,
        file_content=_ZIP_CONTENT,
        file_type="zip",
        project_id=project_id,
    )

    yield result

    await delete_zip_file(result["id"])


@pytest.mark.integration
async def test_get_zip_file(integration_client, uploaded_zip):
    """GET /v2/zip-files/{id} returns the zip file."""
    zip_id = uploaded_zip["id"]

    resp = await integration_client.get(f"/v2/zip-files/{zip_id}")
    assert resp.status_code == status.HTTP_200_OK

    data = resp.json()
    assert data["id"] == zip_id
    assert data["filename"] == uploaded_zip["filename"]
    assert data["projectId"] == uploaded_zip["projectId"]
    assert data["workflowStatus"] == "PENDING"
    assert "createdAt" in data
    assert "updatedAt" in data


@pytest.mark.integration
async def test_get_zip_file_not_found(integration_client):
    """GET /v2/zip-files/{id} returns 404 for non-existent ID."""
    fake_id = uuid.uuid4()

    resp = await integration_client.get(f"/v2/zip-files/{fake_id}")
    assert resp.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.integration
async def test_list_zip_files(integration_client, uploaded_zip):
    """GET /v2/zip-files returns list containing the uploaded zip."""
    resp = await integration_client.get("/v2/zip-files")
    assert resp.status_code == status.HTTP_200_OK

    results = resp.json()
    assert isinstance(results, list)
    ids = [zf["id"] for zf in results]
    assert uploaded_zip["id"] in ids


@pytest.mark.integration
async def test_list_zip_files_filter_by_project(integration_client, uploaded_zip):
    """GET /v2/zip-files?projectId=... filters by project."""
    project_id = uploaded_zip["projectId"]

    resp = await integration_client.get("/v2/zip-files", params={"projectId": project_id})
    assert resp.status_code == status.HTTP_200_OK

    results = resp.json()
    assert len(results) >= 1
    assert all(zf["projectId"] == project_id for zf in results)

    match = next(zf for zf in results if zf["id"] == uploaded_zip["id"])
    assert match["filename"] == uploaded_zip["filename"]


@pytest.mark.integration
async def test_list_zip_files_filter_by_workflow_status(integration_client, uploaded_zip):
    """GET /v2/zip-files?workflowStatus=PENDING returns matching zips."""
    resp = await integration_client.get("/v2/zip-files", params={"workflowStatus": "PENDING"})
    assert resp.status_code == status.HTTP_200_OK

    results = resp.json()
    assert all(zf["workflowStatus"] == "PENDING" for zf in results)
    ids = [zf["id"] for zf in results]
    assert uploaded_zip["id"] in ids


@pytest.mark.integration
async def test_list_zip_files_filter_excludes_other_projects(integration_client, uploaded_zip):
    """GET /v2/zip-files?projectId=<random> returns empty when no match."""
    other_project = uuid.uuid4()

    resp = await integration_client.get("/v2/zip-files", params={"projectId": str(other_project)})
    assert resp.status_code == status.HTTP_200_OK

    results = resp.json()
    ids = [zf["id"] for zf in results]
    assert uploaded_zip["id"] not in ids


@pytest.mark.integration
async def test_list_zip_files_pagination(integration_client):
    """GET /v2/zip-files respects page and page_size params."""
    project_id = uuid.uuid4()
    created_ids = []

    # Upload 3 zips to the same project
    for _ in range(3):
        result = await upload_file_via_presigned_url(
            integration_client,
            filename=f"paginate_{uuid.uuid4()}.zip",
            file_content=_ZIP_CONTENT,
            file_type=FileTypeEnum.ZIP,
            project_id=project_id,
        )
        created_ids.append(result["id"])

    try:
        # Page 1, size 2
        resp = await integration_client.get(
            "/v2/zip-files",
            params={"projectId": str(project_id), "page": 1, "page_size": 2},
        )
        assert resp.status_code == status.HTTP_200_OK
        page1 = resp.json()
        assert len(page1) == 2

        # Page 2, size 2
        resp = await integration_client.get(
            "/v2/zip-files",
            params={"projectId": str(project_id), "page": 2, "page_size": 2},
        )
        assert resp.status_code == status.HTTP_200_OK
        page2 = resp.json()
        assert len(page2) == 1

        # No overlap
        page1_ids = {zf["id"] for zf in page1}
        page2_ids = {zf["id"] for zf in page2}
        assert page1_ids.isdisjoint(page2_ids)
    finally:
        for file_id in created_ids:
            await delete_zip_file(file_id)
