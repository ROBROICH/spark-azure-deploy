"""empty message

Revision ID: 0d7448eab8a2
Revises: 07ef1728b9fc, a3f9c1e82b47
Create Date: 2026-04-21 16:36:57.371334

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "0d7448eab8a2"
down_revision: str | Sequence[str] | None = ("07ef1728b9fc", "a3f9c1e82b47")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
