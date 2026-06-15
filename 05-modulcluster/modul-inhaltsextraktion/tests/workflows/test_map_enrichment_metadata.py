# tests/workflows/test_map_enrichment_metadata.py
"""Tests for enrichment metadata mapping between pre-VLM and post-VLM chunks."""

import uuid
from typing import Any

from src.schemas import Chunk, SubChunk
from src.workflows.single_document_workflow import (
    ENRICHMENT_METADATA_FIELDS,
    _copy_enrichment_fields,
    _map_enrichment_metadata,
    _match_score,
)


def _make_chunk(
    toc_path: Any = None,
    page_numbers: Any = None,
    metadata_extra: Any = None,
    sub_chunks: Any = None,
) -> Chunk:
    """Helper to create a Chunk with specified metadata."""
    metadata = {}
    if toc_path is not None:
        metadata["toc_path"] = toc_path
    if page_numbers is not None:
        metadata["page_numbers"] = page_numbers
    if metadata_extra:
        metadata.update(metadata_extra)
    return Chunk(
        chunk_id=uuid.uuid4(),
        page_content="test content",
        metadata=metadata,
        sub_chunks=sub_chunks or [],
    )


class TestMatchScore:
    """Tests for the _match_score helper function."""

    def test_exact_path_match_scores_high(self) -> None:
        """Test that an exact toc_path match gives a high score."""
        chunk = _make_chunk(toc_path=["A", "B"], page_numbers=[1, 2])
        score = _match_score(chunk, ("A", "B"), {1, 2})
        assert score >= 1000

    def test_path_mismatch_scores_low(self) -> None:
        """Test that a mismatched toc_path gives a low score."""
        chunk = _make_chunk(toc_path=["A", "B"], page_numbers=[1, 2])
        score = _match_score(chunk, ("X", "Y"), {1, 2})
        assert score < 1000

    def test_page_overlap_adds_to_score(self) -> None:
        """Test that more page overlap results in a higher score."""
        chunk = _make_chunk(toc_path=["A"], page_numbers=[1, 2, 3])
        score_2_overlap = _match_score(chunk, ("A",), {2, 3})
        score_1_overlap = _match_score(chunk, ("A",), {3, 4})
        assert score_2_overlap > score_1_overlap

    def test_empty_verzeichnispfad_matches_empty(self) -> None:
        """Test that an empty toc_path matches another empty toc_path."""
        chunk = _make_chunk(toc_path=[], page_numbers=[1])
        score = _match_score(chunk, (), {1})
        assert score >= 1000

    def test_no_pages_gives_zero_overlap(self) -> None:
        """Test that no page numbers gives zero page overlap contribution."""
        chunk = _make_chunk(toc_path=["A"], page_numbers=[])
        score = _match_score(chunk, ("A",), set())
        # path match = 1000, page overlap = 0
        assert score == 1000


class TestCopyEnrichmentFields:
    """Tests for the _copy_enrichment_fields helper function."""

    def test_copies_all_enrichment_fields(self) -> None:
        """Test that all enrichment metadata fields are copied from source to target."""
        source = _make_chunk(
            metadata_extra={
                "focus_topic": "Naturschutz",
                "wildlife_mentioned": True,
                "plant_species_mentioned": False,
                "wildlife_species": ["Wolf"],
                "plant_species": [],
                "map_scale": "1:5000",
                "hypothetical_questions": ["Q1", "Q2"],
            }
        )
        target = _make_chunk()

        _copy_enrichment_fields(source, target)

        for field in ENRICHMENT_METADATA_FIELDS:
            assert field in target.metadata
        assert target.metadata["focus_topic"] == "Naturschutz"
        assert target.metadata["wildlife_species"] == ["Wolf"]

    def test_does_not_copy_non_enrichment_fields(self) -> None:
        """Test that non-enrichment fields from source are not copied to target."""
        source = _make_chunk(
            metadata_extra={
                "focus_topic": "X",
                "other_field": "should_not_copy",
            }
        )
        target = _make_chunk()

        _copy_enrichment_fields(source, target)

        assert "focus_topic" in target.metadata
        assert "other_field" not in target.metadata

    def test_propagates_to_sub_chunks(self) -> None:
        """Test that enrichment fields are propagated to sub_chunks."""
        source = _make_chunk(
            metadata_extra={
                "focus_topic": "Artenschutz",
                "hypothetical_questions": ["Q1"],
            }
        )
        sub = SubChunk(
            chunk_id=uuid.uuid4(),
            page_content="sub content",
            metadata={"existing": "value"},
        )
        target = _make_chunk(sub_chunks=[sub])

        _copy_enrichment_fields(source, target)

        assert len(target.sub_chunks) == 1
        assert target.sub_chunks[0].metadata["focus_topic"] == "Artenschutz"
        assert target.sub_chunks[0].metadata["hypothetical_questions"] == ["Q1"]
        assert target.sub_chunks[0].metadata["existing"] == "value"

    def test_skips_missing_fields(self) -> None:
        """Test that missing enrichment fields in source are not copied."""
        source = _make_chunk(metadata_extra={"focus_topic": "X"})
        target = _make_chunk()

        _copy_enrichment_fields(source, target)

        assert "focus_topic" in target.metadata
        assert "wildlife_mentioned" not in target.metadata


class TestMapEnrichmentMetadata:
    """Tests for the _map_enrichment_metadata function."""

    def test_empty_enriched_returns_target_unchanged(self) -> None:
        """Test that empty enriched list returns target chunks unchanged."""
        targets = [_make_chunk(), _make_chunk()]
        result = _map_enrichment_metadata([], targets)
        assert result is targets

    def test_same_count_1_to_1_mapping(self) -> None:
        """Test that equal-count enriched and target chunks map 1-to-1."""
        enriched = [
            _make_chunk(
                toc_path=["A"],
                page_numbers=[1],
                metadata_extra={"focus_topic": "Topic A"},
            ),
            _make_chunk(
                toc_path=["B"],
                page_numbers=[2],
                metadata_extra={"focus_topic": "Topic B"},
            ),
        ]
        targets = [
            _make_chunk(toc_path=["A"], page_numbers=[1]),
            _make_chunk(toc_path=["B"], page_numbers=[2]),
        ]

        result = _map_enrichment_metadata(enriched, targets)

        assert len(result) == 2
        assert result[0].metadata["focus_topic"] == "Topic A"
        assert result[1].metadata["focus_topic"] == "Topic B"

    def test_1_to_n_split_mapping(self) -> None:
        """Pre-VLM has 1 chunk that maps to 2 post-VLM chunks (same section)."""
        enriched = [
            _make_chunk(
                toc_path=["Section1"],
                page_numbers=[1, 2],
                metadata_extra={"focus_topic": "Nature"},
            ),
            _make_chunk(
                toc_path=["Section2"],
                page_numbers=[3],
                metadata_extra={"focus_topic": "Water"},
            ),
        ]
        targets = [
            _make_chunk(toc_path=["Section1"], page_numbers=[1]),
            _make_chunk(toc_path=["Section1"], page_numbers=[2]),
            _make_chunk(toc_path=["Section2"], page_numbers=[3]),
        ]

        result = _map_enrichment_metadata(enriched, targets)

        assert len(result) == 3
        assert result[0].metadata["focus_topic"] == "Nature"
        assert result[1].metadata["focus_topic"] == "Nature"
        assert result[2].metadata["focus_topic"] == "Water"

    def test_empty_verzeichnispfad_uses_page_overlap(self) -> None:
        """Content before first header has empty toc_path."""
        enriched = [
            _make_chunk(
                toc_path=[],
                page_numbers=[1],
                metadata_extra={"focus_topic": "Intro"},
            ),
            _make_chunk(
                toc_path=["A"],
                page_numbers=[2],
                metadata_extra={"focus_topic": "Main"},
            ),
        ]
        targets = [
            _make_chunk(toc_path=[], page_numbers=[1]),
            _make_chunk(toc_path=["A"], page_numbers=[2]),
        ]

        result = _map_enrichment_metadata(enriched, targets)

        assert result[0].metadata["focus_topic"] == "Intro"
        assert result[1].metadata["focus_topic"] == "Main"

    def test_more_target_chunks_than_enriched(self) -> None:
        """VLM expansion creates more chunks."""
        enriched = [
            _make_chunk(
                toc_path=["A"],
                page_numbers=[1],
                metadata_extra={"focus_topic": "X"},
            ),
        ]
        targets = [
            _make_chunk(toc_path=["A"], page_numbers=[1]),
            _make_chunk(toc_path=["A"], page_numbers=[1]),
            _make_chunk(toc_path=["A"], page_numbers=[1]),
        ]

        result = _map_enrichment_metadata(enriched, targets)

        assert len(result) == 3
        for chunk in result:
            assert chunk.metadata["focus_topic"] == "X"

    def test_sub_chunks_get_enrichment_metadata(self) -> None:
        """Test that sub_chunks also receive enrichment metadata from mapping."""
        enriched = [
            _make_chunk(
                toc_path=["A"],
                page_numbers=[1],
                metadata_extra={
                    "focus_topic": "Topic",
                    "hypothetical_questions": ["Q1"],
                },
            ),
        ]
        sub = SubChunk(
            chunk_id=uuid.uuid4(),
            page_content="sub",
            metadata={"existing": "val"},
        )
        targets = [
            _make_chunk(
                toc_path=["A"],
                page_numbers=[1],
                sub_chunks=[sub],
            ),
        ]

        result = _map_enrichment_metadata(enriched, targets)

        assert result[0].sub_chunks[0].metadata["focus_topic"] == "Topic"
        assert result[0].sub_chunks[0].metadata["hypothetical_questions"] == ["Q1"]
        assert result[0].sub_chunks[0].metadata["existing"] == "val"
