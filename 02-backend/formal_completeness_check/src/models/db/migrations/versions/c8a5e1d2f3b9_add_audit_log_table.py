"""add audit_log table

Revision ID: c8a5e1d2f3b9
Revises: 499b1e0f451d
Create Date: 2026-05-12 09:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c8a5e1d2f3b9"
down_revision: str | Sequence[str] | None = "499b1e0f451d"
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
