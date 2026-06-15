"""Tests for reverse_mapper — graph nodes → ProcessedDocument round-trip."""

from collections.abc import Iterator
from typing import Any
from unittest.mock import patch
from uuid import UUID, uuid4

import pytest
from temporal.workflows.inhaltsextraktion.types import (
    Chunk,
    DocumentTypeInfo,
    Metadata,
    ProcessedDocument,
    ProcessedFileInfo,
    SubChunk,
)

from src.workflows.insert_extraction_results.mapper import map_processed_document_nodes
from src.workflows.insert_extraction_results.reverse_mapper import (
    reconstruct_processed_files,
)
from src.workflows.insert_extraction_results.types import (
    InsertDocumentExtractionInput,
)

_MAPPER_MOD = "src.workflows.insert_extraction_results.mapper"

_EXPECTED_PAGES = 5
_EXPECTED_TABLE_SUB_CHUNK_COUNT = 2


@pytest.fixture(autouse=True)
def _mock_workflow_uuid4() -> Iterator[None]:
    """The mapper uses workflow.uuid4() for Temporal replay safety. Mock it for unit tests."""
    with patch(f"{_MAPPER_MOD}.workflow") as mock_wf:
        mock_wf.uuid4 = uuid4
        yield


def _make_sub_chunk(
    parent_chunk_id: UUID,
    *,
    chunk_type: str = "text",
    text: str = "Sub-chunk content",
    focus_topic: str = "",
    page_numbers: list[int] | None = None,
    hypothetical_questions: list[str] | None = None,
    extra_meta: dict[str, Any] | None = None,
) -> SubChunk:
    meta: dict[str, Any] = {
        "chunk_type": chunk_type,
        "page_numbers": page_numbers or [1],
        "focus_topic": focus_topic,
        "hypothetical_questions": hypothetical_questions or [],
    }
    if extra_meta:
        meta.update(extra_meta)
    return SubChunk(
        parent_chunk_id=parent_chunk_id,
        page_content=text,
        metadata=meta,
        header="Sub-header",
    )


def _make_document(*, with_enrichment: bool = False, with_table: bool = False) -> ProcessedDocument:
    """Build a representative ProcessedDocument for round-trip testing."""
    chunk_id = uuid4()

    sc1_meta_extra: dict[str, Any] = {}
    if with_enrichment:
        sc1_meta_extra = {
            "Header 1": "Part A",
            "Header 2": "Section 1",
            "Header 3": None,
            "wildlife_mentioned": True,
            "plant_species_mentioned": False,
            "wildlife_species": ["Rotmilan"],
            "plant_species": [],
            "map_scale": "1:25000",
        }

    sc1 = _make_sub_chunk(
        chunk_id,
        text="First sub-chunk text.",
        focus_topic="Umwelt",
        page_numbers=[1, 2],
        hypothetical_questions=["What is this about?"],
        extra_meta=sc1_meta_extra,
    )

    sub_chunks = [sc1]

    if with_table:
        sc2 = _make_sub_chunk(
            chunk_id,
            chunk_type="table",
            text="| Col A | Col B |",
            extra_meta={
                "asset_path": "/images/table1.png",
                "caption": "Table 1",
                "summary": "A summary of the table",
                "description": "Detailed description",
                "content": "Raw table content",
                "footnote": "Note 1",
            },
        )
        sub_chunks.append(sc2)

    chunk = Chunk(
        chunk_id=chunk_id,
        page_content="Full chunk content here.",
        metadata={
            "page_numbers": [1, 2],
            "toc_path": ["Part A", "Section 1"],
            "all_subchapters": ["1.1", "1.2"],
            "hypothetical_questions": ["Top-level question?"],
        },
        sub_chunks=sub_chunks,
        header="Section 1",
    )

    return ProcessedDocument(
        metadata=Metadata(
            original_document_name="test.pdf",
            source_file_id=str(uuid4()),
            document_type=DocumentTypeInfo(name="Erläuterungsbericht"),
            pages=5,
            summary="A test document summary.",
        ),
        markdown_content="# Full Markdown\n\nContent here.",
        chunks=[chunk],
    )


def _forward_then_reverse(doc: ProcessedDocument, project_id: str = "proj-1") -> ProcessedFileInfo:
    """Forward-map a ProcessedDocument to graph nodes, then reverse-map back."""
    pf = ProcessedFileInfo(
        document_name=doc.metadata.original_document_name,
        document_path="/tmp/test.pdf",
        processed_json_file_id=str(uuid4()),
        processed_document=doc,
    )
    # Forward: ProcessedDocument → graph nodes
    inserts = map_processed_document_nodes(InsertDocumentExtractionInput(project_id=uuid4(), processed_file_info=pf))
    # Simulate what examination service returns: node dicts with id and node_type at top level
    all_nodes = [{"id": node["id"], "node_type": node["node_type"], **node["payload"]} for node in inserts]
    # Reverse: graph nodes → ProcessedFileInfo
    results = reconstruct_processed_files(all_nodes, project_id)
    assert len(results) == 1
    return results[0]


class TestRoundTrip:
    def test_simple_document(self) -> None:
        """Basic document round-trips correctly."""
        doc = _make_document()
        result = _forward_then_reverse(doc)
        r_doc = result.processed_document
        assert r_doc is not None

        # Document metadata
        assert r_doc.metadata.original_document_name == "test.pdf"
        assert r_doc.metadata.document_type is not None
        assert r_doc.metadata.document_type.name == "Erläuterungsbericht"
        assert r_doc.metadata.pages == _EXPECTED_PAGES
        assert r_doc.metadata.summary == "A test document summary."
        assert r_doc.metadata.source_file_id == doc.metadata.source_file_id
        assert r_doc.metadata.document_id == doc.metadata.document_id

        # Markdown
        assert r_doc.markdown_content == "# Full Markdown\n\nContent here."

        # Chunks
        assert len(r_doc.chunks) == 1
        chunk = r_doc.chunks[0]
        assert chunk.header == "Section 1"
        assert chunk.page_content == "Full chunk content here."
        assert chunk.metadata["page_numbers"] == [1, 2]
        assert chunk.metadata["toc_path"] == ["Part A", "Section 1"]
        assert chunk.metadata["all_subchapters"] == ["1.1", "1.2"]
        assert chunk.metadata["hypothetical_questions"] == ["Top-level question?"]

        # Sub-chunks
        assert len(chunk.sub_chunks) == 1
        sc = chunk.sub_chunks[0]
        assert sc.page_content == "First sub-chunk text."
        assert sc.header == "Sub-header"
        assert sc.parent_chunk_id == chunk.chunk_id
        assert sc.metadata["chunk_type"] == "text"
        assert sc.metadata["page_numbers"] == [1, 2]
        assert sc.metadata["focus_topic"] == "Umwelt"
        assert sc.metadata["hypothetical_questions"] == ["What is this about?"]

    def test_enrichment_fields_round_trip(self) -> None:
        """Species/scale and header trail fields survive the round-trip."""
        doc = _make_document(with_enrichment=True)
        result = _forward_then_reverse(doc)
        assert result.processed_document is not None
        sc = result.processed_document.chunks[0].sub_chunks[0]

        assert sc.metadata["Header 1"] == "Part A"
        assert sc.metadata["Header 2"] == "Section 1"
        assert sc.metadata["wildlife_mentioned"] is True
        assert sc.metadata["plant_species_mentioned"] is False
        assert sc.metadata["wildlife_species"] == ["Rotmilan"]
        assert sc.metadata["plant_species"] == []
        assert sc.metadata["map_scale"] == "1:25000"

    def test_table_sub_chunk_round_trip(self) -> None:
        """Table sub-chunks preserve typed node metadata."""
        doc = _make_document(with_table=True)
        result = _forward_then_reverse(doc)
        assert result.processed_document is not None
        sub_chunks = result.processed_document.chunks[0].sub_chunks
        assert len(sub_chunks) == _EXPECTED_TABLE_SUB_CHUNK_COUNT

        table_sc = next(sc for sc in sub_chunks if sc.metadata["chunk_type"] == "table")
        assert table_sc.page_content == "| Col A | Col B |"
        assert table_sc.metadata["asset_path"] == "/images/table1.png"
        assert table_sc.metadata["caption"] == "Table 1"
        assert table_sc.metadata["summary"] == "A summary of the table"
        assert table_sc.metadata["description"] == "Detailed description"
        assert table_sc.metadata["content"] == "Raw table content"
        assert table_sc.metadata["footnote"] == "Note 1"

    def test_empty_nodes_returns_empty(self) -> None:
        """No nodes → no results."""
        assert reconstruct_processed_files([], "proj-1") == []

    def test_no_dokument_nodes_returns_empty(self) -> None:
        """Nodes without any dokument type → no results."""
        nodes = [{"id": "x", "node_type": "chunk", "dokument_id": "missing"}]
        assert reconstruct_processed_files(nodes, "proj-1") == []

    def test_focus_topic_empty_string_preserved(self) -> None:
        """Empty string focus_topic stays as empty string, not None."""
        doc = _make_document()
        # Ensure original has empty string
        doc.chunks[0].sub_chunks[0].metadata["focus_topic"] = ""
        result = _forward_then_reverse(doc)
        assert result.processed_document is not None
        sc = result.processed_document.chunks[0].sub_chunks[0]
        assert sc.metadata["focus_topic"] == ""
