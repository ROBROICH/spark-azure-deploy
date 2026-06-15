import json
import uuid
from contextlib import ExitStack
from unittest.mock import MagicMock, patch

import pytest
from temporal.workflows.formale_pruefung import (
    DMSFileResponse,
    InhaltsverzeichnisFinderParams,
    InhaltsverzeichnisMatchingParams,
)
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

from src.schemas.dms_schemas import (
    ChunkMetadata,
    DMSDocument,
    DocumentChunk,
)
from src.schemas.inhaltsverzeichnis_finder_schemas import (
    CandidateDoc,
    MergedDocumentChunk,
    ProcessedInhaltsExtraction,
)
from src.workflows.inhaltsverzeichnis_finder import (
    InhaltsverzeichnisFinderWorkflow,
)
from src.workflows.inhaltsverzeichnis_matching import (
    InhaltsverzeichnisMatchingWorkflow,
)
from src.workflows.llm_matching import LLMMatchingWorkflow
from src.workflows.llm_matching_single_document import LLMMatchingSingleDocumentWorkflow

from .mock_activities import (
    PATCHES,
    download_json_from_dms,
    get_inhalts_extraktion_doc_chunks,
    get_inhalts_extraktion_docs,
    upload_temporal_checkpoint,
)

DOCUMENT_TYPES_PATH = "data/document_types_sample.json"


@pytest.mark.asyncio
@pytest.mark.timeout(20)
async def test_workflow():
    """
    General Execution of the Workflow with mock data.

    We cant test the response as we upload it to the DMS which is now mocked and we only
    get the mocked DMSFileResponse back.

    Therefore this is only to test the general flow and ensure that the expected inputs
    do not create a crash.
    """
    with open(DOCUMENT_TYPES_PATH, encoding="utf-8") as f:
        doc_types_json = json.load(f)
    with ExitStack() as stack:
        for path, replacement in PATCHES:
            stack.enter_context(patch(path, replacement))
        async with await WorkflowEnvironment.start_time_skipping(data_converter=pydantic_data_converter) as env:
            task_queue = f"queue-{uuid.uuid4()}"
            async with Worker(
                env.client,
                task_queue=task_queue,
                workflows=[
                    InhaltsverzeichnisMatchingWorkflow,
                    InhaltsverzeichnisFinderWorkflow,
                    LLMMatchingWorkflow,
                    LLMMatchingSingleDocumentWorkflow,
                ],
                activities=[
                    get_inhalts_extraktion_doc_chunks,
                    get_inhalts_extraktion_docs,
                    upload_temporal_checkpoint,
                    download_json_from_dms,
                ],
                workflow_runner=UnsandboxedWorkflowRunner(),
            ):
                result = await env.client.execute_workflow(
                    InhaltsverzeichnisMatchingWorkflow.run,
                    InhaltsverzeichnisMatchingParams(
                        project_id="p1",
                        document_types=doc_types_json,
                    ),
                    id=str(uuid.uuid4()),
                    task_queue=task_queue,
                )
                assert isinstance(result, DMSFileResponse)


@pytest.mark.asyncio
@patch("src.workflows.inhaltsverzeichnis_finder.workflow.logger", MagicMock())
@patch("src.workflows.inhaltsverzeichnis_finder.workflow.info", MagicMock())
@patch("src.workflows.inhaltsverzeichnis_finder.llm_connected_chunk_classification")
async def test_expand_toc_sequence_loop_logic(mock_connected):
    """Test the loop logic and termination for TOC sequence expansion."""
    with open(DOCUMENT_TYPES_PATH, encoding="utf-8") as f:
        doc_types_json = json.load(f)

    wf = InhaltsverzeichnisFinderWorkflow()
    mock_dms_doc = DMSDocument(project_id="p1", document_id="d1", document_name="n1", content_extraction_id="e1")
    mock_original_chunk = DocumentChunk(chunk_id="c1", page_content="", metadata=ChunkMetadata(page_numbers=[]))
    candidate = CandidateDoc(
        start_index=0,
        data=ProcessedInhaltsExtraction(
            dms_document=mock_dms_doc,
            chunks=[
                MergedDocumentChunk(
                    merged_page_content=c,
                    original_chunks=[mock_original_chunk],
                    metadata=ChunkMetadata(page_numbers=[]),
                )
                for c in ("a", "b", "c")
            ],
        ),
    )
    mock_connected.side_effect = [True, False]

    params = InhaltsverzeichnisFinderParams(project_id="p1", document_types=doc_types_json)
    result = await wf._expand_toc_sequence(candidate, params)

    assert mock_connected.call_count == 2
    assert len(result) == 2
