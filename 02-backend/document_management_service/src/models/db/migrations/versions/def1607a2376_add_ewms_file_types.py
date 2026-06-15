"""add ewms file types

Revision ID: def1607a2376
Revises: 277603a4b4b9
Create Date: 2026-04-28 15:45:11.583243

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "def1607a2376"
down_revision: str | Sequence[str] | None = "277603a4b4b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE filetypeenum ADD VALUE IF NOT EXISTS 'EWMS_ZIP'")
        op.execute("ALTER TYPE filetypeenum ADD VALUE IF NOT EXISTS 'EWMS_DOCUMENT'")


def downgrade() -> None:
    """Downgrade schema."""
    pass  # Postgres cannot remove enum values
