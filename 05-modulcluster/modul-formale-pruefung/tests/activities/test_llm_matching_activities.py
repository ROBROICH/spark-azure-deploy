"""Tests for hallucination guard logic in LLM matching activities.

These tests verify the post-LLM validation that protects against
out-of-bounds indices returned by the model. The LLMClient is mocked
to return controlled responses — the thing under test is the validation
logic, not the LLM itself.
"""

from unittest.mock import AsyncMock, patch

import pytest
from temporal.workflows.formale_pruefung.types import DocumentTypeDefinition

from src.activities.llm_matching_activities import (
    llm_document_grouping,
    llm_match_document_to_list,
)
from src.schemas.llm_matching_schemas import (
    DocumentClassificationMatchResult,
    DocumentGroup,
    DocumentGroupingActivityParams,
    DocumentGroupingResult,
    DocumentMatchingActivityParams,
)


def _patch_workflow(return_model) -> tuple:
    return (
        patch(
            "temporalio.workflow.execute_activity",
            AsyncMock(return_value=return_model.model_dump_json()),
        ),
        patch("temporalio.workflow.logger"),
    )


# ---------------------------------------------------------------------------
# llm_document_grouping — index bounds validation
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_grouping_discards_out_of_bounds_representative_index():
    """Discard groups where the representative index exceeds document bounds."""
    params = DocumentGroupingActivityParams(
        document_names=["doc_a.pdf", "doc_b.pdf", "doc_c.pdf"],
    )
    llm_response = DocumentGroupingResult(
        groups=[
            DocumentGroup(group_name="Valid", document_indices=[0, 1], representative_index=0),
            DocumentGroup(group_name="Hallucinated Rep", document_indices=[0, 2], representative_index=5),
        ]
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_document_grouping(params)

    assert len(result) == 1
    assert result[0].group_name == "Valid"


@pytest.mark.asyncio
async def test_grouping_discards_group_with_any_out_of_bounds_document_index():
    """Discard groups containing any document index that is out of bounds."""
    params = DocumentGroupingActivityParams(document_names=["doc_a.pdf", "doc_b.pdf"])
    llm_response = DocumentGroupingResult(
        groups=[
            DocumentGroup(group_name="One Bad Apple", document_indices=[0, 1, 99], representative_index=0),
        ]
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_document_grouping(params)

    assert result == []


@pytest.mark.asyncio
async def test_grouping_discards_negative_representative_index():
    """Discard groups where the representative index is negative."""
    params = DocumentGroupingActivityParams(document_names=["doc_a.pdf", "doc_b.pdf"])
    llm_response = DocumentGroupingResult(
        groups=[
            DocumentGroup(group_name="Negative Rep", document_indices=[0, 1], representative_index=-1),
        ]
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_document_grouping(params)

    assert result == []


@pytest.mark.asyncio
async def test_grouping_mixed_valid_and_invalid_keeps_only_valid():
    """Only valid groups survive; invalid ones are silently discarded."""
    params = DocumentGroupingActivityParams(
        document_names=["report.pdf", "appendix_a.pdf", "appendix_b.pdf"],
    )
    llm_response = DocumentGroupingResult(
        groups=[
            DocumentGroup(group_name="Reports", document_indices=[0], representative_index=0),
            DocumentGroup(group_name="Bad Rep Index", document_indices=[1, 2], representative_index=10),
            DocumentGroup(group_name="Appendices", document_indices=[1, 2], representative_index=1),
            DocumentGroup(group_name="Bad Doc Index", document_indices=[1, 50], representative_index=1),
        ]
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_document_grouping(params)

    assert len(result) == 2
    assert [g.group_name for g in result] == ["Reports", "Appendices"]


@pytest.mark.asyncio
async def test_grouping_all_valid_groups_pass_through():
    """Ensure all valid groups are correctly passed through without modification."""
    params = DocumentGroupingActivityParams(
        document_names=["report.pdf", "appendix_a.pdf", "appendix_b.pdf"],
    )
    groups = [
        DocumentGroup(group_name="Reports", document_indices=[0], representative_index=0),
        DocumentGroup(group_name="Appendices", document_indices=[1, 2], representative_index=1),
    ]
    llm_response = DocumentGroupingResult(groups=groups)

    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_document_grouping(params)

    assert len(result) == 2
    assert result[0].representative_index == 0
    assert result[1].document_indices == [1, 2]


# ---------------------------------------------------------------------------
# llm_match_document_to_list — match_index bounds validation
# ---------------------------------------------------------------------------

TWO_CANDIDATES = [
    DocumentTypeDefinition(
        document_type_name="Erläuterungsbericht",
        document_type_description="Explanatory report for the project",
    ),
    DocumentTypeDefinition(
        document_type_name="Umweltverträglichkeitsprüfung",
        document_type_description="Environmental impact assessment",
    ),
]


def _matching_params(
    candidates: list[DocumentTypeDefinition] = TWO_CANDIDATES,
) -> DocumentMatchingActivityParams:
    return DocumentMatchingActivityParams(
        document_name="test_doc.pdf",
        document_summary="A technical environmental report",
        document_group="Technical Documents",
        candidate_list=candidates,
    )


@pytest.mark.asyncio
async def test_matching_valid_index_passes_through():
    """Verify that a valid match index is preserved in the output."""
    params = _matching_params()
    llm_response = DocumentClassificationMatchResult(
        reasoning="Strong match to environmental report",
        confidence=0.92,
        match_index=1,
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_match_document_to_list(params)

    assert result.match_index == 1
    assert result.confidence == 0.92
    assert result.reasoning == "Strong match to environmental report"


@pytest.mark.asyncio
async def test_matching_index_zero_valid_for_nonempty_list():
    """Confirm that the first candidate (index 0) is a valid match."""
    params = _matching_params()
    llm_response = DocumentClassificationMatchResult(
        reasoning="First candidate matches",
        confidence=0.88,
        match_index=0,
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_match_document_to_list(params)

    assert result.match_index == 0


@pytest.mark.asyncio
async def test_matching_last_valid_index_passes_through():
    """match_index == len(candidates) - 1 is the last valid index."""
    params = _matching_params()
    llm_response = DocumentClassificationMatchResult(
        reasoning="Last candidate",
        confidence=0.7,
        match_index=1,
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_match_document_to_list(params)

    assert result.match_index == 1


@pytest.mark.asyncio
async def test_matching_no_match_negative_one_stays():
    """match_index == -1 is the legitimate 'no match' signal — left untouched."""
    params = _matching_params()
    llm_response = DocumentClassificationMatchResult(
        reasoning="No suitable match found",
        confidence=0.1,
        match_index=-1,
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_match_document_to_list(params)

    assert result.match_index == -1


@pytest.mark.asyncio
async def test_matching_index_equal_to_length_reset_to_negative_one():
    """Off-by-one: match_index == len(candidates) is out of bounds."""
    params = _matching_params()
    llm_response = DocumentClassificationMatchResult(
        reasoning="Hallucinated boundary match",
        confidence=0.6,
        match_index=2,
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_match_document_to_list(params)

    assert result.match_index == -1


@pytest.mark.asyncio
async def test_matching_large_hallucinated_index_reset():
    """Reset very large out-of-bounds indices to -1 while preserving metadata."""
    params = _matching_params()
    llm_response = DocumentClassificationMatchResult(
        reasoning="Matched to item 42",
        confidence=0.85,
        match_index=42,
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_match_document_to_list(params)

    assert result.match_index == -1
    assert result.reasoning == "Matched to item 42"
    assert result.confidence == 0.85


@pytest.mark.asyncio
async def test_matching_negative_below_minus_one_reset():
    """A negative index other than -1 (e.g. -2) is also out of bounds."""
    params = _matching_params()
    llm_response = DocumentClassificationMatchResult(
        reasoning="Negative hallucination",
        confidence=0.5,
        match_index=-2,
    )
    p1, p2 = _patch_workflow(llm_response)
    with p1, p2:
        result = await llm_match_document_to_list(params)

    assert result.match_index == -1
