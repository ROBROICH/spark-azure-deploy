import uuid
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from temporalio.common import WorkflowIDReusePolicy

from src.activities.dms_activities import DmsFileInfo
from src.workflows.process_documents_ewms_workflow import (
    ProcessDocumentsEWMSWorkflow,
    ProcessDocumentsEWMSWorkflowInput,
    ProcessDocumentsEWMSWorkflowOutput,
)
from src.workflows.single_document_workflow_ewms import (
    PromptInjection,
    SingleDocumentEWMSWorkflow,
    SingleDocumentEWMSWorkflowInput,
    SingleDocumentEWMSWorkflowOutput,
)


@pytest.fixture
def mock_temporal_workflow():
    """Patches the Temporal workflow module to safely run outside a Temporal worker."""
    with patch("src.workflows.process_documents_ewms_workflow.workflow") as mock_wf:
        mock_info = MagicMock()
        mock_info.workflow_id = "test-wf-123456789"
        mock_wf.info.return_value = mock_info

        mock_wf.now.side_effect = [
            datetime(2026, 1, 1, 12, 0, 0, tzinfo=UTC),
            datetime(2026, 1, 1, 12, 0, 10, tzinfo=UTC),
        ]

        mock_wf.logger = MagicMock()

        yield mock_wf


@pytest.fixture
def mock_env():
    """Mocks environment variables."""
    with patch("src.workflows.process_documents_ewms_workflow.ENV") as mock_env:
        mock_env.SINGLE_DOCUMENT_EWMS_WORKFLOW_CONCURRENCY = 2
        yield mock_env


@pytest.mark.asyncio
@patch("src.workflows.process_documents_ewms_workflow.snapshot_config")
@patch("src.workflows.process_documents_ewms_workflow.sliding_window", new_callable=AsyncMock)
@patch("src.workflows.process_documents_ewms_workflow.dms_get_file_metadata", new_callable=AsyncMock)
async def test_process_documents_ewms_workflow(
    mock_get_metadata,
    mock_sliding_window,
    mock_snapshot_config,
    mock_env,
    mock_temporal_workflow,
):
    """Tests the orchestrator's batch logic, retry loop, and child workflow execution."""

    project_id = uuid.uuid4()
    file_id_1 = uuid.uuid4()
    file_id_2 = uuid.uuid4()

    input_data = ProcessDocumentsEWMSWorkflowInput(project_id=project_id, file_ids=[file_id_1, file_id_2])

    file_info_1 = DmsFileInfo(
        file_id=str(file_id_1),
        filename="E1234_document.pdf",
        mime_type="application/pdf",
        bucket_path="dummy/path/1.pdf",
    )

    file_info_2 = DmsFileInfo(
        file_id=str(file_id_2),
        filename="S5678_document.pdf",
        mime_type="application/pdf",
        bucket_path="dummy/path/2.pdf",
    )

    mock_get_metadata.side_effect = [file_info_1, file_info_2]

    # Use SingleDocumentEWMSWorkflowOutput directly
    mock_out_1 = SingleDocumentEWMSWorkflowOutput(
        prompt_injection=PromptInjection(injection_detected=False),
        markdown="test markdown 1",
        chunks=[],
        original_file_id=str(file_id_1),
    )
    mock_out_2 = SingleDocumentEWMSWorkflowOutput(
        prompt_injection=PromptInjection(injection_detected=False),
        markdown="test markdown 2",
        chunks=[],
        original_file_id=str(file_id_2),
    )

    # Sliding window receives and fails with DmsFileInfo objects directly
    mock_sliding_window.side_effect = [
        ([mock_out_1], [file_info_2]),  # Pass 1: file 2 fails
        ([mock_out_2], []),  # Pass 2: Retry succeeds
    ]

    workflow_instance = ProcessDocumentsEWMSWorkflow()
    result = await workflow_instance.run(input_data)

    # Verify snapshot_config was called
    mock_snapshot_config.assert_called_once()

    assert isinstance(result, ProcessDocumentsEWMSWorkflowOutput)

    assert len(result.processed_files_output) == 2
    assert mock_out_1 in result.processed_files_output
    assert mock_out_2 in result.processed_files_output

    assert mock_get_metadata.call_count == 2
    assert mock_sliding_window.call_count == 2

    # --- Test Internal Execution Callback ---
    callback = mock_sliding_window.call_args_list[0][0][1]

    expected_child_output = SingleDocumentEWMSWorkflowOutput(
        prompt_injection=PromptInjection(injection_detected=False),
        markdown="test child output",
        chunks=[],
        original_file_id=str(file_id_1),
    )
    mock_temporal_workflow.execute_child_workflow = AsyncMock(return_value=expected_child_output)

    # The internal callback takes a file_info object
    child_result = await callback(file_info_1)

    assert child_result == expected_child_output

    mock_temporal_workflow.execute_child_workflow.assert_called_once()
    args, kwargs = mock_temporal_workflow.execute_child_workflow.call_args

    assert args[0] == SingleDocumentEWMSWorkflow.run

    assert isinstance(args[1], SingleDocumentEWMSWorkflowInput)
    assert args[1].project_id == project_id
    assert args[1].file_info == file_info_1

    expected_wf_id = f"single-doc-ewms-{file_info_1.file_id[:8]}-test-wf-"
    assert kwargs["id"] == expected_wf_id
    assert kwargs["id_reuse_policy"] == WorkflowIDReusePolicy.TERMINATE_IF_RUNNING
    assert kwargs["task_timeout"] == timedelta(seconds=60)
