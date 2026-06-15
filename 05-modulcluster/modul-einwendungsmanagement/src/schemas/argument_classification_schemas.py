"""Schemas for the classification of legal arguments.

This module defines the Pydantic models used for categorizing extracted
arguments into thematic legal areas.
"""

from pydantic import BaseModel, Field


class ArgumentClassificationItem(BaseModel):
    """Classification details for a single argument within a batch.

    Attributes:
        reasoning (str): A concise technical justification in German explaining
            why the specific topic (or subtopic) was selected.
        idx (int): The 0-based integer index corresponding to the
            matched topic or subtopic within the provided input list.
            Returns -1 if no sufficient match is found.
        confidence (float): A probability-like score between 0.0 and 1.0
            representing the LLM's certainty in this classification decision.
    """

    reasoning: str
    idx: int
    confidence: float = Field(
        ...,
        ge=0.0,
        le=1.0,
    )


class ArgumentClassificationResult(BaseModel):
    """Raw result from the LLM classification inference for a batch of arguments.

    Attributes:
        results (list[ArgumentClassificationItem]): An ordered list of classification
            results. The index of each item in this list corresponds exactly to
            the index of the argument in the input batch.
    """

    results: list[ArgumentClassificationItem]
