"""add filename to beteiligungs_eingang

Revision ID: c1d2e3f4a5b6
Revises: b8e2a4d7c019
Create Date: 2026-05-08 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c1d2e3f4a5b6"
down_revision: str | Sequence[str] | None = "b8e2a4d7c019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "beteiligungs_eingang",
        sa.Column("filename", sa.String(), nullable=True),
    )
    op.add_column(
        "beteiligungs_eingang_history",
        sa.Column("filename", sa.String(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("beteiligungs_eingang_history", "filename")
    op.drop_column("beteiligungs_eingang", "filename")
