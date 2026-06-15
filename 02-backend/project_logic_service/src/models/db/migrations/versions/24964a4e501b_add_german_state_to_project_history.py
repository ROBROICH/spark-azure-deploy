"""add_german_state_to_project_history

Revision ID: 24964a4e501b
Revises: f1a2b3c4d5e6
Create Date: 2026-05-21 10:36:50.060065

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "24964a4e501b"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TABLE project_history ADD COLUMN state VARCHAR(2)")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TABLE project_history DROP COLUMN state")
