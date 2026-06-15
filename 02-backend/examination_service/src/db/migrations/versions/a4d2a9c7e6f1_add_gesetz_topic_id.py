"""add gesetz topic_id

Revision ID: a4d2a9c7e6f1
Revises: bd04c4eab0c2
Create Date: 2026-04-02 13:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a4d2a9c7e6f1"
down_revision: str | Sequence[str] | None = "bd04c4eab0c2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("gesetz", sa.Column("topic_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_gesetz_topic_id"), "gesetz", ["topic_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_gesetz_topic_id"), table_name="gesetz")
    op.drop_column("gesetz", "topic_id")
