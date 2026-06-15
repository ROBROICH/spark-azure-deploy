"""remove sender from beteiligungs_eingang

Revision ID: b2c3d4e5f6a7
Revises: aa60740235be
Create Date: 2026-05-19 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b2c3d4e5f6a7"
down_revision: str | Sequence[str] | None = "aa60740235be"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_column("beteiligungs_eingang_history", "sender")
    op.drop_column("beteiligungs_eingang", "sender")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "beteiligungs_eingang",
        sa.Column("sender", sa.String(), nullable=False, server_default="unknown"),
    )
    op.alter_column("beteiligungs_eingang", "sender", server_default=None)
    op.add_column(
        "beteiligungs_eingang_history",
        sa.Column("sender", sa.String(), nullable=True),
    )
