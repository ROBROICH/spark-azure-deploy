"""add audit_log table

Revision ID: 282282d14a7b
Revises: 872362d59af9
Create Date: 2026-05-12 11:21:28.360882

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "282282d14a7b"
down_revision: str | Sequence[str] | None = "872362d59af9"
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
