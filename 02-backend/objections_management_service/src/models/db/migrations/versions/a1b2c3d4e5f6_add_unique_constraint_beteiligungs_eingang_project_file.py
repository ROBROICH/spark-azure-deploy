"""add unique constraint on beteiligungs_eingang (project_id, file_id) for non-deleted rows

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-05-07 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "f6a7b8c9d0e1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_index(
        "uq_beteiligungs_eingang_project_file",
        "beteiligungs_eingang",
        ["project_id", "file_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
        sqlite_where=sa.text("is_deleted IS false"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_beteiligungs_eingang_project_file", table_name="beteiligungs_eingang")
