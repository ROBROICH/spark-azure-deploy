"""Unit tests for EWMS workflow orchestration."""

from collections.abc import Awaitable, Callable
from typing import Any
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from temporal.workflows.einwendungsmanagement.types import (
    ArgumentClassificationOutput,
    ArgumentExtractionOutput,
    ArgumentRecord,
    ArgumentSubtopic,
    ArgumentTopic,
    ChunkArguments,
    ClassifiedArgument,
    DocumentArguments,
    ExtractedArgument,
    Segment,
    TextSpan,
)
from temporal.workflows.inhaltsextraktion.types import (
    ChunkEWMS,
    PromptInjection,
    SingleDocumentEWMSWorkflowOutput,
)
from temporal.workflows.orchestrator.ewms import EWMSOrchestratorWorkflowInput

from src.models.schemas.ewms import InjectionDetectedDocument, InjectionDetectedRequest
from src.workflows.ewms.activity import (
    EWMSDocumentsInput,
    StoreClassificationInput,
    StoreExtractionInput,
    StoreInjectionInput,
    _fetch_argument_topics,
    _store_classification_results,
    _store_extraction_results,
    _store_injection_results,
)
from src.workflows.ewms.workflow import (
    EWMSEntrypointWorkflow,
    EWMSEntrypointWorkflowOutput,
    EWMSOrchestratorWorkflow,
    _split_by_injection,
)


def _make_extracted_argument(text: str = "Argument text") -> ExtractedArgument:
    return ExtractedArgument(
        argument=Segment(text=text, span=TextSpan(start_idx=0, end_idx=len(text))),
        description="Description",
        context=Segment(text=f"Context for {text}", span=TextSpan(start_idx=0, end_idx=len(f"Context for {text}"))),
    )


@pytest.mark.asyncio
async def test_fetch_argument_topics_groups_pls_subtopics(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    topic_id = uuid4()
    subtopic_id = uuid4()
    other_topic_id = uuid4()

    async def fake_list_nodes(project_id: str) -> dict[str, Any]:
        return {
            "nodes": [
                {"id": str(topic_id), "node_type": "topic", "parents": []},
                {"id": str(other_topic_id), "node_type": "topic", "parents": []},
                {
                    "id": str(subtopic_id),
                    "node_type": "subtopic",
                    "parents": [{"id": str(topic_id), "node_type": "topic"}],
                },
            ]
        }

    async def fake_batch_get_nodes(project_id: str, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        assert {(node["node_type"], node["id"]) for node in nodes} == {
            ("topic", str(topic_id)),
            ("topic", str(other_topic_id)),
            ("subtopic", str(subtopic_id)),
        }
        return {
            "results": [
                {
                    "id": str(topic_id),
                    "node_type": "topic",
                    "parent_topic_id": None,
                    "name": "Topic",
                    "description": "Topic description",
                    "show_in_ewm": True,
                },
                {
                    "id": str(other_topic_id),
                    "node_type": "topic",
                    "parent_topic_id": None,
                    "name": "Other topic",
                    "description": None,
                    "show_in_ewm": True,
                },
                {
                    "id": str(subtopic_id),
                    "node_type": "subtopic",
                    "topic_id": str(topic_id),
                    "name": "Subtopic",
                    "description": "Subtopic description",
                    "show_in_ewm": True,
                },
            ]
        }

    monkeypatch.setattr(
        "src.workflows.ewms.activity.PlsApiClient.list_nodes",
        fake_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.ewms.activity.PlsApiClient.batch_get_nodes",
        fake_batch_get_nodes,
    )

    result = await _fetch_argument_topics(str(project_id))

    assert result == [
        ArgumentTopic(
            topic_id=topic_id,
            name="Topic",
            description="Topic description",
            subtopics=[
                ArgumentSubtopic(
                    topic_id=subtopic_id,
                    name="Subtopic",
                    description="Subtopic description",
                )
            ],
        ),
        ArgumentTopic(
            topic_id=other_topic_id,
            name="Other topic",
            description="",
            subtopics=[],
        ),
    ]


@pytest.mark.asyncio
async def test_fetch_argument_topics_filters_hidden_ewm_topics_and_subtopics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    visible_topic_id = uuid4()
    hidden_topic_id = uuid4()
    visible_subtopic_id = uuid4()
    hidden_subtopic_id = uuid4()

    async def fake_list_nodes(project_id: str) -> dict[str, Any]:
        return {
            "nodes": [
                {"id": str(visible_topic_id), "node_type": "topic", "parents": []},
                {"id": str(hidden_topic_id), "node_type": "topic", "parents": []},
                {
                    "id": str(visible_subtopic_id),
                    "node_type": "subtopic",
                    "parents": [{"id": str(visible_topic_id), "node_type": "topic"}],
                },
                {
                    "id": str(hidden_subtopic_id),
                    "node_type": "subtopic",
                    "parents": [{"id": str(visible_topic_id), "node_type": "topic"}],
                },
            ]
        }

    async def fake_batch_get_nodes(project_id: str, nodes: list[dict[str, Any]]) -> dict[str, Any]:
        return {
            "results": [
                {
                    "id": str(visible_topic_id),
                    "node_type": "topic",
                    "parent_topic_id": None,
                    "name": "Visible topic",
                    "description": None,
                    "show_in_ewm": True,
                },
                {
                    "id": str(hidden_topic_id),
                    "node_type": "topic",
                    "parent_topic_id": None,
                    "name": "Hidden topic",
                    "description": None,
                    "show_in_ewm": False,
                },
                {
                    "id": str(visible_subtopic_id),
                    "node_type": "subtopic",
                    "topic_id": str(visible_topic_id),
                    "name": "Visible subtopic",
                    "description": None,
                    "show_in_ewm": True,
                },
                {
                    "id": str(hidden_subtopic_id),
                    "node_type": "subtopic",
                    "topic_id": str(visible_topic_id),
                    "name": "Hidden subtopic",
                    "description": None,
                    "show_in_ewm": False,
                },
            ]
        }

    monkeypatch.setattr(
        "src.workflows.ewms.activity.PlsApiClient.list_nodes",
        fake_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.ewms.activity.PlsApiClient.batch_get_nodes",
        fake_batch_get_nodes,
    )

    result = await _fetch_argument_topics(str(project_id))

    assert result == [
        ArgumentTopic(
            topic_id=visible_topic_id,
            name="Visible topic",
            description="",
            subtopics=[
                ArgumentSubtopic(
                    topic_id=visible_subtopic_id,
                    name="Visible subtopic",
                    description="",
                )
            ],
        )
    ]


@pytest.mark.asyncio
async def test_store_classification_results_sends_unclassified_argument_ids(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    classified_argument_id = uuid4()
    unclassified_argument_id = uuid4()
    topic_id = uuid4()
    subtopic_id = uuid4()
    mock_store_classification_results = AsyncMock(return_value={"updated_count": 1})
    monkeypatch.setattr(
        "src.workflows.ewms.activity.ObjectionsServiceClient.store_classification_results",
        mock_store_classification_results,
    )

    result = await _store_classification_results(
        StoreClassificationInput(
            project_id=project_id,
            classification_output=ArgumentClassificationOutput(
                classified_arguments=[
                    ClassifiedArgument(
                        argument_record=ArgumentRecord(
                            argument_id=classified_argument_id,
                            extracted_argument=_make_extracted_argument("classified"),
                        ),
                        topic=ArgumentTopic(topic_id=topic_id, name="Topic", description="", subtopics=[]),
                        subtopic=ArgumentSubtopic(topic_id=subtopic_id, name="Subtopic", description=""),
                        reasoning="classified",
                        confidence=1.0,
                    ),
                    ClassifiedArgument(
                        argument_record=ArgumentRecord(
                            argument_id=unclassified_argument_id,
                            extracted_argument=_make_extracted_argument("unclassified"),
                        ),
                        topic=None,
                        subtopic=None,
                        reasoning="No fitting topic",
                        confidence=0.9,
                    ),
                ]
            ),
        )
    )

    assert result == {"updated_count": 1}
    mock_store_classification_results.assert_awaited_once()
    payload = mock_store_classification_results.call_args.kwargs["payload"]
    assert payload.classified_arguments[0].argument_id == classified_argument_id
    assert payload.classified_arguments[0].topic_id == topic_id
    assert payload.classified_arguments[0].sub_topic_id == subtopic_id
    assert payload.unclassified_argument_ids == [unclassified_argument_id]


@pytest.mark.asyncio
async def test_store_injection_results_builds_typed_request(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    file_id = uuid4()
    mock_mark_injection_detected = AsyncMock(return_value={"updated_count": 1})
    monkeypatch.setattr(
        "src.workflows.ewms.activity.ObjectionsServiceClient.mark_injection_detected",
        mock_mark_injection_detected,
    )

    result = await _store_injection_results(
        StoreInjectionInput(
            project_id=project_id,
            documents=[
                InjectionDetectedDocument(
                    file_id=file_id,
                    document_name="evil.pdf",
                    snippet="bad",
                )
            ],
        )
    )

    assert result == {"updated_count": 1}
    mock_mark_injection_detected.assert_awaited_once()
    payload = mock_mark_injection_detected.call_args.kwargs["payload"]
    assert isinstance(payload, InjectionDetectedRequest)
    assert payload.documents == [
        InjectionDetectedDocument(
            file_id=file_id,
            document_name="evil.pdf",
            snippet="bad",
        )
    ]


@pytest.mark.asyncio
async def test_store_injection_results_falls_back_to_file_id_when_name_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    project_id = uuid4()
    file_id = uuid4()
    mock_mark_injection_detected = AsyncMock(return_value={"updated_count": 1})
    monkeypatch.setattr(
        "src.workflows.ewms.activity.ObjectionsServiceClient.mark_injection_detected",
        mock_mark_injection_detected,
    )

    await _store_injection_results(
        StoreInjectionInput(
            project_id=project_id,
            documents=[
                InjectionDetectedDocument(
                    file_id=file_id,
                    document_name=str(file_id),
                    snippet=None,
                )
            ],
        )
    )

    payload = mock_mark_injection_detected.call_args.kwargs["payload"]
    assert payload.documents[0].document_name == str(file_id)
    assert payload.documents[0].snippet is None


@pytest.mark.asyncio
async def test_store_extraction_results_enriches_oms_payload(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    file_id = uuid4()
    mock_store_extraction_results = AsyncMock(return_value={"results": []})
    monkeypatch.setattr(
        "src.workflows.ewms.activity.ObjectionsServiceClient.store_extraction_results",
        mock_store_extraction_results,
    )

    result = await _store_extraction_results(
        StoreExtractionInput(
            project_id=project_id,
            extraction_output=ArgumentExtractionOutput(
                document_arguments=[
                    DocumentArguments(
                        document_id=str(file_id),
                        chunk_arguments=[
                            ChunkArguments(
                                chunk=ChunkEWMS(chunk_id=uuid4(), page_content="content", page_numbers=[1]),
                                arguments=[],
                            )
                        ],
                    )
                ]
            ),
            document_names_by_id={str(file_id): "clean.pdf"},
            markdown_by_id={str(file_id): "# markdown"},
        )
    )

    assert result == {"results": []}
    mock_store_extraction_results.assert_awaited_once()
    payload = mock_store_extraction_results.call_args.kwargs["payload"]
    assert payload["document_arguments"][0]["document_id"] == str(file_id)
    assert payload["document_arguments"][0]["document_name"] == "clean.pdf"
    assert payload["document_arguments"][0]["beteiligungs_eingang_markdown"] == "# markdown"


@pytest.mark.asyncio
async def test_ewms_orchestrator_starts_entrypoint_for_each_file_id(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    file_id_1 = uuid4()
    file_id_2 = uuid4()
    captured: list[tuple[Any, Any, dict[str, Any]]] = []
    captured_window: tuple[list[Any], int] | None = None

    async def fake_execute_child_workflow(run_method: Any, arg: Any, **kwargs: Any) -> EWMSEntrypointWorkflowOutput:
        captured.append((run_method, arg, kwargs))
        return EWMSEntrypointWorkflowOutput()

    async def fake_sliding_window(items: list[Any], fn: Callable[[Any], Awaitable[Any]], concurrency: int) -> list[Any]:
        nonlocal captured_window
        captured_window = (items, concurrency)
        return [await fn(item) for item in items]

    child_ids = iter([uuid4(), uuid4()])
    monkeypatch.setattr("src.workflows.ewms.workflow.sliding_window", fake_sliding_window)
    monkeypatch.setattr("src.workflows.ewms.workflow.workflow.uuid4", lambda: next(child_ids))
    monkeypatch.setattr(
        "src.workflows.ewms.workflow.workflow.execute_child_workflow",
        fake_execute_child_workflow,
    )

    await EWMSOrchestratorWorkflow().run(
        EWMSOrchestratorWorkflowInput(
            project_id=project_id,
            file_ids=[file_id_1, file_id_2],
        )
    )

    assert captured_window == ([file_id_1, file_id_2], 10)
    assert [arg.file_id for _, arg, _ in captured] == [file_id_1, file_id_2]
    assert [arg.project_id for _, arg, _ in captured] == [project_id, project_id]
    assert {run_method for run_method, _, _ in captured} == {EWMSEntrypointWorkflow.run}


def _make_ewms_output(injection_detected: bool, snippet: str | None = None) -> SingleDocumentEWMSWorkflowOutput:
    return SingleDocumentEWMSWorkflowOutput(
        prompt_injection=PromptInjection(injection_detected=injection_detected, snippet=snippet),
        markdown="# doc",
        chunks=[],
        original_file_id=str(uuid4()),
    )


def test_split_by_injection_all_clean() -> None:
    outputs = [_make_ewms_output(False), _make_ewms_output(False)]

    clean, injected = _split_by_injection(outputs)

    assert clean == outputs
    assert injected == []


def test_split_by_injection_all_injected() -> None:
    outputs = [_make_ewms_output(True, "IGNORE"), _make_ewms_output(True)]

    clean, injected = _split_by_injection(outputs)

    assert clean == []
    assert injected == outputs


def test_split_by_injection_mixed() -> None:
    clean_doc = _make_ewms_output(False)
    injected_doc = _make_ewms_output(True, "bad snippet")

    clean, injected = _split_by_injection([clean_doc, injected_doc])

    assert clean == [clean_doc]
    assert injected == [injected_doc]


@pytest.mark.asyncio
async def test_ewms_workflow_skips_injection_store_when_no_injections(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    mock_api_call = AsyncMock()
    monkeypatch.setattr("src.workflows.ewms.workflow.api_call", mock_api_call)

    workflow_instance = EWMSEntrypointWorkflow()

    ewms_documents = EWMSDocumentsInput(file_ids=[], document_names_by_id={})

    await workflow_instance._store_injection_results(uuid4(), ewms_documents, [])

    mock_api_call.assert_not_awaited()


@pytest.mark.asyncio
async def test_ewms_workflow_passes_injection_data_to_activity(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[tuple[Any, Any]] = []

    async def fake_api_call(fn: Any, arg: Any) -> None:
        captured.append((fn, arg))

    monkeypatch.setattr("src.workflows.ewms.workflow.api_call", fake_api_call)

    project_id = uuid4()
    file_id = str(uuid4())
    injected_doc = SingleDocumentEWMSWorkflowOutput(
        prompt_injection=PromptInjection(injection_detected=True, snippet=None),
        markdown="# doc",
        chunks=[],
        original_file_id=file_id,
    )
    ewms_documents = EWMSDocumentsInput(file_ids=[], document_names_by_id={})  # no metadata for this file

    workflow_instance = EWMSEntrypointWorkflow()
    await workflow_instance._store_injection_results(project_id, ewms_documents, [injected_doc])

    assert len(captured) == 1
    _, store_input = captured[0]
    assert store_input.documents[0].document_name == file_id
    assert store_input.documents[0].snippet is None


@pytest.mark.asyncio
async def test_ewms_workflow_calls_injection_store_for_injected_docs(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    captured: list[tuple[Any, Any]] = []

    async def fake_api_call(fn: Any, arg: Any) -> None:
        captured.append((fn, arg))

    monkeypatch.setattr("src.workflows.ewms.workflow.api_call", fake_api_call)

    project_id = uuid4()
    file_id = str(uuid4())
    injected_doc = SingleDocumentEWMSWorkflowOutput(
        prompt_injection=PromptInjection(injection_detected=True, snippet="bad"),
        markdown="# doc",
        chunks=[],
        original_file_id=file_id,
    )
    ewms_documents = EWMSDocumentsInput(
        file_ids=[file_id],
        document_names_by_id={file_id: "evil.pdf"},
    )

    workflow_instance = EWMSEntrypointWorkflow()
    await workflow_instance._store_injection_results(project_id, ewms_documents, [injected_doc])

    assert len(captured) == 1
    _, store_input = captured[0]
    assert isinstance(store_input, StoreInjectionInput)
    assert store_input.project_id == project_id
    assert len(store_input.documents) == 1
    assert str(store_input.documents[0].file_id) == file_id
    assert store_input.documents[0].document_name == "evil.pdf"
    assert store_input.documents[0].snippet == "bad"
