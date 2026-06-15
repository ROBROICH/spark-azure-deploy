"""merge heads

Revision ID: 18b1e6ba61a0
Revises: 94f63deb0225, b849b80bcb6f
Create Date: 2026-04-21 17:24:13.424259

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "18b1e6ba61a0"
down_revision: str | Sequence[str] | None = ("94f63deb0225", "b849b80bcb6f")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
