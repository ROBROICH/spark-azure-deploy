"""add checked_saetze to topic_norm

Revision ID: a1b2c3d4e5f6
Revises: 489b3e0cb577
Create Date: 2026-04-06 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: str | Sequence[str] | None = "489b3e0cb577"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "topic_norm",
        sa.Column(
            "checked_saetze",
            postgresql.ARRAY(sa.UUID()),
            nullable=False,
            server_default=sa.text("ARRAY[]::uuid[]"),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("topic_norm", "checked_saetze")
