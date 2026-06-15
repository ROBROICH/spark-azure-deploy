"""Immutable filter set for one history request — threaded through service + repository."""

from __future__ import annotations

import datetime
import uuid
from dataclasses import dataclass

from src.models.schemas.protocol_schemas import SourceFilter


@dataclass(frozen=True, slots=True)
class HistoryQuery:
    """All user-facing filters for a single GET /history request.

    ``source`` stays a ``SourceFilter`` rather than decaying to ``str`` at the
    route boundary; ``source_value`` renders it for the SQL builder.
    """

    project_id: uuid.UUID
    from_ts: datetime.datetime | None = None
    to_ts: datetime.datetime | None = None
    source: SourceFilter | None = None
    service: str | None = None
    workflow_run_id: str | None = None
    request_id: str | None = None
    collapsed: bool = False
    limit: int = 50
    offset: int = 0

    @property
    def oversample(self) -> int:
        """Rows to pull per DB before cross-DB merge + Python slice."""
        return self.offset + self.limit

    @property
    def source_value(self) -> str | None:
        return self.source.value if self.source else None
