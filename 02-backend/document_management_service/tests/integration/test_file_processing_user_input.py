import asyncio
import uuid

import pytest
from fastapi import status

from src.config.settings import settings
from src.models.db.workflow_enum import ApprovalStatus, WorkflowStatusEnum
from src.models.schemas.approval_schema import FileDiffResponse
from tests.integration.helpers.upload import (
    ZipFixture,
    create_valid_zip,
    upload_file_via_presigned_url,
)

POLL_INTERVAL = 1  # seconds between status checks
POLL_TIMEOUT = 30  # max seconds to wait for workflow completion


async def poll_zip_status(
    client,
    zip_id: str,
    *,
    timeout: int = POLL_TIMEOUT,
    wait_for_status: WorkflowStatusEnum = WorkflowStatusEnum.COMPLETED,
) -> None:
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

        if last_status == wait_for_status:
            return

        if last_status in terminal:
            raise RuntimeError(f"Terminal status is {last_status}")

        await asyncio.sleep(POLL_INTERVAL)
        elapsed += POLL_INTERVAL

    raise TimeoutError(f"ZIP {zip_id} did not reach terminal status within {timeout}s (last status: {last_status})")


async def _upload_zip_and_process(client, *, fixture: ZipFixture, project_id: uuid.UUID) -> str:
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

    return zip_id


@pytest.mark.integration
async def test_process_files_user_input_failed_validation(integration_client):
    project_id = uuid.uuid4()
    fixture = create_valid_zip()

    zip_file_id = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )

    # Wait for approval set
    await poll_zip_status(
        client=integration_client,
        zip_id=zip_file_id,
        wait_for_status=WorkflowStatusEnum.REQUIRES_APPROVAL,
    )

    # Check approval status
    resp = await integration_client.get(f"/v2/files/{zip_file_id}/approval-status")
    resp.raise_for_status()
    assert resp.json() == ApprovalStatus.PENDING

    resp = await integration_client.get(f"/v2/files/{zip_file_id}/diff")
    resp.raise_for_status()
    current_diff = FileDiffResponse(**resp.json())
    assert len(current_diff.new) == len(fixture.success)

    # Add a file to trigger validation error
    new_file = current_diff.new[0].model_copy()
    new_file.filename = "additional_file.pdf"
    current_diff.new.append(new_file)

    resp = await integration_client.post(
        f"/v2/files/{zip_file_id}/diff",
        json=current_diff.model_dump(mode="json"),
    )
    assert resp.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT

    # Reject
    resp = await integration_client.post(
        f"/v2/files/{zip_file_id}/decision",
        params={"decision": "reject"},
    )
    resp.raise_for_status()

    # Wait for WF completion
    await poll_zip_status(
        client=integration_client,
        zip_id=zip_file_id,
        wait_for_status=WorkflowStatusEnum.COMPLETED,
    )

    # Check files
    resp = await integration_client.get(
        "/v2/files",
        params={"file_type": "document", "projectId": str(project_id)},
    )
    resp.raise_for_status()
    files = resp.json()
    assert len(files) == 0


@pytest.mark.integration
async def test_process_files_user_input_success(integration_client):
    project_id = uuid.uuid4()
    fixture = create_valid_zip()

    zip_file_id = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )

    # Wait for approval set
    await poll_zip_status(
        client=integration_client,
        zip_id=zip_file_id,
        wait_for_status=WorkflowStatusEnum.REQUIRES_APPROVAL,
    )

    # Check approval status
    resp = await integration_client.get(f"/v2/files/{zip_file_id}/approval-status")
    resp.raise_for_status()
    assert resp.json() == ApprovalStatus.PENDING

    resp = await integration_client.get(f"/v2/files/{zip_file_id}/diff")
    resp.raise_for_status()
    current_diff = FileDiffResponse(**resp.json())
    assert len(current_diff.new) == len(fixture.success)

    # Remove some of the files form user diff
    expected_new_file = current_diff.new[0]
    current_diff.new = [expected_new_file]

    resp = await integration_client.post(
        f"/v2/files/{zip_file_id}/diff",
        json=current_diff.model_dump(mode="json"),
    )
    resp.raise_for_status()

    # Approve
    resp = await integration_client.post(
        f"/v2/files/{zip_file_id}/decision",
        params={"decision": "approve"},
    )
    resp.raise_for_status()

    # Wait for WF completion
    await poll_zip_status(
        client=integration_client,
        zip_id=zip_file_id,
        wait_for_status=WorkflowStatusEnum.COMPLETED,
    )

    # Check files
    resp = await integration_client.get(
        "/v2/files",
        params={"file_type": "document", "projectId": str(project_id)},
    )
    resp.raise_for_status()
    files = resp.json()
    assert len(files) == 1
    assert files[0]["filename"] == expected_new_file.filename


@pytest.mark.integration
async def test_process_files_user_input_feature_flag(integration_client):
    """Tests that the workflow runs without approval if disabled."""
    current = settings.TEMPORAL.ENABLE_APPROVAL
    settings.TEMPORAL.ENABLE_APPROVAL = False

    project_id = uuid.uuid4()
    fixture = create_valid_zip()

    zip_file_id = await _upload_zip_and_process(
        integration_client,
        fixture=fixture,
        project_id=project_id,
    )

    # Wait for WF completion
    await poll_zip_status(
        client=integration_client,
        zip_id=zip_file_id,
        wait_for_status=WorkflowStatusEnum.COMPLETED,
    )

    # Check files
    resp = await integration_client.get(
        "/v2/files",
        params={"file_type": "document", "projectId": str(project_id)},
    )
    resp.raise_for_status()
    files = resp.json()
    assert len(files) == 3
    settings.TEMPORAL.ENABLE_APPROVAL = current
