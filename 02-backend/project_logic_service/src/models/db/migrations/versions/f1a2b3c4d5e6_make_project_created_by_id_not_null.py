"""make project created_by_id not null

Revision ID: f1a2b3c4d5e6
Revises: 08c6da42138e
Create Date: 2026-05-20 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "08c6da42138e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UNKNOWN_CREATOR_ID = "00000000-0000-0000-0000-000000000001"


def upgrade() -> None:
    """Upgrade schema."""
    op.execute(f"UPDATE project SET created_by_id = '{UNKNOWN_CREATOR_ID}' WHERE created_by_id IS NULL")
    op.alter_column("project", "created_by_id", existing_type=sa.UUID(), nullable=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column("project", "created_by_id", existing_type=sa.UUID(), nullable=True)
