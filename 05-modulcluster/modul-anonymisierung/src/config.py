"""Internal app config — stable redaction parameters, not deploy-varying."""

from pydantic import BaseModel, Field


class PresidioConfig(BaseModel):
    """Tuning parameters for the Presidio-based PII detector.

    Presidio runs as a deterministic baseline detector alongside the LLM
    detection path. It uses spaCy ``de_core_news_lg`` for NER plus
    Presidio's built-in pattern recognizers (IBAN, e-mail, phone, …).
    """

    # Language code passed to the Presidio analyzer engine.
    LANGUAGE: str = "de"

    # spaCy model used by the Presidio NLP engine. Loaded once per worker.
    SPACY_MODEL: str = "de_core_news_lg"

    # Minimum confidence score for a Presidio recognizer result.
    SCORE_THRESHOLD: float = Field(default=0.5, ge=0.0, le=1.0)

    # Drop matches shorter than this many characters.
    MIN_TERM_LENGTH: int = Field(default=3, ge=1)

    # Entity types to detect. Empty list = all built-in recognizers.
    ENTITIES: list[str] = Field(
        default_factory=lambda: [
            "PERSON",
            "EMAIL_ADDRESS",
            "PHONE_NUMBER",
        ]
    )


class RedactionConfig(BaseModel):
    """Tuning parameters for the redaction pipeline.

    These are internal algorithm parameters that rarely change between
    environments. For deploy-varying settings (URLs, credentials), see env.py.
    """

    # Batch size for parallel LLM inference.
    BATCH_SIZE: int = 50

    # Minimum similarity ratio for fuzzy PII matching.
    FUZZY_THRESHOLD: float = 0.95

    # Token injected when LLM inference fails on a page.
    ERROR_TOKEN: str = "!error!"

    # Margin (PDF points) to pad redaction boxes in all directions for complete PII coverage.
    REDACTION_MARGIN_PTS: float = 1.5

    # Presidio detector parameters.
    PRESIDIO: PresidioConfig = PresidioConfig()


config = RedactionConfig()
