"""SQLAlchemy database models for temporal_job_service."""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Enum as SQLEnum
from sqlalchemy import Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column
from sqlalchemy.sql import text
from sqlalchemy.types import DateTime, Integer, String


class Base(DeclarativeBase, AsyncAttrs):
    """SQLAlchemy declarative base."""

    __abstract__ = True


class WorkflowStatus(str, enum.Enum):
    """Mirror of Temporal's WorkflowExecutionStatus relevant to top-level workflows."""

    PENDING = "pending"
    RUNNING = "running"
    FAILED = "failed"
    COMPLETED = "completed"
    TERMINATED = "terminated"
    CANCELLED = "cancelled"
    TIMED_OUT = "timed_out"


def _utcnow() -> datetime:
    return datetime.now(UTC)


class WorkflowExecution(Base):
    """One row per (workflow_id, run_id) for top-level workflows."""

    __tablename__ = "workflow_execution"

    id: Mapped[uuid.UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    workflow_id: Mapped[str] = mapped_column(String, nullable=False)
    run_id: Mapped[str] = mapped_column(String, nullable=False)
    workflow_type: Mapped[str] = mapped_column(String, nullable=False)
    project_id: Mapped[uuid.UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    project_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[WorkflowStatus] = mapped_column(
        SQLEnum(
            WorkflowStatus,
            name="workflow_status",
            native_enum=True,
            # Use the enum *values* (lowercase) as the Postgres enum labels,
            # matching the Alembic migration which creates them as lowercase strings.
            values_callable=lambda x: [e.value for e in x],
        ),
        nullable=False,
    )
    start_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    end_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    failure_message: Mapped[str | None] = mapped_column(String, nullable=True)
    history_s3_key: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    __table_args__ = (
        UniqueConstraint("workflow_id", "run_id", name="uq_workflow_execution_wf_run"),
        Index(
            "ix_workflow_execution_active",
            "status",
            postgresql_where=text("status IN ('pending'::workflow_status, 'running'::workflow_status)"),
        ),
        Index(
            "ix_workflow_execution_project_type",
            "project_id",
            "workflow_type",
        ),
        Index("ix_workflow_execution_end_time", "end_time"),
    )
