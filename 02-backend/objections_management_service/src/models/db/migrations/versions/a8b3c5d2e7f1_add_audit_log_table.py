"""add audit_log table

Revision ID: a8b3c5d2e7f1
Revises: f2a4b6c8d0e2
Create Date: 2026-05-26 14:34:59.493068

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a8b3c5d2e7f1"
down_revision: str | Sequence[str] | None = "f2a4b6c8d0e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "audit_log",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column(
            "timestamp",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("entity_type", sa.String(), nullable=False),
        sa.Column("change_type", sa.String(), nullable=False),
        sa.Column("action_type", sa.String(), nullable=True),
        sa.Column("actor_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("triggered_by_user_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("workflow_run_id", sa.String(), nullable=True),
        sa.Column("workflow_type", sa.String(), nullable=True),
        sa.Column("request_start_time", sa.DateTime(timezone=True), nullable=True),
        sa.Column("request_id", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_audit_log_project_timestamp",
        "audit_log",
        ["project_id", sa.text("timestamp DESC")],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_audit_log_project_timestamp", table_name="audit_log")
    op.drop_table("audit_log")
