"""merge heads

Revision ID: c057fb018295
Revises: 98389c149648, cad850526308
Create Date: 2026-04-15 08:53:47.338415

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "c057fb018295"
down_revision: str | Sequence[str] | None = ("98389c149648", "cad850526308")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
