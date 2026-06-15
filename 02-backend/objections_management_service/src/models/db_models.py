"""SQLAlchemy database models for Objection Management Service."""

from __future__ import annotations

import uuid
from typing import ClassVar

from alembic_utils import VersionedMixin
from node_crud import common_table_args, create_node_base, parent_fk
from sqlalchemy import Boolean, Enum, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.models.schemas.objection_schemas import (
    ArgumentStatus,
    BeteiligungTyp,
    ClassificationStatus,
    ExtractionStatus,
)

Base, NodeBase = create_node_base()


class BeteiligungsEingang(NodeBase, VersionedMixin):
    """Beteiligungseingang."""

    __tablename__ = "beteiligungs_eingang"
    __external_parent_cols__: ClassVar[dict[str, tuple[str, str]]] = {
        "file_id": ("document_management_service", "file"),
    }
    __table_args__ = (
        # Partial unique index — only enforced on Postgres. Tests create the
        # table via ``Base.metadata.create_all`` against SQLite and seed
        # multiple rows with the same (project_id, file_id) on purpose, so we
        # do not declare ``sqlite_where`` here.
        Index(
            "uq_beteiligungs_eingang_project_file",
            "project_id",
            "project_version",
            "file_id",
            unique=True,
            postgresql_where=text("is_deleted IS false"),
        ),
    )

    beteiligung_typ: Mapped[BeteiligungTyp | None] = mapped_column(
        Enum(BeteiligungTyp, name="beteiligungtyp"),
        nullable=True,
    )

    file_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    filename: Mapped[str | None] = mapped_column(String, nullable=True)
    beteiligungs_eingang_markdown_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    extraction_status: Mapped[ExtractionStatus] = mapped_column(
        Enum(ExtractionStatus, name="extractionstatus"),
        nullable=False,
    )
    classification_status: Mapped[ClassificationStatus] = mapped_column(
        Enum(
            ClassificationStatus,
            name="classificationstatus",
            values_callable=lambda enum_cls: [status.value for status in enum_cls],
        ),
        nullable=False,
        default=ClassificationStatus.LOADING,
    )

    arguments: Mapped[list[Argument]] = relationship(back_populates="beteiligungs_eingang")
    markdown: Mapped[BeteiligungsEingangMarkdown | None] = relationship(
        back_populates="beteiligungs_eingang",
        uselist=False,
        foreign_keys="BeteiligungsEingangMarkdown.beteiligungs_eingang_id",
    )


class BeteiligungsEingangMarkdown(NodeBase, VersionedMixin):
    """Extracted markdown text for a Beteiligungseingang."""

    __tablename__ = "beteiligungs_eingang_markdown"
    __table_args__ = (
        parent_fk("beteiligungs_eingang_id", "beteiligungs_eingang", ondelete="CASCADE"),
        *common_table_args("beteiligungs_eingang_markdown"),
        Index(
            "uq_beteiligungs_eingang_markdown_parent",
            "project_id",
            "project_version",
            "beteiligungs_eingang_id",
            unique=True,
            postgresql_where=text("is_deleted IS false"),
            sqlite_where=text("is_deleted IS false"),
        ),
    )

    beteiligungs_eingang_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)

    beteiligungs_eingang: Mapped[BeteiligungsEingang] = relationship(
        back_populates="markdown",
        foreign_keys=[beteiligungs_eingang_id],
    )


class Argument(NodeBase, VersionedMixin):
    __tablename__ = "argument"
    __external_parent_cols__: ClassVar[dict[str, tuple[str, str]]] = {
        "topic_id": ("project_logic_service", "topic"),
        "sub_topic_id": ("project_logic_service", "subtopic"),
    }
    __table_args__ = (
        parent_fk("beteiligungs_eingang_id", "beteiligungs_eingang", ondelete="CASCADE"),
        *common_table_args("argument"),
        Index(
            "uq_argument_project_id_argument_id",
            "project_id",
            "project_version",
            "argument_id",
            unique=True,
            postgresql_where=text("is_deleted IS false"),
            sqlite_where=text("is_deleted IS false"),
        ),
    )

    beteiligungs_eingang_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    sub_topic_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    topic_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    status: Mapped[ArgumentStatus] = mapped_column(
        Enum(
            ArgumentStatus,
            name="argumentstatus",
            values_callable=lambda enum_cls: [status.value for status in enum_cls],
        ),
        nullable=False,
        default=ArgumentStatus.OPEN,
    )

    beteiligungs_eingang: Mapped[BeteiligungsEingang] = relationship(back_populates="arguments")
    text: Mapped[str | None] = mapped_column(Text, nullable=True)
    start_idx: Mapped[int | None] = mapped_column(Integer, nullable=True)
    end_idx: Mapped[int | None] = mapped_column(Integer, nullable=True)
    erwiderung: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    einordnung: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    context: Mapped[str | None] = mapped_column(Text, nullable=True, default=None)
    context_start_idx: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    context_end_idx: Mapped[int | None] = mapped_column(Integer, nullable=True, default=None)
    argument_id: Mapped[str | None] = mapped_column(String, nullable=True, default=None)
    in_vae: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_valid_argument: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
