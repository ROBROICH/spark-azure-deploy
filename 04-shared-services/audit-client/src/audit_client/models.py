"""SQLAlchemy Core table definition for the ``audit_log`` table.

Defined as a Core ``Table`` (not ORM) so it does not collide with any
service's declarative ``Base``. Services own the migration that creates
the table; this module is the canonical column definition used by the
INSERT helper and by the Protocol Service's reader.
"""

from sqlalchemy import Column, DateTime, Index, MetaData, String, Table, text
from sqlalchemy.dialects.postgresql import UUID

metadata = MetaData()

audit_log_table = Table(
    "audit_log",
    metadata,
    Column("id", UUID(as_uuid=True), primary_key=True),
    Column(
        "timestamp",
        DateTime(timezone=True),
        nullable=False,
        server_default=text("now()"),
    ),
    Column("project_id", UUID(as_uuid=True), nullable=False),
    Column("entity_id", UUID(as_uuid=True), nullable=True),
    Column("entity_type", String, nullable=False),
    Column("change_type", String, nullable=False),
    Column("action_type", String, nullable=True),
    Column("actor_user_id", UUID(as_uuid=True), nullable=True),
    Column("triggered_by_user_id", UUID(as_uuid=True), nullable=True),
    Column("workflow_run_id", String, nullable=True),
    Column("workflow_type", String, nullable=True),
    Column("request_start_time", DateTime(timezone=True), nullable=True),
    Column("request_id", String, nullable=True),
    Index("ix_audit_log_project_timestamp", "project_id", text("timestamp DESC")),
)
