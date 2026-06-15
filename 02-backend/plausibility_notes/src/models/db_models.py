"""SQLAlchemy database models for Plausibility Notes Service."""

from __future__ import annotations

import uuid
from typing import ClassVar

from alembic_utils import VersionedMixin
from node_crud import common_table_args, create_node_base, parent_fk
from sqlalchemy import Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

Base, NodeBase = create_node_base()


class PlausibilityNote(NodeBase, VersionedMixin):
    """Domain model storing plausibility notes (contradictions) per project."""

    __tablename__ = "plausibility_note"
    __table_args__ = common_table_args("plausibility_note")

    title: Mapped[str | None] = mapped_column(String, nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(String, nullable=False, default="OPEN")

    occurrences: Mapped[list[PlausibilityNoteOccurrence]] = relationship(
        "PlausibilityNoteOccurrence",
        back_populates="plausibility_note",
        cascade="all, delete-orphan",
    )


class PlausibilityNoteOccurrence(NodeBase, VersionedMixin):
    """Occurrences of a plausibility note (contradiction) in documents."""

    __tablename__ = "plausibility_note_occurrence"
    __external_parent_cols__: ClassVar[dict[str, tuple[str, str]]] = {  # pyrefly: ignore[bad-override]
        "document_id": ("document_management_service", "file")
    }
    __table_args__ = (
        parent_fk("plausibility_note_id", "plausibility_note", ondelete="CASCADE"),
        *common_table_args("plausibility_note_occurrence"),
    )

    # Kepping it nullable for backwards compatibility, but in practice every occurrence should be linked to a project
    project_id: Mapped[uuid.UUID] = mapped_column(  # pyrefly: ignore[missing-override-decorator]
        PG_UUID(as_uuid=True), nullable=True
    )
    plausibility_note_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    document_id: Mapped[str] = mapped_column(String, nullable=False)
    document_name: Mapped[str | None] = mapped_column(String, nullable=True)
    content_excerpt: Mapped[str] = mapped_column(Text, nullable=False)
    page_number: Mapped[int | None] = mapped_column(Integer, nullable=True)

    plausibility_note: Mapped[PlausibilityNote] = relationship("PlausibilityNote", back_populates="occurrences")
