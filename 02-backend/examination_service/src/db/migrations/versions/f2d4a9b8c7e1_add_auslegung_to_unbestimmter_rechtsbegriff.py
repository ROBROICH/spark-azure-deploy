"""add auslegung to unbestimmter_rechtsbegriff

Revision ID: f2d4a9b8c7e1
Revises: ea545e3632db
Create Date: 2026-05-19 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f2d4a9b8c7e1"
down_revision: str | Sequence[str] | None = "ea545e3632db"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "unbestimmter_rechtsbegriff",
        sa.Column("auslegung", sa.Text(), server_default="", nullable=False),
        if_not_exists=True,
    )
    op.add_column(
        "unbestimmter_rechtsbegriff_history",
        sa.Column("auslegung", sa.Text(), server_default="", nullable=False),
        if_not_exists=True,
    )
    op.alter_column(
        "unbestimmter_rechtsbegriff",
        "auslegung",
        existing_type=sa.Text(),
        existing_nullable=False,
        server_default=None,
    )
    op.alter_column(
        "unbestimmter_rechtsbegriff_history",
        "auslegung",
        existing_type=sa.Text(),
        existing_nullable=False,
        server_default=None,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("unbestimmter_rechtsbegriff_history", "auslegung")
    op.drop_column("unbestimmter_rechtsbegriff", "auslegung")
