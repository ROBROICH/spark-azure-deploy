"""merge administrative file draft migration heads

Revision ID: 111a4b8999bf
Revises: 3b30ca0e4033
Create Date: 2026-05-15 20:43:05.474383

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "111a4b8999bf"
down_revision: str | Sequence[str] | None = "3b30ca0e4033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
