"""merge heads

Revision ID: 2e766fd2037f
Revises: 8f7cdba1f4a8, 8fc86cc31301
Create Date: 2026-04-17 12:17:46.744902

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "2e766fd2037f"
down_revision: str | Sequence[str] | None = ("8f7cdba1f4a8", "8fc86cc31301")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
