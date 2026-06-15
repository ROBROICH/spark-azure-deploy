import json
import uuid
from typing import Any
from unittest.mock import AsyncMock, patch
from uuid import UUID

import pytest
from temporal.payload_codec import LargePayloadCodec
from temporal.s3_payload_storage import S3PayloadStorage
from temporalio.contrib.pydantic import PydanticPayloadConverter
from temporalio.converter import DataConverter
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker

from src.config.settings import settings
from src.models.schemas.temporal.fvp import FVPWorkflowArgs
from src.services.activities.fvp import (
    get_project_files,
    get_template_document_types,
    get_topics,
    update_file_topics,
)
from src.services.activities.results import (
    _send_fvp_results,
    _send_plausibility_results,
    _send_toc_matching_results,
)
from src.services.workflows.fvp import FVPWorkflow
from src.services.workflows.fvp_workflow import FVPClassificationResult
from tests.integration.conftest import seed_file

pytestmark = pytest.mark.integration


@pytest.mark.asyncio
async def test_fvp_happy_path(
    seed_project: UUID,
    seed_topic: UUID,
    seed_template_categories: UUID,
    pdf_content: bytes,
) -> None:
    workflow_id = f"test-{uuid.uuid4()}"
    project_id = str(seed_project)
    file_obj = await seed_file(
        pdf_content,
        filename="test-download.pdf",
        project_id=project_id,
    )
    file_id = str(file_obj.id)

    fvp_data: dict[str, Any] = {
        "matched_document_types": [
            {
                "required_document_type": {
                    "category": "Teil A - Vorhabensbeschreibung",
                    "document_type_name": "Erläuterungsbericht",
                    "document_type_description": "...",
                },
                "assigned_documents": [
                    {
                        "document_name": "DocA_Erlaeuterungsbericht.pdf",
                        "document_id": "0ef4585b-62d0-4590-857b-7ca96878b968",
                        "document_extraction_id": "f183d95d-63b1-4727-8aa2-14b902b88c1a",
                        "reasoning": "...",
                        "confidence": 0.98,
                    }
                ],
                "confidence": 0.98,
            },
        ],
        "unassigned_documents": [],
    }
    toc_data: dict[str, Any] = {
        "inhaltsverzeichnis_extraction_output": {
            "status": "no_inhaltsverzeichnis_found",
            "metadata": None,
            "document_types": None,
            "inhaltsverzeichnis_entries": None,
        },
        "inhaltsverzeichnis_matching_output": {
            "matched_document_types": [],
            "unassigned_documents": [],
        },
    }
    plausibility_data: dict[str, Any] = {"contradictions": []}
    fvp_file_obj = await seed_file(
        json.dumps(fvp_data).encode("utf-8"),
        filename="result.json",
        project_id=project_id,
        document_type="temporal_checkpoint",
        workflow_id="FVPWorkflow",
        run_id="workflow_id",
    )
    toc_file_obj = await seed_file(
        json.dumps(toc_data).encode("utf-8"),
        filename="result.json",
        project_id=project_id,
        document_type="temporal_checkpoint",
        workflow_id="TocFVPWorkflow",
        run_id="workflow_id",
    )
    plausibility_file_obj = await seed_file(
        json.dumps(plausibility_data).encode("utf-8"),
        filename="result.json",
        project_id=project_id,
        document_type="temporal_checkpoint",
        workflow_id="PlausibilityFVPWorkflow",
        run_id="workflow_id",
    )

    args = FVPWorkflowArgs(project_id=project_id)

    # ---- MOCK: content extraction ----
    mock_content_extraction = AsyncMock()
    mock_content_extraction.return_value.summary_data.processed_files = [
        AsyncMock(
            processed_document=AsyncMock(
                metadata=AsyncMock(
                    document_id=file_id,
                    document_topic=AsyncMock(
                        id=seed_topic,
                        name="Test Topic",
                        description="Test Topic Description",
                    ),
                )
            )
        )
    ]

    # ---- MOCK: classification ----
    mock_classification = AsyncMock(
        return_value=FVPClassificationResult(
            formalpruefung_result=fvp_file_obj.model_dump(mode="json"),
            inhaltsverzeichnismatching_result=toc_file_obj.model_dump(mode="json"),
            classification_file_id=str(toc_file_obj.id),
        )
    )

    # ---- MOCK: plausibility ----
    mock_plausibility = AsyncMock(return_value=plausibility_file_obj.model_dump(mode="json"))

    storage = S3PayloadStorage(
        bucket_name=settings.temporal.S3_BUCKET_NAME,
        endpoint_url=settings.temporal.S3_ENDPOINT_URL,
        access_key=settings.temporal.S3_ACCESS_KEY_ID,
        secret_key=settings.temporal.S3_SECRET_ACCESS_KEY,
        region=settings.temporal.S3_REGION,
    )
    payload_codec = LargePayloadCodec(storage)
    payload_converter = DataConverter(
        payload_converter_class=PydanticPayloadConverter,
        payload_codec=payload_codec,
    )

    with (
        patch(
            "src.services.workflows.fvp.run_content_extraction_workflows",
            mock_content_extraction,
        ),
        patch(
            "src.services.workflows.fvp.run_fvp_classification_workflows",
            mock_classification,
        ),
        patch(
            "src.services.workflows.fvp.execute_plausibility_orchestrator_workflow",
            mock_plausibility,
        ),
    ):
        async with await WorkflowEnvironment.start_time_skipping(data_converter=payload_converter) as env:
            worker = Worker(
                env.client,
                task_queue="test-task-queue",
                workflows=[FVPWorkflow],
                workflow_runner=UnsandboxedWorkflowRunner(),
                activities=[
                    _send_fvp_results,
                    _send_plausibility_results,
                    get_project_files,
                    get_template_document_types,
                    _send_toc_matching_results,
                    get_topics,
                    update_file_topics,
                ],
            )

            async with worker:
                result = await env.client.execute_workflow(
                    FVPWorkflow.run,
                    args,
                    id=workflow_id,
                    task_queue="test-task-queue",
                )

    # ---- ASSERTIONS ----
    assert "checks" in result
    assert len(result["checks"]) > 0
