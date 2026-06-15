"""add chunk page index fields

Revision ID: 6a2d7f4c8b91
Revises: 45eb6bce2319
Create Date: 2026-04-09 15:30:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6a2d7f4c8b91"
down_revision: str | Sequence[str] | None = "45eb6bce2319"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Add persisted page-index metadata to chunk nodes. Idempotent."""
    op.execute("ALTER TABLE chunk ADD COLUMN IF NOT EXISTS page_index_node_id VARCHAR")
    op.execute("ALTER TABLE chunk ADD COLUMN IF NOT EXISTS page_index_position INTEGER")
    op.execute("ALTER TABLE chunk ADD COLUMN IF NOT EXISTS page_index_summary TEXT")


def downgrade() -> None:
    """Remove persisted page-index metadata from chunk nodes. Idempotent."""
    op.execute("ALTER TABLE chunk DROP COLUMN IF EXISTS page_index_summary")
    op.execute("ALTER TABLE chunk DROP COLUMN IF EXISTS page_index_position")
    op.execute("ALTER TABLE chunk DROP COLUMN IF EXISTS page_index_node_id")
