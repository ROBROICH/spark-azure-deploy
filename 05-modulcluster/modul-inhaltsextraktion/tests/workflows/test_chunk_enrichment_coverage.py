# tests/workflows/test_chunk_enrichment_coverage.py
"""Tests for chunk enrichment workflow: _merge_chunk_metadata and dataclasses."""

import uuid
from typing import Any

from src.schemas import Chunk, SubChunk
from src.workflows.chunk_enrichment.workflow import (
    ChunkEnrichmentWorkflowInput,
    ChunkEnrichmentWorkflowOutput,
    _merge_chunk_metadata,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_chunk(
    chunk_id: uuid.UUID | None = None,
    page_content: str = "test content",
    metadata: dict[str, Any] | None = None,
    sub_chunks: list[SubChunk] | None = None,
) -> Chunk:
    """Create a Chunk with sensible defaults for testing."""
    return Chunk(
        chunk_id=chunk_id or uuid.uuid4(),
        page_content=page_content,
        metadata=metadata or {},
        sub_chunks=sub_chunks or [],
    )


def _make_sub_chunk(
    chunk_id: uuid.UUID | None = None,
    page_content: str = "sub content",
    metadata: dict[str, Any] | None = None,
) -> SubChunk:
    """Create a SubChunk with sensible defaults for testing."""
    return SubChunk(
        chunk_id=chunk_id or uuid.uuid4(),
        page_content=page_content,
        metadata=metadata or {},
    )


# ---------------------------------------------------------------------------
# _merge_chunk_metadata tests
# ---------------------------------------------------------------------------


class TestMergeChunkMetadataAllNone:
    """When every enrichment source is None the original chunks come back unchanged."""

    def test_returns_same_count(self) -> None:
        """Test that the result has the same number of chunks as the originals."""
        originals = [_make_chunk(), _make_chunk()]
        result = _merge_chunk_metadata(originals, None, None, None)
        assert len(result) == len(originals)

    def test_metadata_preserved(self) -> None:
        """Test that existing metadata is preserved when no enrichment is provided."""
        originals = [_make_chunk(metadata={"existing": "value"})]
        result = _merge_chunk_metadata(originals, None, None, None)
        assert result[0].metadata == {"existing": "value"}

    def test_empty_originals(self) -> None:
        """Test that empty originals returns empty list."""
        result = _merge_chunk_metadata([], None, None, None)
        assert result == []

    def test_no_enrichment_fields_added(self) -> None:
        """Test that no enrichment fields are added when all sources are None."""
        originals = [_make_chunk(metadata={"a": 1})]
        result = _merge_chunk_metadata(originals, None, None, None)
        assert "focus_topic" not in result[0].metadata
        assert "wildlife_mentioned" not in result[0].metadata
        assert "hypothetical_questions" not in result[0].metadata


class TestMergeChunkMetadataSchwerpunktOnly:
    """Only the schwerpunkt enrichment is provided."""

    def test_focus_topic_merged(self) -> None:
        """Test that focus_topic is merged from schwerpunkt enrichment."""
        cid = uuid.uuid4()
        originals = [_make_chunk(chunk_id=cid, metadata={"existing": "val"})]
        schwerpunkt = [_make_chunk(chunk_id=cid, metadata={"focus_topic": "Naturschutz"})]
        result = _merge_chunk_metadata(originals, schwerpunkt, None, None)

        assert result[0].metadata["focus_topic"] == "Naturschutz"
        assert result[0].metadata["existing"] == "val"

    def test_no_species_or_questions_added(self) -> None:
        """Test that species and question fields are not added with schwerpunkt only."""
        cid = uuid.uuid4()
        originals = [_make_chunk(chunk_id=cid)]
        schwerpunkt = [_make_chunk(chunk_id=cid, metadata={"focus_topic": "X"})]
        result = _merge_chunk_metadata(originals, schwerpunkt, None, None)

        assert "wildlife_mentioned" not in result[0].metadata
        assert "hypothetical_questions" not in result[0].metadata

    def test_unmatched_chunk_id_ignored(self) -> None:
        """Test that enrichment with non-matching chunk_id is ignored."""
        originals = [_make_chunk(metadata={"orig": True})]
        schwerpunkt = [_make_chunk(metadata={"focus_topic": "ignored"})]
        result = _merge_chunk_metadata(originals, schwerpunkt, None, None)

        assert "focus_topic" not in result[0].metadata
        assert result[0].metadata["orig"] is True

    def test_schwerpunkt_without_focus_topic_key_skipped(self) -> None:
        """If the enriched chunk metadata doesn't have 'focus_topic', nothing is added."""
        cid = uuid.uuid4()
        originals = [_make_chunk(chunk_id=cid)]
        schwerpunkt = [_make_chunk(chunk_id=cid, metadata={"other": "data"})]
        result = _merge_chunk_metadata(originals, schwerpunkt, None, None)

        assert "focus_topic" not in result[0].metadata


class TestMergeChunkMetadataSpeciesScaleOnly:
    """Only the species_scale enrichment is provided."""

    def test_all_species_scale_fields_merged(self) -> None:
        """Test that all species_scale fields are merged correctly."""
        cid = uuid.uuid4()
        originals = [_make_chunk(chunk_id=cid)]
        species_scale = [
            _make_chunk(
                chunk_id=cid,
                metadata={
                    "wildlife_mentioned": True,
                    "plant_species_mentioned": False,
                    "wildlife_species": ["Wolf", "Luchs"],
                    "plant_species": ["Eiche"],
                    "map_scale": "1:5000",
                },
            )
        ]
        result = _merge_chunk_metadata(originals, None, species_scale, None)

        assert result[0].metadata["wildlife_mentioned"] is True
        assert result[0].metadata["plant_species_mentioned"] is False
        assert result[0].metadata["wildlife_species"] == ["Wolf", "Luchs"]
        assert result[0].metadata["plant_species"] == ["Eiche"]
        assert result[0].metadata["map_scale"] == "1:5000"

    def test_partial_species_scale_fields(self) -> None:
        """Only some species_scale fields present -- only those are merged."""
        cid = uuid.uuid4()
        originals = [_make_chunk(chunk_id=cid)]
        species_scale = [_make_chunk(chunk_id=cid, metadata={"wildlife_mentioned": True})]
        result = _merge_chunk_metadata(originals, None, species_scale, None)

        assert result[0].metadata["wildlife_mentioned"] is True
        assert "plant_species_mentioned" not in result[0].metadata
        assert "map_scale" not in result[0].metadata

    def test_no_focus_topic_or_questions_added(self) -> None:
        """Test that focus_topic and questions are not added with species_scale only."""
        cid = uuid.uuid4()
        originals = [_make_chunk(chunk_id=cid)]
        species_scale = [_make_chunk(chunk_id=cid, metadata={"wildlife_mentioned": False})]
        result = _merge_chunk_metadata(originals, None, species_scale, None)

        assert "focus_topic" not in result[0].metadata
        assert "hypothetical_questions" not in result[0].metadata


class TestMergeChunkMetadataHypoQuestionsOnly:
    """Only the hypothetical questions enrichment is provided."""

    def test_questions_merged(self) -> None:
        """Test that hypothetical questions are merged from enrichment."""
        cid = uuid.uuid4()
        originals = [_make_chunk(chunk_id=cid)]
        hypo = [
            _make_chunk(
                chunk_id=cid,
                metadata={"hypothetical_questions": ["Q1", "Q2"]},
            )
        ]
        result = _merge_chunk_metadata(originals, None, None, hypo)

        assert result[0].metadata["hypothetical_questions"] == ["Q1", "Q2"]

    def test_no_other_enrichment_fields_added(self) -> None:
        """Test that focus_topic and species fields are not added with questions only."""
        cid = uuid.uuid4()
        originals = [_make_chunk(chunk_id=cid)]
        hypo = [
            _make_chunk(
                chunk_id=cid,
                metadata={"hypothetical_questions": ["Q1"]},
            )
        ]
        result = _merge_chunk_metadata(originals, None, None, hypo)

        assert "focus_topic" not in result[0].metadata
        assert "wildlife_mentioned" not in result[0].metadata

    def test_hypo_without_key_skipped(self) -> None:
        """If enriched chunk has no 'hypothetical_questions' key, nothing is merged."""
        cid = uuid.uuid4()
        originals = [_make_chunk(chunk_id=cid)]
        hypo = [_make_chunk(chunk_id=cid, metadata={"other": "stuff"})]
        result = _merge_chunk_metadata(originals, None, None, hypo)

        assert "hypothetical_questions" not in result[0].metadata


class TestMergeChunkMetadataAllEnrichments:
    """All three enrichment sources are provided."""

    def test_all_fields_merged(self) -> None:
        """Test that all enrichment fields are merged when all sources are provided."""
        cid = uuid.uuid4()
        originals = [_make_chunk(chunk_id=cid, metadata={"original": True})]

        schwerpunkt = [_make_chunk(chunk_id=cid, metadata={"focus_topic": "Artenschutz"})]
        species_scale = [
            _make_chunk(
                chunk_id=cid,
                metadata={
                    "wildlife_mentioned": True,
                    "plant_species_mentioned": True,
                    "wildlife_species": ["Fledermaus"],
                    "plant_species": ["Buche"],
                    "map_scale": "1:10000",
                },
            )
        ]
        hypo = [
            _make_chunk(
                chunk_id=cid,
                metadata={"hypothetical_questions": ["Q1", "Q2", "Q3"]},
            )
        ]

        result = _merge_chunk_metadata(originals, schwerpunkt, species_scale, hypo)

        assert result[0].metadata["original"] is True
        assert result[0].metadata["focus_topic"] == "Artenschutz"
        assert result[0].metadata["wildlife_mentioned"] is True
        assert result[0].metadata["plant_species_mentioned"] is True
        assert result[0].metadata["wildlife_species"] == ["Fledermaus"]
        assert result[0].metadata["plant_species"] == ["Buche"]
        assert result[0].metadata["map_scale"] == "1:10000"
        assert result[0].metadata["hypothetical_questions"] == ["Q1", "Q2", "Q3"]

    def test_multiple_chunks_all_enrichments(self) -> None:
        """Test that multiple chunks each receive their own enrichment data."""
        cid1 = uuid.uuid4()
        cid2 = uuid.uuid4()
        originals = [
            _make_chunk(chunk_id=cid1, page_content="chunk 1"),
            _make_chunk(chunk_id=cid2, page_content="chunk 2"),
        ]
        schwerpunkt = [
            _make_chunk(chunk_id=cid1, metadata={"focus_topic": "Topic A"}),
            _make_chunk(chunk_id=cid2, metadata={"focus_topic": "Topic B"}),
        ]
        species_scale = [
            _make_chunk(chunk_id=cid1, metadata={"wildlife_mentioned": True}),
            _make_chunk(chunk_id=cid2, metadata={"wildlife_mentioned": False}),
        ]
        hypo = [
            _make_chunk(
                chunk_id=cid1,
                metadata={"hypothetical_questions": ["Q1"]},
            ),
            _make_chunk(
                chunk_id=cid2,
                metadata={"hypothetical_questions": ["Q2"]},
            ),
        ]

        result = _merge_chunk_metadata(originals, schwerpunkt, species_scale, hypo)

        assert len(result) == 2
        assert result[0].metadata["focus_topic"] == "Topic A"
        assert result[0].metadata["wildlife_mentioned"] is True
        assert result[0].metadata["hypothetical_questions"] == ["Q1"]

        assert result[1].metadata["focus_topic"] == "Topic B"
        assert result[1].metadata["wildlife_mentioned"] is False
        assert result[1].metadata["hypothetical_questions"] == ["Q2"]

    def test_original_metadata_not_mutated(self) -> None:
        """The original chunk objects should not be modified in place."""
        cid = uuid.uuid4()
        original_metadata = {"keep": "me"}
        originals = [_make_chunk(chunk_id=cid, metadata=original_metadata.copy())]
        schwerpunkt = [_make_chunk(chunk_id=cid, metadata={"focus_topic": "New"})]

        result = _merge_chunk_metadata(originals, schwerpunkt, None, None)

        # Result has the merged field
        assert result[0].metadata["focus_topic"] == "New"
        # Original chunk's metadata should not have the new field
        # (model_copy creates a new object)
        assert "focus_topic" not in originals[0].metadata


class TestMergeChunkMetadataSubChunks:
    """Metadata is propagated to sub_chunks."""

    def test_sub_chunks_get_focus_topic(self) -> None:
        """Test that sub_chunks receive the parent focus_topic metadata."""
        cid = uuid.uuid4()
        sub = _make_sub_chunk(metadata={"existing_sub": "data"})
        originals = [_make_chunk(chunk_id=cid, sub_chunks=[sub])]
        schwerpunkt = [_make_chunk(chunk_id=cid, metadata={"focus_topic": "Umwelt"})]

        result = _merge_chunk_metadata(originals, schwerpunkt, None, None)

        assert len(result[0].sub_chunks) == 1
        assert result[0].sub_chunks[0].metadata["focus_topic"] == "Umwelt"
        assert result[0].sub_chunks[0].metadata["existing_sub"] == "data"

    def test_sub_chunks_get_species_scale_fields(self) -> None:
        """Test that sub_chunks receive species_scale metadata from parent."""
        cid = uuid.uuid4()
        sub = _make_sub_chunk()
        originals = [_make_chunk(chunk_id=cid, sub_chunks=[sub])]
        species_scale = [
            _make_chunk(
                chunk_id=cid,
                metadata={
                    "wildlife_mentioned": True,
                    "plant_species_mentioned": False,
                    "wildlife_species": ["Biber"],
                    "plant_species": [],
                    "map_scale": "1:2500",
                },
            )
        ]

        result = _merge_chunk_metadata(originals, None, species_scale, None)

        sub_meta = result[0].sub_chunks[0].metadata
        assert sub_meta["wildlife_mentioned"] is True
        assert sub_meta["plant_species_mentioned"] is False
        assert sub_meta["wildlife_species"] == ["Biber"]
        assert sub_meta["plant_species"] == []
        assert sub_meta["map_scale"] == "1:2500"

    def test_sub_chunks_get_hypothetical_questions(self) -> None:
        """Test that sub_chunks receive hypothetical_questions from parent."""
        cid = uuid.uuid4()
        sub = _make_sub_chunk()
        originals = [_make_chunk(chunk_id=cid, sub_chunks=[sub])]
        hypo = [
            _make_chunk(
                chunk_id=cid,
                metadata={"hypothetical_questions": ["What?", "Why?"]},
            )
        ]

        result = _merge_chunk_metadata(originals, None, None, hypo)

        sub_meta = result[0].sub_chunks[0].metadata
        assert sub_meta["hypothetical_questions"] == ["What?", "Why?"]

    def test_multiple_sub_chunks_all_get_metadata(self) -> None:
        """Test that all sub_chunks receive the same enrichment metadata."""
        cid = uuid.uuid4()
        sub1 = _make_sub_chunk(metadata={"pos": 1})
        sub2 = _make_sub_chunk(metadata={"pos": 2})
        originals = [_make_chunk(chunk_id=cid, sub_chunks=[sub1, sub2])]
        schwerpunkt = [_make_chunk(chunk_id=cid, metadata={"focus_topic": "Shared"})]
        hypo = [
            _make_chunk(
                chunk_id=cid,
                metadata={"hypothetical_questions": ["Q"]},
            )
        ]

        result = _merge_chunk_metadata(originals, schwerpunkt, None, hypo)

        for i, sc in enumerate(result[0].sub_chunks):
            assert sc.metadata["focus_topic"] == "Shared"
            assert sc.metadata["hypothetical_questions"] == ["Q"]
            assert sc.metadata["pos"] == i + 1

    def test_sub_chunks_without_enrichment_keep_original_metadata(self) -> None:
        """When no enrichment matches, sub_chunk metadata stays the same."""
        cid = uuid.uuid4()
        sub = _make_sub_chunk(metadata={"original_sub_key": 42})
        originals = [_make_chunk(chunk_id=cid, sub_chunks=[sub])]

        result = _merge_chunk_metadata(originals, None, None, None)

        assert result[0].sub_chunks[0].metadata == {"original_sub_key": 42}


# ---------------------------------------------------------------------------
# Dataclass tests
# ---------------------------------------------------------------------------


class TestChunkEnrichmentWorkflowInput:
    """ChunkEnrichmentWorkflowInput BaseModel."""

    def test_construction(self) -> None:
        """Test that ChunkEnrichmentWorkflowInput can be constructed with chunks."""
        chunks = [_make_chunk(), _make_chunk()]
        inp = ChunkEnrichmentWorkflowInput(chunks=chunks)
        assert inp.chunks == chunks
        assert len(inp.chunks) == 2

    def test_empty_chunks(self) -> None:
        """Test that ChunkEnrichmentWorkflowInput accepts an empty chunks list."""
        inp = ChunkEnrichmentWorkflowInput(chunks=[])
        assert inp.chunks == []

    def test_stores_chunk_objects(self) -> None:
        """Test that Chunk objects are stored correctly in the input."""
        c = _make_chunk(page_content="hello")
        inp = ChunkEnrichmentWorkflowInput(chunks=[c])
        assert inp.chunks[0].page_content == "hello"


class TestChunkEnrichmentWorkflowOutput:
    """ChunkEnrichmentWorkflowOutput BaseModel."""

    def test_construction_with_defaults(self) -> None:
        """Test that ChunkEnrichmentWorkflowOutput can be constructed with chunks."""
        chunks = [_make_chunk()]
        out = ChunkEnrichmentWorkflowOutput(chunks=chunks)
        assert out.chunks == chunks

    def test_construction_empty(self) -> None:
        """Test that ChunkEnrichmentWorkflowOutput accepts empty chunks."""
        out = ChunkEnrichmentWorkflowOutput(chunks=[])
        assert out.chunks == []
