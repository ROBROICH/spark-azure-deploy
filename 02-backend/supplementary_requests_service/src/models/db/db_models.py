"""SQLAlchemy database models for Supplementary Requests Service."""

import uuid
from datetime import UTC, date, datetime
from enum import Enum
from typing import Any

from alembic_utils import VersionedMixin
from sqlalchemy import Boolean, Column, DateTime, Index, String, text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase

from src.models.db.enums import Priority, ProcessStep, SourceType


def _enum_values(enum_cls: type[Enum]) -> list[str]:
    """Return enum values for SQLAlchemy enum persistence."""
    return [member.value for member in enum_cls]


class Base(DeclarativeBase, AsyncAttrs):
    """SQLAlchemy declarative base."""

    __abstract__ = True

    def to_dict(self) -> dict[str, Any]:
        """Database model to serialized dict."""

        def serialize(value: Any) -> Any:
            if isinstance(value, uuid.UUID | datetime | date | Enum):
                return str(value)
            return value

        return {col.name: serialize(getattr(self, col.name)) for col in self.__table__.columns}


# --- Helper Mixins ---
class TimestampMixin:
    """Timestamp class to automatically create timestamps."""

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


# --- Core Tables ---
class SupplementaryRequest(Base, TimestampMixin, VersionedMixin):
    """Supplementary request model."""

    __tablename__ = "supplementary_request"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    title = Column(String(2000), nullable=False)
    reason = Column(String(2000), nullable=False, default="")
    priority = Column(
        SAEnum(Priority, values_callable=_enum_values),
        nullable=False,
    )
    process_step = Column(
        SAEnum(ProcessStep, values_callable=_enum_values),
        # Legacy metadata: process_step has been removed from the frontend-facing
        # API, but existing persisted values are intentionally kept for history
        # and debugging until the legacy column can be dropped safely.
        nullable=True,
    )
    source_type = Column(
        SAEnum(SourceType, values_callable=_enum_values),
        nullable=True,
    )
    source_item_id = Column(String(255), nullable=True)
    included_in_letter = Column(Boolean, default=False, nullable=False)
    topic_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    document_id = Column(UUID(as_uuid=True), nullable=True, index=True)

    __table_args__ = (
        Index(
            "uq_project_source_binding",
            "project_id",
            "source_type",
            "source_item_id",
            unique=True,
            postgresql_where=text("source_item_id IS NOT NULL"),
        ),
    )
