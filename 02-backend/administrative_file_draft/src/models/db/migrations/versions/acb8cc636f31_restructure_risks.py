"""restructure_risks

Revision ID: acb8cc636f31
Revises: 7013817303f4
Create Date: 2026-03-11 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "acb8cc636f31"
down_revision: str | Sequence[str] | None = "7013817303f4"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema: drop risk_warnings table and create risks table."""
    op.drop_index(op.f("ix_risk_warnings_project_id"), table_name="risk_warnings")
    op.drop_table("risk_warnings")

    op.create_table(
        "risks",
        sa.Column("id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", sa.UUID(as_uuid=True), nullable=False),
        sa.Column("category", sa.Text(), nullable=False),
        sa.Column("problem", sa.Text(), nullable=False),
        sa.Column("recommendation", sa.Text(), nullable=True),
        sa.Column("quote", sa.Text(), nullable=True),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("implication", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.String(length=20),
            nullable=False,
            server_default="OPEN",
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_risks_project_id"),
        "risks",
        ["project_id"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema: drop risks table and recreate risk_warnings table."""
    op.drop_index(op.f("ix_risks_project_id"), table_name="risks")
    op.drop_table("risks")

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
