"""add original_created_at to project

Revision ID: a6f4e3b2c1d0
Revises: 52acd88fd525
Create Date: 2026-05-28 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a6f4e3b2c1d0"
down_revision: str | Sequence[str] | None = "52acd88fd525"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("project", sa.Column("original_created_at", sa.DateTime(timezone=True), nullable=True))
    op.execute("ALTER TABLE project_history ADD COLUMN original_created_at TIMESTAMP WITH TIME ZONE")

    op.execute(
        """
        WITH roots AS (
            SELECT DISTINCT ON (id)
                id,
                COALESCE(created_at, updated_at, CURRENT_TIMESTAMP) AS original_created_at
            FROM project
            ORDER BY
                id,
                CASE WHEN project_version = 1 THEN 0 ELSE 1 END,
                project_version,
                created_at
        )
        UPDATE project AS p
        SET original_created_at = roots.original_created_at
        FROM roots
        WHERE p.id = roots.id
        """
    )
    op.execute(
        """
        UPDATE project
        SET original_created_at = COALESCE(created_at, updated_at, CURRENT_TIMESTAMP)
        WHERE original_created_at IS NULL
        """
    )
    op.alter_column("project", "original_created_at", existing_type=sa.DateTime(timezone=True), nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("project_history", "original_created_at")
    op.drop_column("project", "original_created_at")
