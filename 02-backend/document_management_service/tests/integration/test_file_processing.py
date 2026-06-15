"""End-to-end integration tests for the zip processing workflow.

Upload a ZIP → start-file-processing → poll until complete → verify results.
"""

import asyncio
import uuid

import pytest
from fastapi import status

from src.models.db.workflow_enum import WorkflowStatusEnum
from tests.integration.helpers.upload import (
    VALID_PDF_BYTES,
    ZipFixture,
    create_corrupt_zip,
    create_invalid_contents_zip,
    create_mixed_zip,
    create_spoofed_extensions_zip,
    create_stored_data_descriptor_zip,
    create_truncated_zip,
    create_valid_zip,
    create_valid_zip_2,
    create_zip_bytes,
    upload_file_via_presigned_url,
)

POLL_INTERVAL = 1  # seconds between status checks
POLL_TIMEOUT = 30  # max seconds to wait for workflow completion


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


async def poll_zip_status(client, zip_id: str, *, timeout: int = POLL_TIMEOUT, auto_approve: bool = True) -> dict:
    """Poll ``GET /v2/zip-files/{id}`` until a terminal status or timeout."""
    terminal = {
        WorkflowStatusEnum.COMPLETED,
        WorkflowStatusEnum.FAILED,
        WorkflowStatusEnum.CANCELED,
        WorkflowStatusEnum.TERMINATED,
        WorkflowStatusEnum.TIMED_OUT,
    }
    elapsed = 0.0
    last_status = "UNKNOWN"

    while elapsed < timeout:
        resp = await client.get(f"/v2/zip-files/{zip_id}")
        assert resp.status_code == status.HTTP_200_OK
        data = resp.json()
        last_status = data["workflowStatus"]

        # Automatically approve if required
        if auto_approve and last_status == WorkflowStatusEnum.REQUIRES_APPROVAL:
            resp = await client.post(
                f"/v2/files/{zip_id}/decision",
                params={"decision": "approve"},
            )
            resp.raise_for_status()

        if last_status in terminal:
            return data

        await asyncio.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL

    raise TimeoutError(f"ZIP {zip_id} did not reach terminal status within {timeout}s (last status: {last_status})")


async def _upload_zip_and_process(client, *, fixture: ZipFixture, project_id: uuid.UUID) -> dict:
    """Upload a zip, start processing, poll to completion."""
    filename = f"test_{uuid.uuid4()}.zip"

    confirm_data = await upload_file_via_presigned_url(
        client,
        filename=filename,
        file_content=fixture.content,
        file_type="zip",
        project_id=project_id,
    )
    zip_id = confirm_data["id"]

    resp = await client.post(
        "/v2/files/start-file-processing",
        json={
            "fileId": zip_id,
            "projectId": str(project_id),
        },
    )
    assert resp.status_code == status.HTTP_200_OK, f"start-file-processing failed: {resp.status_code} {resp.text}"
    start_data = resp.json()
    assert "workflowId" in start_data
    assert "runId" in start_data

    return await poll_zip_status(client, zip_id)


async def _assert_extracted_files(client, project_id, fixture: ZipFixture):
    """Assert that only fixture.success files were extracted."""
    resp = await client.get(
        "/v2/files",
        params={"file_type": "document", "projectId": str(project_id)},
    )
    assert resp.status_code == status.HTTP_200_OK
    files = resp.json()
    extracted = {f["filename"] for f in files}
    expected_success = set(fixture.success)
    expected_failure = set(fixture.failure)

    assert extracted == expected_success, f"Expected {expected_success}, got {extracted}"
    assert extracted.isdisjoint(expected_failure), f"Rejected entries leaked through: {extracted & expected_failure}"


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.integration
async def test_file_processing_valid_zip(integration_client):
    """Happy path: valid ZIP with PDF entries is processed successfully."""
    project_id = uuid.uuid4()
    fixture = create_valid_zip()

    poll_data = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )
    assert poll_data["workflowStatus"] == WorkflowStatusEnum.COMPLETED
    await _assert_extracted_files(integration_client, project_id, fixture)


@pytest.mark.integration
async def test_file_processing_valid_zip_consecutive_upload(integration_client):
    """"""
    project_id = uuid.uuid4()
    valid_zip = create_valid_zip()
    valid_zip_consecutive = create_valid_zip_2()

    poll_data = await _upload_zip_and_process(
        integration_client,
        fixture=valid_zip,
        project_id=project_id,
    )
    assert poll_data["workflowStatus"] == WorkflowStatusEnum.COMPLETED
    await _assert_extracted_files(integration_client, project_id, valid_zip)

    poll_data = await _upload_zip_and_process(
        integration_client,
        fixture=valid_zip_consecutive,
        project_id=project_id,
    )
    assert poll_data["workflowStatus"] == WorkflowStatusEnum.COMPLETED
    await _assert_extracted_files(integration_client, project_id, valid_zip_consecutive)


@pytest.mark.integration
async def test_file_processing_corrupt_zip(integration_client):
    """Corrupt (non-ZIP) bytes → workflow fails at validation."""
    project_id = uuid.uuid4()
    fixture = create_corrupt_zip()
    poll_data = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )
    assert poll_data["workflowStatus"] == WorkflowStatusEnum.FAILED


@pytest.mark.integration
async def test_file_processing_invalid_contents_zip(integration_client):
    """ZIP with .exe/.mp4/.avi entries → all 3 rejected at extension check."""
    project_id = uuid.uuid4()
    fixture = create_invalid_contents_zip()
    poll_data = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )
    assert poll_data["workflowStatus"] == WorkflowStatusEnum.COMPLETED
    await _assert_extracted_files(integration_client, project_id, fixture)


@pytest.mark.integration
async def test_file_processing_spoofed_extensions_zip(integration_client):
    """ZIP with allowed extensions but forbidden content (EXE bytes, shebangs).

    All entries rejected at content validation.
    """
    project_id = uuid.uuid4()
    fixture = create_spoofed_extensions_zip()
    poll_data = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )
    assert poll_data["workflowStatus"] == WorkflowStatusEnum.COMPLETED
    await _assert_extracted_files(integration_client, project_id, fixture)


@pytest.mark.integration
async def test_file_processing_mixed_zip(integration_client):
    """ZIP with valid and invalid entries → only PDFs are extracted."""
    project_id = uuid.uuid4()
    fixture = create_mixed_zip()
    poll_data = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )
    assert poll_data["workflowStatus"] == WorkflowStatusEnum.COMPLETED
    await _assert_extracted_files(integration_client, project_id, fixture)


@pytest.mark.integration
async def test_file_processing_truncated_zip(integration_client):
    """ZIP truncated mid-entry — Central Directory is missing, validation fails."""
    project_id = uuid.uuid4()
    fixture = create_truncated_zip()
    poll_data = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )
    assert poll_data["workflowStatus"] == WorkflowStatusEnum.FAILED


@pytest.mark.integration
async def test_file_processing_path_normalization_filters_unsafe_entries(
    integration_client,
):
    """Only normalized safe entry names are ingested from ZIP members."""
    project_id = uuid.uuid4()

    raw_entries = {
        "docs/good.pdf": VALID_PDF_BYTES,
        "folder\\sub\\windows.pdf": VALID_PDF_BYTES,
        "folder/./normalized.pdf": VALID_PDF_BYTES,
        "../escape.pdf": VALID_PDF_BYTES,
        "nested/../blocked.pdf": VALID_PDF_BYTES,
        "__MACOSX/metadata.pdf": VALID_PDF_BYTES,
        "._hidden.pdf": VALID_PDF_BYTES,
    }
    fixture = ZipFixture(
        content=create_zip_bytes(raw_entries),
        success=[
            "docs/good.pdf",
            "folder/sub/windows.pdf",
            "folder/normalized.pdf",
        ],
        failure=[
            "../escape.pdf",
            "nested/../blocked.pdf",
            "__MACOSX/metadata.pdf",
            "._hidden.pdf",
        ],
    )

    poll_data = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )
    assert poll_data["workflowStatus"] == WorkflowStatusEnum.COMPLETED
    await _assert_extracted_files(integration_client, project_id, fixture)


@pytest.mark.integration
async def test_file_processing_stored_with_data_descriptor(integration_client):
    """ZIP with STORED compression + Data Descriptor flag.

    This combination caused stream-unzip to fail because sequential streaming
    cannot determine entry boundaries when entries use STORED (no compression)
    with the Data Descriptor flag (bit 3) set — the uncompressed size is only
    available *after* the entry data. The stdlib zipfile module handles this
    correctly by reading the Central Directory at the end of the archive.
    """
    project_id = uuid.uuid4()
    fixture = create_stored_data_descriptor_zip()
    poll_data = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )
    assert poll_data["workflowStatus"] == WorkflowStatusEnum.COMPLETED
    await _assert_extracted_files(integration_client, project_id, fixture)
