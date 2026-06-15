import uuid
from datetime import datetime

from alembic_utils import VersionedMixin
from node_crud import common_table_args, create_node_base, parent_fk
from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSONB, UUID
from sqlalchemy.orm import mapped_column, relationship
from sqlalchemy.orm.attributes import Mapped

from src.models.db.topic_enum import TopicNormStatus, TopicNormType
from src.models.db.workflow_enum import ProjectVersionLockStatus
from src.models.schemas.project_schemas import GermanState

Base, NodeBase = create_node_base()


class TopicFieldsMixin:
    name: Mapped[str] = mapped_column(String, nullable=False)
    show_in_mvp: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    show_in_ewm: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))
    show_in_beschluss: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    description: Mapped[str | None] = mapped_column(String, nullable=True)


class TopicNormFieldsMixin:
    jurabk: Mapped[str] = mapped_column(String, nullable=False)
    paragraph_nr: Mapped[str] = mapped_column(String, nullable=True)
    satz: Mapped[str] = mapped_column(String, nullable=True)
    absatz: Mapped[str] = mapped_column(String, nullable=True)
    nummer: Mapped[str] = mapped_column(String, nullable=True)


# --- Core Tables ---
class Applicant(NodeBase, VersionedMixin):
    """Applicant (Antragsteller) model."""

    __tablename__ = "applicant"
    __node_crud_exclude__ = True
    __table_args__ = common_table_args(__tablename__)

    # Antragsstellenden Details (all nullable)
    salutation = Column(String, nullable=True)
    company = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    street = Column(String, nullable=True)
    house_number = Column(String, nullable=True)
    address_supplement = Column(String, nullable=True)
    plz = Column(String, nullable=True)
    location = Column(String, nullable=True)
    country = Column(String, nullable=True)
    email = Column(String, nullable=True)
    phone = Column(String, nullable=True)
    fax = Column(String, nullable=True)


class Project(NodeBase, VersionedMixin):
    """Project model."""

    __tablename__ = "project"
    __node_crud_exclude__ = True
    # ``applicant`` is the only node-table parent; the rest (project_type,
    # project_status, process_step) are non-versioned lookup tables and keep
    # their plain single-column FKs.
    __table_args__ = (
        parent_fk("applicant_id", "applicant", ondelete=None),
        Index(
            "project_internal_project_number_key",
            "internal_project_number",
            "project_version",
            unique=True,
        ),
    )

    # Project is the root graph node, so it has no owning project. Keep this nullable
    # only here; every other NodeBase model must keep project_id required.
    # Project node has (id, project_version) as its PK.
    project_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(
        default=False,
        server_default=text("false"),
        nullable=False,
    )
    frontend_parent_ids: Mapped[list[str]] = mapped_column(
        ARRAY(String),
        default=list,
        server_default=text("'{}'"),
        nullable=False,
    )
    imported: Mapped[bool] = mapped_column(default=False, server_default=text("false"), nullable=False)

    # Details
    name = Column(String)
    project_type_id = Column(UUID, ForeignKey("project_type.id"))
    created_by_id = Column(UUID, nullable=False)
    entry_date = Column(Date)
    internal_project_number = Column(String)
    applicant_id = Column(UUID, nullable=True)
    original_created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    state: Mapped[GermanState | None] = mapped_column(
        Enum(GermanState, native_enum=False, create_constraint=True),
        nullable=True,
    )

    # Metadata
    status_id = Column(UUID, ForeignKey("project_status.id"))
    current_process_step_id = Column(UUID, ForeignKey("process_step.id"))

    # Relationships (only to models in this service)
    deadlines = relationship("Deadline", back_populates="project")
    applicant = relationship("Applicant", uselist=False)
    project_type = relationship("ProjectType", foreign_keys=[project_type_id])
    project_status = relationship("ProjectStatus", foreign_keys=[status_id])
    current_process_step = relationship("ProcessStep", foreign_keys=[current_process_step_id])
    topics: Mapped[list["Topic"]] = relationship(
        "Topic",
        back_populates="project",
        cascade="all, delete-orphan",
        passive_deletes=True,
        lazy="noload",
    )


class Deadline(NodeBase, VersionedMixin):
    """Deadline model."""

    __tablename__ = "deadline"
    __table_args__ = (
        parent_fk("project_id", "project", ondelete=None),
        *common_table_args(__tablename__),
    )

    # Overrides NodeBase.project_id to mark the FK shape; the composite FK
    # itself lives in __table_args__.
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True))
    start_at = Column(Date)
    end_at = Column(Date)
    deadline_type = Column(String)
    legal_basis = Column(String, nullable=True)

    project = relationship("Project", back_populates="deadlines")


# --- Process Steps ---
class ProcessStep(Base, VersionedMixin):
    """Process step model."""

    __tablename__ = "process_step"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    process_step_index = Column(Integer)
    project_type_id = Column(UUID, ForeignKey("project_type.id"))
    name = Column(String)

    # Relationships
    project_type = relationship("ProjectType", foreign_keys=[project_type_id])


# --- Types & Lookup Tables ---
class ProjectType(Base, VersionedMixin):
    """Project type lookup table."""

    __tablename__ = "project_type"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), unique=True, nullable=False)


class ProjectStatus(Base, VersionedMixin):
    """Project status lookup table."""

    __tablename__ = "project_status"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String)
    internal_name = Column(String, nullable=False)


class Topic(NodeBase, TopicFieldsMixin, VersionedMixin):
    __tablename__ = "topic"

    __table_args__ = (
        parent_fk("project_id", "project", ondelete="CASCADE"),
        parent_fk("parent_topic_id", "topic", ondelete="CASCADE"),
        *common_table_args(__tablename__),
        Index(
            "uq_topic_project_parent_name_active",
            "project_id",
            "project_version",
            "parent_topic_id",
            "name",
            unique=True,
            postgresql_where=text("is_deleted IS false"),
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    parent_topic_id = Column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    mvp_assignee: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    rpb_assignee: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    mvp_assignees: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)),
        nullable=False,
        default=list,
        server_default=text("ARRAY[]::uuid[]"),
    )
    rpb_assignees: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(UUID(as_uuid=True)),
        nullable=False,
        default=list,
        server_default=text("ARRAY[]::uuid[]"),
    )

    project: Mapped["Project"] = relationship(
        "Project",
        back_populates="topics",
        lazy="noload",
    )

    # --- Tree ---
    parent: Mapped["Topic"] = relationship(
        "Topic",
        remote_side="Topic.id",
        back_populates="children",
        foreign_keys=[parent_topic_id],
    )

    children: Mapped[list["Topic"]] = relationship(
        "Topic",
        back_populates="parent",
        cascade="all, delete-orphan",
        single_parent=True,
        foreign_keys=[parent_topic_id],
    )

    # --- Relationships: TopicNorm ---
    topic_norms: Mapped[list["TopicNorm"]] = relationship(
        "TopicNorm",
        back_populates="topic",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )

    subtopics: Mapped[list["Subtopic"]] = relationship(
        "Subtopic",
        back_populates="topic",
        cascade="all, delete-orphan",
        passive_deletes=True,
    )


class Subtopic(NodeBase, TopicFieldsMixin, VersionedMixin):
    __tablename__ = "subtopic"

    __table_args__ = (
        parent_fk("project_id", "project", ondelete="CASCADE"),
        parent_fk("topic_id", "topic", ondelete="CASCADE"),
        *common_table_args(__tablename__),
        Index(
            "uq_subtopic_topic_name_active",
            "topic_id",
            "project_version",
            "name",
            unique=True,
            postgresql_where=text("is_deleted IS false"),
        ),
    )

    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    topic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    project: Mapped["Project"] = relationship(
        "Project",
        lazy="noload",
    )
    topic: Mapped["Topic"] = relationship(
        "Topic",
        back_populates="subtopics",
        lazy="noload",
    )


class TopicNorm(NodeBase, TopicNormFieldsMixin, VersionedMixin):
    """Association table between Topic and expected Norms."""

    __tablename__ = "topic_norm"

    __table_args__ = (
        parent_fk("topic_id", "topic", ondelete="CASCADE"),
        parent_fk("project_id", "project", ondelete="CASCADE"),
        *common_table_args(__tablename__),
        Index(
            "uq_topic_norm",
            "topic_id",
            "project_version",
            "jurabk",
            "paragraph_nr",
            "satz",
            "absatz",
            "nummer",
            unique=True,
            postgresql_where=text("is_deleted IS false"),
        ),
        CheckConstraint(
            "mvp_status IN ('unchecked', 'checked', 'needs_revision')",
            name="ck_topic_norm_mvp_status",
        ),
    )

    topic_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    type: Mapped[TopicNormType] = mapped_column(
        Enum(TopicNormType, native_enum=False, create_constraint=True),
        nullable=False,
        default=TopicNormType.PRUEFUNG,
        server_default=TopicNormType.PRUEFUNG.name,
    )

    mvp_status: Mapped[TopicNormStatus] = mapped_column(
        String(32),
        default=TopicNormStatus.UNCHECKED.value,
        server_default=TopicNormStatus.UNCHECKED.value,
        nullable=False,
    )

    satz_statuses: Mapped[dict[str, str]] = mapped_column(
        JSONB,
        default=dict,
        server_default=text("'{}'::jsonb"),
        nullable=False,
    )

    topic: Mapped["Topic"] = relationship(
        "Topic",
        back_populates="topic_norms",
        lazy="noload",
    )
    project: Mapped["Project"] = relationship(
        "Project",
        lazy="noload",
    )


class ProjectVersionLock(Base):
    __tablename__ = "project_version_lock"
    __table_args__ = (
        Index(
            "uq_active_project_version_lock",
            "project_id",
            unique=True,
            postgresql_where=text("status = 'ACTIVE'"),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id = Column(UUID(as_uuid=True), nullable=False, index=True)
    source_version = Column(Integer, nullable=False)
    target_version = Column(Integer, nullable=False)
    zip_file_id = Column(UUID(as_uuid=True), nullable=True, index=True)
    lock_token = Column(String, nullable=False, unique=True)
    status = Column(
        Enum(ProjectVersionLockStatus, native_enum=False, create_constraint=True),
        nullable=False,
        default=ProjectVersionLockStatus.ACTIVE,
        server_default=ProjectVersionLockStatus.ACTIVE.value,
    )
    error = Column(String, nullable=True)
