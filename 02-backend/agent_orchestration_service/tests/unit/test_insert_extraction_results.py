from itertools import count
from uuid import UUID, uuid4

import pytest
from temporal.workflows.inhaltsextraktion.types import (
    Chunk,
    DocumentTopic,
    Metadata,
    PageIndexNode,
    ProcessedDocument,
    ProcessedFileInfo,
)

from src.workflows.insert_extraction_results.mapper import map_processed_document_nodes
from src.workflows.insert_extraction_results.types import InsertDocumentExtractionInput


@pytest.fixture(autouse=True)
def patch_workflow_uuid(monkeypatch: pytest.MonkeyPatch) -> None:
    counter = count()
    monkeypatch.setattr(
        "temporalio.workflow.uuid4",
        lambda: UUID(int=next(counter)),
    )


def test_map_processed_document_nodes_sets_frontend_parent_ids() -> None:
    project_id = uuid4()
    document_topic_id = uuid4()
    processed_file = ProcessedFileInfo(
        document_name="test.pdf",
        document_path="/tmp/test.pdf",
        processed_json_file_id=str(uuid4()),
        processed_document=ProcessedDocument(
            metadata=Metadata(
                original_document_name="test.pdf",
                source_file_id=str(uuid4()),
                summary="summary",
                document_topic=DocumentTopic(
                    id=document_topic_id,
                    name="Extracted Topic",
                    description="Extracted description",
                ),
            ),
            markdown_content="# Test",
            chunks=[],
        ),
    )

    inserts = map_processed_document_nodes(
        InsertDocumentExtractionInput(
            project_id=project_id,
            processed_file_info=processed_file,
        ),
    )

    dokument_insert = next(item for item in inserts if item["node_type"] == "dokument")
    assert dokument_insert["payload"]["frontend_parent_ids"] == [f"topic:{document_topic_id}"]


def test_map_processed_document_nodes_maps_page_index_sequences() -> None:
    project_id = uuid4()
    first_chunk_id = uuid4()
    second_chunk_id = uuid4()
    third_chunk_id = uuid4()
    fourth_chunk_id = uuid4()

    processed_file = ProcessedFileInfo(
        document_name="test.pdf",
        document_path="/tmp/test.pdf",
        processed_json_file_id=str(uuid4()),
        processed_document=ProcessedDocument(
            metadata=Metadata(
                original_document_name="test.pdf",
                source_file_id=str(uuid4()),
                summary="summary",
            ),
            markdown_content="# Test",
            chunks=[
                Chunk(
                    chunk_id=first_chunk_id,
                    page_content="first",
                    page_index_node=PageIndexNode(node_id="node-0", summary="node-0 summary"),
                ),
                Chunk(
                    chunk_id=second_chunk_id,
                    page_content="second",
                ),
                Chunk(
                    chunk_id=third_chunk_id,
                    page_content="third",
                    page_index_node=PageIndexNode(node_id="node-1", summary="node-1 summary"),
                ),
                Chunk(
                    chunk_id=fourth_chunk_id,
                    page_content="fourth",
                ),
            ],
        ),
    )

    inserts = map_processed_document_nodes(
        InsertDocumentExtractionInput(
            project_id=project_id,
            processed_file_info=processed_file,
        ),
    )

    chunk_inserts = {item["id"]: item["payload"] for item in inserts if item["node_type"] == "chunk"}

    assert chunk_inserts[str(first_chunk_id)]["page_index_node_id"] == "node-0"
    assert chunk_inserts[str(first_chunk_id)]["page_index_position"] == 0
    assert chunk_inserts[str(first_chunk_id)]["page_index_summary"] == "node-0 summary"

    assert chunk_inserts[str(second_chunk_id)]["page_index_node_id"] == "node-0"
    assert chunk_inserts[str(second_chunk_id)]["page_index_position"] == 1
    assert chunk_inserts[str(second_chunk_id)]["page_index_summary"] is None

    assert chunk_inserts[str(third_chunk_id)]["page_index_node_id"] == "node-1"
    assert chunk_inserts[str(third_chunk_id)]["page_index_position"] == 0
    assert chunk_inserts[str(third_chunk_id)]["page_index_summary"] == "node-1 summary"

    assert chunk_inserts[str(fourth_chunk_id)]["page_index_node_id"] == "node-1"
    assert chunk_inserts[str(fourth_chunk_id)]["page_index_position"] == 1
    assert chunk_inserts[str(fourth_chunk_id)]["page_index_summary"] is None


def test_map_processed_document_nodes_is_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    project_id = uuid4()
    source_file_id = str(uuid4())
    chunk_id = uuid4()
    processed_file = ProcessedFileInfo(
        document_name="test.pdf",
        document_path="/tmp/test.pdf",
        processed_json_file_id=str(uuid4()),
        processed_document=ProcessedDocument(
            metadata=Metadata(
                original_document_name="test.pdf",
                source_file_id=source_file_id,
                summary="summary",
            ),
            markdown_content="# Test",
            chunks=[Chunk(chunk_id=chunk_id, page_content="chunk text")],
        ),
    )

    args = InsertDocumentExtractionInput(
        project_id=project_id,
        processed_file_info=processed_file,
    )

    def reset_counter() -> None:
        counter = count()
        monkeypatch.setattr(
            "temporalio.workflow.uuid4",
            lambda: UUID(int=next(counter)),
        )

    reset_counter()
    first = map_processed_document_nodes(args)
    reset_counter()
    second = map_processed_document_nodes(args)

    assert [item["id"] for item in first] == [item["id"] for item in second]
    assert [item["node_type"] for item in first] == [item["node_type"] for item in second]


def test_map_processed_document_nodes_preserves_replacement_dokument_id() -> None:
    project_id = uuid4()
    existing_dokument_id = uuid4()
    source_file_id = str(uuid4())
    processed_file = ProcessedFileInfo(
        document_name="test.pdf",
        document_path="/tmp/test.pdf",
        processed_json_file_id=str(uuid4()),
        processed_document=ProcessedDocument(
            metadata=Metadata(
                original_document_name="test.pdf",
                source_file_id=source_file_id,
                summary="summary",
            ),
            markdown_content="# Test",
            chunks=[],
        ),
    )

    inserts = map_processed_document_nodes(
        InsertDocumentExtractionInput(
            project_id=project_id,
            processed_file_info=processed_file,
        ),
        dokument_id_override=existing_dokument_id,
    )

    dokument_insert = next(item for item in inserts if item["node_type"] == "dokument")
    assert dokument_insert["id"] == str(existing_dokument_id)
    assert dokument_insert["payload"]["dms_file_id"] == source_file_id
