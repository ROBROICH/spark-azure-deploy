import uuid
from datetime import datetime
from typing import Any

from alembic_utils import VersionedMixin
from sqlalchemy import JSON, DateTime, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.models.db.prufung_models import Base


# Temporary standalone table for storing norm deconstructions.
class NormDeconstruction(Base, VersionedMixin):
    """Temporary standalone table for storing norm deconstructions."""

    __tablename__ = "norm_deconstruction"

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    jurabk: Mapped[str] = mapped_column(String, nullable=False)
    paragraph: Mapped[str] = mapped_column(String, nullable=False)
    deconstruction: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    __table_args__ = (UniqueConstraint("jurabk", "paragraph", name="uq_norm_deconstruction_jurabk_paragraph"),)
