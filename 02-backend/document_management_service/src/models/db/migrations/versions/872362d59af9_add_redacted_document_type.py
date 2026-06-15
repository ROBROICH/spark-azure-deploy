"""add redacted_document file type

Revision ID: 872362d59af9
Revises: 7b2c9d1e4f8a
Create Date: 2026-05-06 10:23:41.528947

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "872362d59af9"
down_revision: str | Sequence[str] | None = "7b2c9d1e4f8a"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE filetypeenum ADD VALUE IF NOT EXISTS 'REDACTED_DOCUMENT'")


def downgrade() -> None:
    """Downgrade schema."""
    pass  # Postgres cannot remove enum values
