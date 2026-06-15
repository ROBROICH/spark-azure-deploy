"""merge markers and unique constraint heads

Revision ID: 4f5f0d1881f3
Revises: af0274e0a63c, b00b0ceca09f
Create Date: 2026-04-16 11:10:00.000000

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "4f5f0d1881f3"
down_revision: str | Sequence[str] | None = ("af0274e0a63c", "b00b0ceca09f")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""


def downgrade() -> None:
    """Downgrade schema."""
