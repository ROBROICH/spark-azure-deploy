import uuid

import httpx
import pytest
from fastapi import status

_PDF_CONTENT = b"%PDF-1.4 mock content"
_JSON_CONTENT = b'{"law": "test data"}'


async def _upload_flow(
    api_client,
    *,
    generate_payload,
    file_content,
    confirm_payload,
    endpoint_prefix="/v2/files",
):
    """Full generate → PUT → confirm flow with inline HTTP calls."""
    # 1. Generate upload URL
    resp = await api_client.post(
        f"{endpoint_prefix}/generate-upload-url",
        json=generate_payload,
    )
    assert resp.status_code == status.HTTP_200_OK, f"generate-upload-url failed: {resp.status_code} {resp.text}"
    data = resp.json()
    upload_url = data["uploadUrl"]
    mime_type = data["mimeType"]

    # 2. PUT file content to presigned URL
    async with httpx.AsyncClient() as client:
        put_resp = await client.put(
            upload_url,
            content=file_content,
            headers={"Content-Type": mime_type},
        )
    assert put_resp.status_code in (200, 201, 204)

    # 3. Confirm upload
    resp = await api_client.post(
        f"{endpoint_prefix}/confirm-upload",
        json=confirm_payload,
    )
    assert resp.status_code == status.HTTP_200_OK, f"confirm-upload failed: {resp.status_code} {resp.text}"
    return resp.json()


@pytest.mark.integration
async def test_template_upload_with_project(integration_client):
    """Upload a template file with a projectId."""
    project_id = str(uuid.uuid4())
    filename = f"template_{uuid.uuid4()}.pdf"
    payload = {
        "type": "template",
        "projectId": project_id,
        "filename": filename,
    }

    file_data = await _upload_flow(
        integration_client,
        generate_payload=payload,
        file_content=_PDF_CONTENT,
        confirm_payload=payload,
    )

    try:
        assert file_data["type"] == "template"
        assert file_data["projectId"] == project_id
    finally:
        await integration_client.delete(f"/v2/files/{file_data['id']}?soft=false")


@pytest.mark.integration
async def test_template_upload_with_generated_project(integration_client):
    """Upload a template file with a projectId (always required)."""
    project_id = str(uuid.uuid4())
    filename = f"template_{uuid.uuid4()}.pdf"
    payload = {
        "type": "template",
        "projectId": project_id,
        "filename": filename,
    }

    file_data = await _upload_flow(
        integration_client,
        generate_payload=payload,
        file_content=_PDF_CONTENT,
        confirm_payload=payload,
    )

    try:
        assert file_data["type"] == "template"
        assert file_data["projectId"] == project_id
    finally:
        await integration_client.delete(f"/v2/files/{file_data['id']}?soft=false")


@pytest.mark.integration
@pytest.mark.parametrize(
    "payload",
    [
        {"type": "law_data", "filename": "law.json"},
        {
            "type": "content_extraction",
            "projectId": "00000000-0000-0000-0000-000000000001",
            "filename": "extracted.json",
        },
        {
            "type": "temporal_checkpoint",
            "workflowId": "wf-123",
            "runId": "run-456",
            "filename": "checkpoint.json",
        },
    ],
    ids=["law_data", "content_extraction", "temporal_checkpoint"],
)
async def test_internal_types_rejected_via_public_api(integration_client, payload):
    """Internal file types must be rejected (422) on public upload endpoints."""
    resp = await integration_client.post("/v2/files/generate-upload-url", json=payload)
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    resp = await integration_client.post("/v2/files/confirm-upload", json=payload)
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


@pytest.mark.integration
@pytest.mark.parametrize(
    ("payload", "expected_assertions"),
    [
        (
            {
                "type": "law_data",
                "projectId": str(uuid.uuid4()),
                "filename": f"law_{uuid.uuid4()}.json",
            },
            lambda file_data, payload: (
                file_data["type"] == "law_data" and file_data["projectId"] == payload["projectId"]
            ),
        ),
        (
            {
                "type": "content_extraction",
                "projectId": str(uuid.uuid4()),
                "filename": f"extraction_{uuid.uuid4()}.json",
            },
            lambda file_data, payload: (
                file_data["type"] == "content_extraction" and file_data["projectId"] == payload["projectId"]
            ),
        ),
        (
            {
                "type": "temporal_checkpoint",
                "workflowId": f"wf-{uuid.uuid4()}",
                "runId": f"run-{uuid.uuid4()}",
                "projectId": str(uuid.uuid4()),
                "filename": f"checkpoint_{uuid.uuid4()}.json",
            },
            lambda file_data, payload: (
                file_data["type"] == "temporal_checkpoint"
                and file_data["workflowId"] == payload["workflowId"]
                and file_data["runId"] == payload["runId"]
            ),
        ),
    ],
    ids=["law_data", "content_extraction", "temporal_checkpoint"],
)
async def test_internal_types_upload_via_internal_api(
    integration_client,
    payload,
    expected_assertions,
):
    """Internal file types upload successfully via internal endpoints."""
    file_data = await _upload_flow(
        integration_client,
        generate_payload=payload,
        file_content=_JSON_CONTENT,
        confirm_payload=payload,
        endpoint_prefix="/v2/internal/files",
    )

    try:
        assert expected_assertions(file_data, payload)
    finally:
        await integration_client.delete(f"/v2/files/{file_data['id']}?soft=false")
