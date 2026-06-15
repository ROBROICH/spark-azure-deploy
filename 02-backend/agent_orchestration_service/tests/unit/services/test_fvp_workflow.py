from datetime import datetime
from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest
from pydantic import ValidationError
from temporal.project_context import (
    PROJECT_ID_SEARCH_ATTRIBUTE,
    PROJECT_VERSION_SEARCH_ATTRIBUTE,
    ProjectContext,
    current_project_context,
    use_project_context,
)
from temporal.workflows.inhaltsextraktion.types import (
    DocumentTopic,
    Metadata,
    ProcessDocumentsWorkflowOutput,
    ProcessedDocument,
    ProcessedFileInfo,
    SummaryData,
)

from src.models.schemas.files import FileObject
from src.models.schemas.temporal.fvp import (
    DocumentTypeDefinition,
    FullFVPWorkflowInput,
    FVPWorkflowArgs,
    TemplateDocumentTypeResponse,
)
from src.services.activities.fvp import (
    fetch_existing_dokument_nodes,
    get_project_files,
    get_template_document_types,
    get_topics,
)
from src.services.workflows.fvp import FVPWorkflow, start_fvp_workflow
from src.services.workflows.fvp_workflow import (
    _get_result_id,
    collect_document_topic_updates,
    erlaeuterungsbericht_ids_from_fcs_results,
    run_content_extraction_workflows,
    run_fvp_classification_workflows,
    run_fvp_workflow,
)
from src.services.workflows.workflow_constants import (
    CONTENT_EXTRACTION,
    FORMAL_COMPLETENESS,
    PLAUSIBILITY_CHECK,
    TABLE_OF_CONTENTS_MATCHING,
)


def _make_file_payload(file_id: str) -> dict[str, str]:
    return {
        "id": file_id,
        "type": "temporal_checkpoint",
        "filename": "result.json",
        "bucketPath": "temporal_checkpoints/result.json",
        "projectId": str(uuid4()),
        "mimeType": "application/json",
    }


def _make_file_object(file_id: str, project_id: str) -> FileObject:
    return FileObject(
        id=UUID(file_id),
        type="document",
        filename=f"{file_id}.pdf",
        mime_type="application/pdf",
        bucket_path=f"documents/{file_id}.pdf",
        project_id=UUID(project_id),
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


@pytest.mark.parametrize(
    ("result", "expected_id"),
    [
        (_make_file_payload("dict-file-id"), "dict-file-id"),
        (SimpleNamespace(**_make_file_payload("object-file-id")), "object-file-id"),
    ],
)
def test_get_result_id_supports_mapping_and_object_results(result: Any, expected_id: str) -> None:
    assert _get_result_id(result) == expected_id


@pytest.mark.asyncio
async def test_start_fvp_workflow_uses_explicit_project_version_for_search_attributes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = str(uuid4())
    captured: dict[str, object] = {}

    class Client:
        async def start_workflow(self, *args: object, **kwargs: object) -> SimpleNamespace:
            captured["workflow"] = args[0]
            captured["id"] = kwargs["id"]
            captured["context"] = current_project_context()
            captured["search_attributes"] = kwargs["search_attributes"]
            return SimpleNamespace(id=kwargs["id"])

    monkeypatch.setattr("temporal.utils.is_in_workflow", lambda: False)
    monkeypatch.setattr("temporal.utils.get_temporal_client", AsyncMock(return_value=Client()))

    with use_project_context(project_id, 1):
        result = await start_fvp_workflow(
            FVPWorkflowArgs(project_id=project_id),
            project_id=project_id,
            project_version=2,
        )
        assert current_project_context() == ProjectContext(project_id=project_id, project_version=1)

    assert result.id == f"FVPWorkflow-{project_id}-v2"
    assert captured["id"] == f"FVPWorkflow-{project_id}-v2"
    assert captured["context"] == ProjectContext(project_id=project_id, project_version=2)
    values = {pair.key.name: pair.value for pair in captured["search_attributes"]}
    assert values[PROJECT_ID_SEARCH_ATTRIBUTE.name] == project_id
    assert values[PROJECT_VERSION_SEARCH_ATTRIBUTE.name] == 2


def test_get_result_id_rejects_invalid_payload() -> None:
    with pytest.raises(ValidationError):
        _get_result_id({})


def test_collect_document_topic_updates_skips_unassigned_documents() -> None:
    file_id = str(uuid4())
    topic_id = uuid4()

    updates = collect_document_topic_updates(
        [
            ProcessedFileInfo(
                document_name="assigned.pdf",
                document_path="path/to/assigned.pdf",
                processed_json_file_id=str(uuid4()),
                processed_document=ProcessedDocument(
                    metadata=Metadata(
                        original_document_name="assigned.pdf",
                        source_file_id=file_id,
                        summary="summary",
                        document_topic=DocumentTopic(
                            id=topic_id,
                            name="Assigned topic",
                            description="Assigned topic description",
                        ),
                    ),
                    markdown_content="# assigned",
                ),
            ),
            ProcessedFileInfo(
                document_name="unassigned.pdf",
                document_path="path/to/unassigned.pdf",
                processed_json_file_id=str(uuid4()),
                processed_document=ProcessedDocument(
                    metadata=Metadata(
                        original_document_name="unassigned.pdf",
                        source_file_id=str(uuid4()),
                        summary="summary",
                    ),
                    markdown_content="# unassigned",
                ),
            ),
        ]
    )

    assert updates == [(file_id, topic_id)]


@pytest.mark.asyncio
async def test_setup_workflow_input_plans_incremental_candidates(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = str(uuid4())
    fresh_file_id = str(uuid4())
    outdated_file_id = str(uuid4())
    missing_doc_file_id = str(uuid4())
    fresh_dokument_id = str(uuid4())
    outdated_dokument_id = str(uuid4())

    fake_workflow = MagicMock()
    fake_workflow.execute_activity = AsyncMock()

    async def execute_activity(activity: Any, *args: Any, **kwargs: Any) -> list[Any]:
        if activity is get_template_document_types:
            return [
                TemplateDocumentTypeResponse(
                    category="Kategorie",
                    document_type_id=uuid4(),
                    document_type_name="Erläuterungsbericht",
                    document_type_description="Beschreibung",
                    expected_count=1,
                )
            ]
        if activity is get_project_files:
            return [
                _make_file_object(fresh_file_id, project_id),
                _make_file_object(outdated_file_id, project_id),
                _make_file_object(missing_doc_file_id, project_id),
            ]
        if activity is fetch_existing_dokument_nodes:
            return [
                {
                    "node_type": "dokument",
                    "id": fresh_dokument_id,
                    "dms_file_id": fresh_file_id,
                    "is_outdated": False,
                    "is_toc_document": True,
                },
                {
                    "node_type": "dokument",
                    "id": outdated_dokument_id,
                    "dms_file_id": outdated_file_id,
                    "is_outdated": True,
                    "is_toc_document": False,
                },
                {
                    "node_type": "dokument",
                    "id": str(uuid4()),
                    "dms_file_id": str(uuid4()),
                    "is_outdated": False,
                    "is_toc_document": False,
                },
            ]
        if activity is get_topics:
            return []
        raise AssertionError(f"Unexpected activity {activity}")

    fake_workflow.execute_activity.side_effect = execute_activity

    with (
        patch("src.services.workflows.fvp.workflow", fake_workflow),
        patch(
            "src.services.workflows.fvp.current_project_context",
            return_value=SimpleNamespace(project_id=project_id, project_version=2),
        ),
    ):
        result = await FVPWorkflow()._setup_workflow_input(FVPWorkflowArgs(project_id=project_id))

    assert result.file_ids == [fresh_file_id, outdated_file_id, missing_doc_file_id]
    assert result.candidate_file_ids == [outdated_file_id, missing_doc_file_id]
    assert result.dokument_id_by_file_id == {
        fresh_file_id: fresh_dokument_id,
        outdated_file_id: outdated_dokument_id,
    }
    assert result.has_toc_document is True
    assert result.incremental is True


@pytest.mark.asyncio
async def test_setup_workflow_input_uses_full_run_for_project_version_one(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = str(uuid4())
    first_file_id = str(uuid4())
    second_file_id = str(uuid4())
    first_dokument_id = str(uuid4())
    second_dokument_id = str(uuid4())

    async def execute_activity(activity: Any, *args: Any, **kwargs: Any) -> list[Any]:
        if activity is get_template_document_types:
            return []
        if activity is get_project_files:
            return [
                _make_file_object(first_file_id, project_id),
                _make_file_object(second_file_id, project_id),
            ]
        if activity is fetch_existing_dokument_nodes:
            return [
                {
                    "node_type": "dokument",
                    "id": first_dokument_id,
                    "dms_file_id": first_file_id,
                    "is_outdated": False,
                    "is_toc_document": True,
                },
                {
                    "node_type": "dokument",
                    "id": second_dokument_id,
                    "dms_file_id": second_file_id,
                    "is_outdated": False,
                    "is_toc_document": False,
                },
            ]
        if activity is get_topics:
            return []
        raise AssertionError(f"Unexpected activity {activity}")

    fake_workflow = MagicMock()
    fake_workflow.execute_activity = AsyncMock(side_effect=execute_activity)

    with (
        patch("src.services.workflows.fvp.workflow", fake_workflow),
        patch(
            "src.services.workflows.fvp.current_project_context",
            return_value=SimpleNamespace(project_id=project_id, project_version=1),
        ),
    ):
        result = await FVPWorkflow()._setup_workflow_input(FVPWorkflowArgs(project_id=project_id))

    assert result.file_ids == [first_file_id, second_file_id]
    assert result.candidate_file_ids == [first_file_id, second_file_id]
    assert result.dokument_id_by_file_id == {
        first_file_id: first_dokument_id,
        second_file_id: second_dokument_id,
    }
    assert result.has_toc_document is False
    assert result.incremental is False


@pytest.mark.asyncio
async def test_setup_workflow_input_marks_no_toc_when_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = str(uuid4())
    file_id = str(uuid4())

    async def execute_activity(activity: Any, *args: Any, **kwargs: Any) -> list[Any]:
        if activity is get_template_document_types:
            return []
        if activity is get_project_files:
            return [_make_file_object(file_id, project_id)]
        if activity is fetch_existing_dokument_nodes:
            return [
                {
                    "node_type": "dokument",
                    "id": str(uuid4()),
                    "dms_file_id": file_id,
                    "is_outdated": False,
                    "is_toc_document": False,
                }
            ]
        if activity is get_topics:
            return []
        raise AssertionError(f"Unexpected activity {activity}")

    fake_workflow = MagicMock()
    fake_workflow.execute_activity = AsyncMock(side_effect=execute_activity)

    with (
        patch("src.services.workflows.fvp.workflow", fake_workflow),
        patch(
            "src.services.workflows.fvp.current_project_context",
            return_value=SimpleNamespace(project_id=project_id, project_version=2),
        ),
    ):
        result = await FVPWorkflow()._setup_workflow_input(FVPWorkflowArgs(project_id=project_id))

    assert result.candidate_file_ids == []
    assert result.has_toc_document is False


@pytest.mark.asyncio
async def test_run_content_extraction_uses_candidates_and_passes_mapping(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = str(uuid4())
    stable_file_id = str(uuid4())
    candidate_file_id = str(uuid4())
    existing_dokument_id = str(uuid4())

    extraction_output = ProcessDocumentsWorkflowOutput(
        summary_file_id=uuid4(),
        summary_data=SummaryData(
            base_metadata=None,
            total_duration_seconds=1.0,
            processed_files=[
                ProcessedFileInfo(
                    document_name="candidate.pdf",
                    document_path="candidate.pdf",
                    processed_json_file_id=str(uuid4()),
                    processed_document=None,
                )
            ],
        ),
        processed_file_ids=[UUID(candidate_file_id)],
    )
    process_documents = AsyncMock(return_value=extraction_output.model_dump(mode="json"))
    insert_results = AsyncMock()
    ensure_qdrant = AsyncMock()

    monkeypatch.setattr(
        "src.services.workflows.fvp_workflow.execute_process_documents_workflow",
        process_documents,
    )
    monkeypatch.setattr("src.services.workflows.fvp_workflow.insert_extraction_results", insert_results)
    monkeypatch.setattr("src.services.workflows.fvp_workflow.execute_ensure_qdrant_workflow", ensure_qdrant)

    result = await run_content_extraction_workflows(
        FullFVPWorkflowInput(
            project_id=project_id,
            file_ids=[stable_file_id, candidate_file_id],
            candidate_file_ids=[candidate_file_id],
            dokument_id_by_file_id={candidate_file_id: existing_dokument_id},
            incremental=True,
            topics=[],
            document_types=[],
        )
    )

    assert result.processed_file_ids == [UUID(candidate_file_id)]
    assert process_documents.await_args is not None
    process_input = process_documents.await_args.args[0]
    assert process_input.file_ids == [UUID(candidate_file_id)]
    assert insert_results.await_args is not None
    insert_input = insert_results.await_args.args[0]
    assert insert_input.dokument_id_by_file_id == {candidate_file_id: existing_dokument_id}
    assert ensure_qdrant.await_args is not None
    ensure_input = ensure_qdrant.await_args.args[0]
    assert ensure_input.processed_files == extraction_output.summary_data.processed_files


@pytest.mark.asyncio
async def test_run_fvp_classification_uses_candidates_and_skips_toc_when_marker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = str(uuid4())
    stable_file_id = str(uuid4())
    candidate_file_id = str(uuid4())
    classification_file_id = str(uuid4())
    llm_matching = AsyncMock(return_value={**_make_file_payload(classification_file_id), "projectId": project_id})
    toc_matching = AsyncMock()

    monkeypatch.setattr("src.services.workflows.fvp_workflow.execute_llm_matching_workflow", llm_matching)
    monkeypatch.setattr(
        "src.services.workflows.fvp_workflow.execute_inhaltsverzeichnis_matching_workflow",
        toc_matching,
    )

    result = await run_fvp_classification_workflows(
        FullFVPWorkflowInput(
            project_id=project_id,
            file_ids=[stable_file_id, candidate_file_id],
            candidate_file_ids=[candidate_file_id],
            has_toc_document=True,
            incremental=True,
            topics=[],
            document_types=[],
        )
    )

    assert llm_matching.await_args is not None
    llm_input = llm_matching.await_args.args[0]
    assert llm_input.document_ids == [candidate_file_id]
    toc_matching.assert_not_awaited()
    assert result.classification_file_id == classification_file_id


@pytest.mark.asyncio
async def test_run_fvp_classification_skips_all_when_no_candidates_and_toc_marker(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    llm_matching = AsyncMock()
    toc_matching = AsyncMock()
    monkeypatch.setattr("src.services.workflows.fvp_workflow.execute_llm_matching_workflow", llm_matching)
    monkeypatch.setattr(
        "src.services.workflows.fvp_workflow.execute_inhaltsverzeichnis_matching_workflow",
        toc_matching,
    )

    result = await run_fvp_classification_workflows(
        FullFVPWorkflowInput(
            project_id=str(uuid4()),
            file_ids=[str(uuid4())],
            candidate_file_ids=[],
            has_toc_document=True,
            incremental=True,
            topics=[],
            document_types=[],
        )
    )

    llm_matching.assert_not_awaited()
    toc_matching.assert_not_awaited()
    assert result.formalpruefung_result is None
    assert result.inhaltsverzeichnismatching_result is None
    assert result.classification_file_id is None


def test_erlaeuterungsbericht_ids_from_fcs_results_uses_full_persisted_state() -> None:
    low_confidence_id = str(uuid4())
    high_confidence_id = str(uuid4())
    unrelated_id = str(uuid4())

    assert erlaeuterungsbericht_ids_from_fcs_results(
        {
            "matched_document_types": [
                {
                    "required_document_type": {"document_type_name": "Erläuterungsbericht"},
                    "assigned_documents": [
                        {"document_id": low_confidence_id, "confidence": 0.2},
                        {"document_id": high_confidence_id, "confidence": 0.9},
                    ],
                },
                {
                    "required_document_type": {"document_type_name": "Lageplan"},
                    "assigned_documents": [{"document_id": unrelated_id, "confidence": 1.0}],
                },
            ]
        }
    ) == [high_confidence_id]


@pytest.mark.asyncio
async def test_run_fvp_workflow_passes_dict_result_id_to_plausibility(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = str(uuid4())
    document_id = str(uuid4())
    classification_file_id = str(uuid4())
    toc_file_id = str(uuid4())
    plausibility_file_id = str(uuid4())

    process_documents = AsyncMock(
        return_value=ProcessDocumentsWorkflowOutput(
            summary_file_id=uuid4(),
            summary_data=SummaryData(
                base_metadata=None,
                total_duration_seconds=1.0,
                processed_files=[
                    ProcessedFileInfo(
                        document_name="test.pdf",
                        document_path="path/to/test.pdf",
                        processed_json_file_id=str(uuid4()),
                        processed_document=None,
                    )
                ],
            ),
            processed_file_ids=[UUID(document_id)],
        ).model_dump(mode="json")
    )
    llm_matching = AsyncMock(
        return_value={
            **_make_file_payload(classification_file_id),
            "projectId": project_id,
        }
    )
    toc_matching = AsyncMock(return_value={**_make_file_payload(toc_file_id), "projectId": project_id})
    plausibility = AsyncMock(
        return_value={
            **_make_file_payload(plausibility_file_id),
            "projectId": project_id,
        }
    )

    monkeypatch.setattr(
        "src.services.workflows.fvp_workflow.execute_process_documents_workflow",
        process_documents,
    )
    monkeypatch.setattr(
        "src.services.workflows.fvp_workflow.execute_llm_matching_workflow",
        llm_matching,
    )
    monkeypatch.setattr(
        "src.services.workflows.fvp_workflow.execute_inhaltsverzeichnis_matching_workflow",
        toc_matching,
    )
    monkeypatch.setattr(
        "src.services.workflows.fvp_workflow.execute_plausibility_orchestrator_workflow",
        plausibility,
    )
    monkeypatch.setattr("src.services.workflows.fvp_workflow.insert_extraction_results", AsyncMock())
    monkeypatch.setattr("src.services.workflows.fvp_workflow.execute_ensure_qdrant_workflow", AsyncMock())

    result = await run_fvp_workflow(
        FullFVPWorkflowInput(
            project_id=project_id,
            file_ids=[document_id],
            topics=[],
            document_types=[
                DocumentTypeDefinition(
                    category=None,
                    document_type_name="Erlaeuterungsbericht",
                    document_type_description="Beschreibung",
                )
            ],
        )
    )

    process_documents.assert_awaited_once()
    llm_matching.assert_awaited_once()
    toc_matching.assert_awaited_once()
    plausibility.assert_awaited_once()
    assert plausibility.await_args is not None
    plausibility_input = plausibility.await_args.args[0]
    assert plausibility_input.classification_file_id == classification_file_id
    assert [item.workflow_type for item in result.results] == [
        CONTENT_EXTRACTION,
        FORMAL_COMPLETENESS,
        PLAUSIBILITY_CHECK,
        TABLE_OF_CONTENTS_MATCHING,
    ]
    assert result.results[1].result is not None
    assert result.results[1].result["id"] == classification_file_id
    assert result.results[1].result["projectId"] == project_id
