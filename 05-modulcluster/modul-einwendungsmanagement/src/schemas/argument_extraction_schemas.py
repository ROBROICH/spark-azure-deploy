"""Data schemas for the legal objection (Einwendung) extraction pipeline.

This module defines the Pydantic models used for data validation, Workflow/Activity
orchestration, and structured LLM outputs throughout the extraction process.
"""

from typing import Literal

from pydantic import BaseModel


class ArgumentExtractionLLMResult(BaseModel):
    """Structured raw output from the LLM for a single identified objection.

    Attributes:
        argument (str): The verbatim, strictly disjoint text segment identified
            as a specific objection.
        context (str | None): The surrounding verbatim text used to heal fragmented
            arguments, providing necessary semantic completeness (Who, What, Why).
            Returns None if the argument is already a fully self-contained thought.
        description (str): A full-context technical summary of the objection.
    """

    argument: str
    context: str | None
    description: str


class MultiArgumentsExtractionLLMResult(BaseModel):
    """Container for all objections identified within a single text chunk.

    Attributes:
        extracted_arguments (list[ArgumentExtractionLLMResult]): A list of
            individual extractions identified by the LLM.
    """

    extracted_arguments: list[ArgumentExtractionLLMResult]


class ArgumentxtractionActivityParams(BaseModel):
    """Parameters required to execute the LLM-based extraction activity.

    Attributes:
        chunk_text (str): The raw text content of the chunk to be analyzed.
    """

    chunk_text: str


class SpanPositionRequest(BaseModel):
    """Single span lookup request within a batch activity call."""

    span_text: str
    full_text: str


class SpanPositionsActivityParams(BaseModel):
    """Parameters for grounding text snippets in one activity call."""

    items: list[SpanPositionRequest]
    threshold: float


class ResidualContextAssignmentItem(BaseModel):
    """Result of assigning a residual text to a surrounding argument.

    Attributes:
        reasoning (str): A concise explanation in German justifying why the
            residual text belongs to Option 0 or Option 1.
        assigned_idx (int): Exactly 0 (for the preceding argument) or
            1 (for the succeeding argument).
    """

    reasoning: str
    assigned_idx: Literal[0, 1]


class ResidualContextAssignmentResult(BaseModel):
    """Container for the batch processing of residual context assignments.

    Attributes:
        results (list[ResidualContextAssignmentItem]): Ordered list of assignment
            results matching the exact length and order of the input batch.
    """

    results: list[ResidualContextAssignmentItem]
