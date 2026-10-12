import json
import uuid
from contextlib import ExitStack
from unittest.mock import patch

import pytest
from temporal.contracts import (
    DMSFileResponse,
    LLMMatchingParams,
)
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

from src.schemas.llm_matching_schemas import (
    DMSDocument,
    DocumentData,
    DocumentTypeDefinition,
)
from src.workflows.llm_matching import LLMMatchingWorkflow
from src.workflows.llm_matching_single_document import LLMMatchingSingleDocumentWorkflow

from .mock_activities import (
    PATCHES,
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
                workflows=[LLMMatchingWorkflow, LLMMatchingSingleDocumentWorkflow],
                activities=[
                    upload_temporal_checkpoint,
                    get_inhalts_extraktion_docs,
                    get_inhalts_extraktion_doc_chunks,
                ],
                task_queue=task_queue,
                workflow_runner=UnsandboxedWorkflowRunner(),
            ):
                params = LLMMatchingParams(
                    project_id="p1",
                    document_ids=["doc_1", "doc_2"],
                    document_types=doc_types_json,
                )
                result = await env.client.execute_workflow(
                    LLMMatchingWorkflow.run,
                    params,
                    id=f"wf-{uuid.uuid4()}",
                    task_queue=task_queue,
                )
                assert isinstance(result, DMSFileResponse)


@pytest.mark.asyncio
async def test_build_output_sorting_logic():
    """
    Tests the core sorting logic of the _build_output method, ensuring it
    correctly categorizes documents as matched, unassigned, or skipped.
    """
    candidates = [DocumentTypeDefinition(document_type_name="Invoice", document_type_description="")]
    results = [
        DocumentData(
            dms_doc=DMSDocument(
                project_id="proj-1",
                document_id="doc-001",
                document_name="invoices/inv_101.pdf",
                content_extraction_id="ext-001",
            ),
            assigned_document_type=candidates[0],
            reasoning="",
            confidence=0,
            should_classify=True,
        ),
        DocumentData(
            dms_doc=DMSDocument(
                project_id="proj-1",
                document_id="doc-002",
                document_name="contracts/vendor_x.docx",
                content_extraction_id="ext-002",
            ),
            assigned_document_type=None,
            reasoning="",
            confidence=0,
            should_classify=True,
        ),
        DocumentData(
            dms_doc=DMSDocument(
                project_id="proj-1",
                document_id="doc-003",
                document_name="contracts/vendor_y.pdf",
                content_extraction_id="ext-003",
            ),
            should_classify=False,
            reasoning="",
            confidence=0,
        ),
    ]

    output = await LLMMatchingWorkflow()._build_output(results, candidates)

    assert len(output.matched_document_types[0].assigned_documents) == 1
    assert output.matched_document_types[0].assigned_documents[0].document_id == "doc-001"

    assert len(output.unassigned_documents) == 1
    assert output.unassigned_documents[0].document_id == "doc-002"


def test_parses_canonical_document_types():
    params = LLMMatchingParams(
        project_id="p1",
        document_types=[
            {
                "category": "Trassierungs-technischer Teil",
                "document_type_name": "Kreuzungsverzeichnis",
                "document_type_description": "Kreuzungs- und Bauwerks-/Leitungsverzeichnisse listen die von der neu zu errichtenden Trasse zu querenden Bauwerke und Fremdleitungen sowie Parallelverlegungen zu Bauwerken und Fremdleitungen in tabellarischer Form auf.",
                "expected_count": 1,
            }
        ],
        document_ids=[],
    )

    res = params.document_types
    assert isinstance(res, list)
    assert len(res) == 1
    assert isinstance(res[0], DocumentTypeDefinition)
    assert res[0].document_type_name == "Kreuzungsverzeichnis"
    assert res[0].category == "Trassierungs-technischer Teil"
    assert "expected_count" not in res[0].model_dump()
