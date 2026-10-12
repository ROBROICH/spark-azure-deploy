"""Pydantic models for DMS files, extracted document details, and metadata."""

from datetime import UTC, datetime
from enum import Enum

from temporal.contracts import BaseMetadata as TemporalBaseMetadata


class ProjectBaseMetadataStatus(str, Enum):
    """Status of project base metadata loaded from the extraction summary."""

    COMPLETE = "complete"
    FALLBACK_MISSING = "fallback_missing"


class BaseMetadata(TemporalBaseMetadata):
    """Project-level metadata surfaced in plausibility result context."""

    @classmethod
    def fallback_unknown(cls, project_id: str) -> "BaseMetadata":
        """Create an explicit unknown-metadata fallback for incomplete summaries."""

        return cls(
            application_id=project_id,
            processing_timestamp=datetime.now(UTC),
        )
