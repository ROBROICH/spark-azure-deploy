"""project_version_composite_pk

Revision ID: d9e0f1a2b3c4
Revises: c8d9e0f1a2b3
Create Date: 2026-05-14 06:23:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "d9e0f1a2b3c4"
down_revision: str | Sequence[str] | None = "c8d9e0f1a2b3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("feedback", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.drop_index(
        "ix_feedback_project_id_active", table_name="feedback", postgresql_where=sa.text("is_deleted IS false")
    )
    op.create_index(
        "ix_feedback_project_id_active",
        "feedback",
        ["project_id", "project_version"],
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE feedback_history ADD COLUMN project_version INTEGER")
    op.drop_constraint("feedback_pkey", "feedback", type_="primary")
    op.create_primary_key("feedback_pkey", "feedback", ["id", "project_version"])

    op.add_column("feedback", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("ALTER TABLE feedback_history ADD COLUMN is_outdated BOOLEAN")


def downgrade() -> None:
    op.drop_column("feedback", "is_outdated")
    op.drop_constraint("feedback_pkey", "feedback", type_="primary")
    op.create_primary_key("feedback_pkey", "feedback", ["id"])
    op.drop_index(
        "ix_feedback_project_id_active", table_name="feedback", postgresql_where=sa.text("is_deleted IS false")
    )
    op.create_index(
        "ix_feedback_project_id_active",
        "feedback",
        ["project_id"],
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.drop_column("feedback", "project_version")
    op.execute("ALTER TABLE feedback_history DROP COLUMN IF EXISTS project_version")
