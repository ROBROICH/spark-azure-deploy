"""Integration tests for file upload validation at the API boundary.

Tests that ``POST /v2/files/generate-upload-url`` rejects disallowed
extensions, and that content-level validation (puremagic) catches spoofed
payloads.  The presigned-URL / confirm-upload flow intentionally does **not**
inspect file content — that only happens during zip processing.
"""

import uuid

import httpx
import pytest
from fastapi import status

from tests.integration.helpers.upload import EXE_BYTES

# ---------------------------------------------------------------------------
# Extension validation via generate-upload-url
# ---------------------------------------------------------------------------


@pytest.mark.integration
@pytest.mark.parametrize(
    "filename,expected_status",
    [
        ("video.mp4", status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
        ("movie.avi", status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
        ("script.sh", status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
        ("batch.bat", status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
        ("code.py", status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
        ("library.dll", status.HTTP_415_UNSUPPORTED_MEDIA_TYPE),
        (
            "report.pdf.exe",
            status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
        ),  # double extension — last ext wins
        ("valid.pdf", status.HTTP_200_OK),  # control: allowed extension succeeds
    ],
)
async def test_generate_upload_url_extension_validation(integration_client, filename, expected_status):
    """generate-upload-url rejects disallowed file extensions with 415."""
    resp = await integration_client.post(
        "/v2/files/generate-upload-url",
        json={
            "type": "document",
            "projectId": str(uuid.uuid4()),
            "filename": filename,
        },
    )
    assert resp.status_code == expected_status


@pytest.mark.integration
@pytest.mark.parametrize(
    "filename",
    [
        "file.exe.pdf",  # last extension is .pdf → allowed
        "file.bat.json",  # last extension is .json → allowed
    ],
)
async def test_double_extension_allowed_when_last_ext_valid(integration_client, filename):
    """Double-extension files pass when the *last* extension is allowed."""
    resp = await integration_client.post(
        "/v2/files/generate-upload-url",
        json={
            "type": "document",
            "projectId": str(uuid.uuid4()),
            "filename": filename,
        },
    )
    assert resp.status_code == status.HTTP_200_OK


# ---------------------------------------------------------------------------
# Spoofed content accepted at upload level (design boundary)
# ---------------------------------------------------------------------------


@pytest.mark.integration
async def test_spoofed_content_accepted_at_upload(integration_client):
    """A .pdf file with EXE content is accepted by confirm-upload.

    This is by design — content validation only happens during zip processing
    via puremagic.  The presigned URL flow only checks extensions.
    """
    project_id = uuid.uuid4()
    filename = f"spoofed_{uuid.uuid4()}.pdf"

    # 1. Generate presigned upload URL (extension is .pdf → allowed)
    resp = await integration_client.post(
        "/v2/files/generate-upload-url",
        json={
            "type": "document",
            "projectId": str(project_id),
            "filename": filename,
        },
    )
    assert resp.status_code == status.HTTP_200_OK
    data = resp.json()
    upload_url = data["uploadUrl"]
    mime_type = data["mimeType"]

    # 2. PUT EXE bytes to the presigned URL
    async with httpx.AsyncClient() as upload_client:
        put_resp = await upload_client.put(
            upload_url,
            content=EXE_BYTES,
            headers={"Content-Type": mime_type},
        )
    assert put_resp.status_code in (200, 201, 204)

    # 3. Confirm upload — should succeed (no content validation here)
    resp = await integration_client.post(
        "/v2/files/confirm-upload",
        json={
            "type": "document",
            "projectId": str(project_id),
            "filename": filename,
        },
    )
    assert resp.status_code == status.HTTP_200_OK

    # Cleanup: hard-delete the file
    file_id = resp.json()["id"]
    delete_resp = await integration_client.delete(f"/v2/files/{file_id}?soft=false")
    assert delete_resp.status_code in (200, 204)
