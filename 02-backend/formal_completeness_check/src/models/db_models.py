"""SQLAlchemy database models for Formal Completeness Check Service."""

from __future__ import annotations

import uuid
from typing import ClassVar

from alembic_utils import VersionedMixin
from node_crud import common_table_args, create_node_base, parent_fk
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

Base, NodeBase = create_node_base()


class Category(NodeBase, VersionedMixin):
    """Category for grouping document types per project."""

    __tablename__ = "category"
    __table_args__ = common_table_args("category")

    name: Mapped[str] = mapped_column(String, nullable=False)

    document_types: Mapped[list[DocumentType]] = relationship(
        "DocumentType",
        back_populates="category",
        cascade="all, delete-orphan",
        foreign_keys="[DocumentType.category_id, DocumentType.project_version]",
    )


class DocumentType(NodeBase, VersionedMixin):
    """Required document type definitions per project."""

    __tablename__ = "document_type"
    __table_args__ = (
        parent_fk("category_id", "category", ondelete="SET NULL"),
        *common_table_args("document_type"),
        Index(
            "uq_document_type_project_name",
            "project_id",
            "project_version",
            "name",
            unique=True,
            postgresql_where=text("is_deleted IS false"),
            sqlite_where=text("is_deleted IS false"),
        ),
        CheckConstraint("origin IN ('system', 'custom')", name="chk_document_type_origin"),
    )

    category_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    origin: Mapped[str] = mapped_column(String, nullable=False, default="system")

    category: Mapped[Category | None] = relationship(
        "Category",
        back_populates="document_types",
        foreign_keys="[DocumentType.category_id, DocumentType.project_version]",
    )

    assigned_documents: Mapped[list[Document]] = relationship(
        "Document",
        back_populates="document_type",
        cascade="all, delete-orphan",
        foreign_keys="[Document.ai_suggested_required_document_type_id, Document.project_version]",
    )


class Document(NodeBase, VersionedMixin):
    """Table for assigned and unassigned documents."""

    __tablename__ = "document"
    __external_parent_cols__: ClassVar[dict[str, tuple[str, str]]] = {
        "file_id": ("document_management_service", "file"),
        "content_extraction_id": ("document_management_service", "file"),
    }
    __table_args__ = (
        parent_fk(
            "ai_suggested_required_document_type_id",
            "document_type",
            ondelete="CASCADE",
        ),
        parent_fk(
            "human_required_document_type_id",
            "document_type",
            ondelete="SET NULL",
        ),
        *common_table_args("document"),
        Index(
            "uq_document_project_file_id",
            "project_id",
            "project_version",
            "file_id",
            unique=True,
            postgresql_where=text("file_id IS NOT NULL"),
        ),
    )

    file_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    content_extraction_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    ai_suggested_required_document_type_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    document_name: Mapped[str] = mapped_column(String, nullable=False)
    reasoning: Mapped[str | None] = mapped_column(Text, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)

    human_required_document_type_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
    )

    document_type: Mapped[DocumentType | None] = relationship(
        "DocumentType",
        back_populates="assigned_documents",
        foreign_keys="[Document.ai_suggested_required_document_type_id, Document.project_version]",
    )


class TemplateCategory(Base, VersionedMixin):
    """Template category for seeding project-specific categories."""

    __tablename__ = "template_category"
    __table_args__ = (
        Index(
            "uq_template_category_project_type_name",
            "project_type_id",
            "name",
            unique=True,
            postgresql_where=text("deleted IS NOT TRUE"),
            sqlite_where=text("deleted IS NOT TRUE"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String, nullable=False)
    project_type_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    template_document_types: Mapped[list[TemplateDocumentType]] = relationship(
        "TemplateDocumentType",
        back_populates="template_category",
        cascade="all, delete-orphan",
    )


class TemplateDocumentType(Base, VersionedMixin):
    """Template document type for seeding project-specific document types."""

    __tablename__ = "template_document_type"
    __table_args__ = (
        Index(
            "uq_template_document_type_category_name",
            "template_category_id",
            "name",
            unique=True,
            postgresql_where=text("deleted IS NOT TRUE"),
            sqlite_where=text("deleted IS NOT TRUE"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    template_category_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        ForeignKey("template_category.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    expected_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    template_category: Mapped[TemplateCategory] = relationship(
        "TemplateCategory",
        back_populates="template_document_types",
    )


class ProjectTemplateVersion(NodeBase, VersionedMixin):
    """Tracks project to project_type registration for template lookup."""

    __tablename__ = "project_template_version"
    __table_args__ = (
        *common_table_args("project_template_version"),
        Index(
            "uq_project_template_version_project_id",
            "project_id",
            "project_version",
            unique=True,
            postgresql_where=text("is_deleted IS false"),
        ),
    )

    project_type_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class TableOfContentNotes(NodeBase, VersionedMixin):
    """From Agent extracted table of content files"""

    __tablename__ = "table_of_content_notes"
    __table_args__ = common_table_args("table_of_content_notes")

    content: Mapped[str] = mapped_column(Text, nullable=False)
    is_resolved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class TocJobStatus(NodeBase, VersionedMixin):
    """Persists the result status of the TOC matching job per project."""

    __tablename__ = "toc_job_status"
    __table_args__ = (
        *common_table_args("toc_job_status"),
        Index(
            "uq_toc_job_status_project_id",
            "project_id",
            "project_version",
            unique=True,
            postgresql_where=text("is_deleted IS false"),
        ),
    )

    status: Mapped[str] = mapped_column(String, nullable=False)
