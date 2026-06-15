"""add erwiderungs file types

Revision ID: 7b2c9d1e4f8a
Revises: 84361a3bfccb
Create Date: 2026-05-06 00:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7b2c9d1e4f8a"
down_revision: str | Sequence[str] | None = "84361a3bfccb"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE filetypeenum ADD VALUE IF NOT EXISTS 'ERWIDERUNGS_IMPORT'")
        op.execute("ALTER TYPE filetypeenum ADD VALUE IF NOT EXISTS 'ERWIDERUNGS_EXPORT'")


def downgrade() -> None:
    """Downgrade schema."""
    pass  # Postgres cannot remove enum values
