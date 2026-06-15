"""Data models for word extraction."""

from pydantic import BaseModel, Field


class WordExtractorOutput(BaseModel):
    """LLM output listing words for Wortlaut-Auslegung."""

    extracted_words: list[str] = Field(
        min_length=1,
        description=(
            "Liste an Bestandteilen der unbestimmten Rechtsbegriffe, die man in einem Wörterbuch nachschlagen kann."
        )
    )
