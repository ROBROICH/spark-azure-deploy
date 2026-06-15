from __future__ import annotations

import uuid

from alembic_utils import VersionedMixin
from node_crud import common_table_args, create_node_base, parent_fk
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Enum,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql.expression import text
from sqlalchemy.sql.sqltypes import JSON

from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import WorkflowStatusEnum, ZipApprovalStatus, ZipDiffKind

jsonb = JSONB if "postgresql" in str(text("1")) else JSON

Base, NodeBase = create_node_base()


class File(NodeBase, VersionedMixin):
    """Table for storing file metadata with flexible optional metadata."""

    __tablename__ = "file"
    __table_args__ = (
        parent_fk("source_zip_file_id", "zip_file", ondelete=None),
        Index(
            "ix_files_type_project",
            "type",
            "project_id",
        ),
        Index(
            "ix_file_bucket_path",
            "bucket_path",
            "project_version",
            unique=True,
        ),
        UniqueConstraint(
            "project_id",
            "project_version",
            "type",
            "filename",
            "source_zip_file_id",
            name="uq_file_zip_entry_source",
        ),
        *common_table_args(__tablename__),
    )

    type: Mapped[FileTypeEnum] = mapped_column(Enum(FileTypeEnum), nullable=False, index=True)
    filename: Mapped[str] = mapped_column(String, nullable=False, index=True)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    bucket_path: Mapped[str] = mapped_column(String, nullable=False)
    added_in_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # Optional fields
    project_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    workflow_id: Mapped[str | None] = mapped_column(String, nullable=True)
    run_id: Mapped[str | None] = mapped_column(String, nullable=True)
    vector_searchable: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    source_zip_file_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    workflow_status: Mapped[WorkflowStatusEnum | None] = mapped_column(
        Enum(
            WorkflowStatusEnum,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
            name="workflowstatusenum",
            create_type=False,
        ),
        nullable=True,
        default=None,
    )

    source_zip_file: Mapped[ZipFile | None] = relationship(
        "ZipFile",
        back_populates="files",
    )
    topics: Mapped[list[FileTopic]] = relationship(
        "FileTopic",
        back_populates="file",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ZipFile(NodeBase, VersionedMixin):
    """Table for storing zip file metadata."""

    __tablename__ = "zip_file"
    __table_args__ = (
        Index(
            "ix_zip_file_bucket_path",
            "bucket_path",
            "project_version",
            unique=True,
        ),
        *common_table_args(__tablename__),
    )

    filename: Mapped[str] = mapped_column(String, nullable=False, index=True)
    bucket_path: Mapped[str] = mapped_column(String, nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    type: Mapped[FileTypeEnum] = mapped_column(
        Enum(FileTypeEnum),
        nullable=False,
        default=FileTypeEnum.ZIP,
        server_default=FileTypeEnum.ZIP.name,
        index=True,
    )
    workflow_status: Mapped[WorkflowStatusEnum] = mapped_column(
        Enum(
            WorkflowStatusEnum,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
            name="workflowstatusenum",
        ),
        nullable=False,
        default=WorkflowStatusEnum.PENDING,
        server_default=WorkflowStatusEnum.PENDING.value,
        index=True,
    )
    approval_status: Mapped[ZipApprovalStatus | None] = mapped_column(
        Enum(
            ZipApprovalStatus,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
            name="zipapprovalstatus",
        ),
        nullable=True,
        index=True,
    )
    approval_error: Mapped[str | None] = mapped_column(String, nullable=True)
    source_project_version: Mapped[int | None] = mapped_column(Integer, nullable=True)

    files: Mapped[list[File | None]] = relationship(
        "File", back_populates="source_zip_file", cascade="all, delete-orphan"
    )
    diff_entries: Mapped[list[ZipFileDiffEntry]] = relationship(
        "ZipFileDiffEntry",
        back_populates="zip_file",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class ZipFileDiffEntry(Base):
    """Durable ZIP diff and user decision row for approval/version creation."""

    __tablename__ = "zip_file_diff_entry"
    __table_args__ = (
        ForeignKeyConstraint(
            ["zip_file_id", "project_version"], ["zip_file.id", "zip_file.project_version"], ondelete="CASCADE"
        ),
        Index("ix_zip_file_diff_entry_zip_file", "zip_file_id", "project_version"),
        UniqueConstraint("zip_file_id", "project_version", "entry_key", name="uq_zip_file_diff_entry_key"),
    )

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    zip_file_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    project_version: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default=text("1"))
    entry_key: Mapped[str] = mapped_column(String, nullable=False)
    computed_kind: Mapped[ZipDiffKind] = mapped_column(
        Enum(
            ZipDiffKind,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
            name="zipdiffkind",
        ),
        nullable=False,
    )
    decision_kind: Mapped[ZipDiffKind] = mapped_column(
        Enum(
            ZipDiffKind,
            values_callable=lambda enum_cls: [member.value for member in enum_cls],
            name="zipdiffkind",
            create_type=False,
        ),
        nullable=False,
    )
    file_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    old_name: Mapped[str | None] = mapped_column(String, nullable=True)
    new_name: Mapped[str | None] = mapped_column(String, nullable=True)
    bucket_path: Mapped[str | None] = mapped_column(String, nullable=True)
    source_sha: Mapped[str | None] = mapped_column(String, nullable=True)
    target_sha: Mapped[str | None] = mapped_column(String, nullable=True)
    sha: Mapped[str | None] = mapped_column(String, nullable=True)

    zip_file: Mapped[ZipFile] = relationship("ZipFile", back_populates="diff_entries")


class FileTopic(NodeBase, VersionedMixin):
    """Table for storing file to topic assignments."""

    __tablename__ = "file_topic"
    __external_parent_cols__ = {
        "topic_id": ("project_logic_service", "topic"),
        "subtopic_id": ("project_logic_service", "subtopic"),
    }
    __table_args__ = (
        parent_fk("file_id", "file", ondelete="CASCADE"),
        CheckConstraint(
            "(topic_id IS NOT NULL AND subtopic_id IS NULL) OR (topic_id IS NULL AND subtopic_id IS NOT NULL)",
            name="ck_file_topic_exactly_one_owner",
        ),
        Index(
            "uq_file_topic",
            "file_id",
            "project_version",
            "topic_id",
            unique=True,
            postgresql_where=text("is_deleted IS false AND topic_id IS NOT NULL"),
        ),
        Index(
            "uq_file_subtopic",
            "file_id",
            "project_version",
            "subtopic_id",
            unique=True,
            postgresql_where=text("is_deleted IS false AND subtopic_id IS NOT NULL"),
        ),
        *common_table_args(__tablename__),
    )

    project_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True, index=True)

    file_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    subtopic_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    file: Mapped[File] = relationship(
        "File",
        back_populates="topics",
        lazy="noload",
    )
