"""initial_migration

Revision ID: 7013817303f4
Revises:
Create Date: 2025-11-20 12:35:22.413987

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7013817303f4"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "risk_warnings",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("element_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("recommendation", sa.Text(), nullable=True),
        sa.Column("risk_level", sa.String(length=50), nullable=True),
        sa.Column("risk_type", sa.String(length=50), nullable=True),
        sa.Column("is_ignored", sa.Boolean(), nullable=False),
        sa.Column("is_corrected", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_risk_warnings_project_id"),
        "risk_warnings",
        ["project_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_risk_warnings_project_id"), table_name="risk_warnings")
    op.drop_table("risk_warnings")
