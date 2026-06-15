"""empty message

Revision ID: 9ab5c95f23fc
Revises: a3b7c9d1e5f2, b197d6h1a913
Create Date: 2026-04-27 16:32:20.688740

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "9ab5c95f23fc"
down_revision: str | Sequence[str] | None = ("a3b7c9d1e5f2", "b197d6h1a913")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
