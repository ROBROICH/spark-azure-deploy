"""drop gesetz topic_id

Revision ID: b7e8f9a0c1d2
Revises: a4d2a9c7e6f1
Create Date: 2026-04-04 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7e8f9a0c1d2"
down_revision: str | Sequence[str] | None = "a4d2a9c7e6f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_index(op.f("ix_gesetz_topic_id"), table_name="gesetz")
    op.drop_column("gesetz", "topic_id")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column("gesetz", sa.Column("topic_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_gesetz_topic_id"), "gesetz", ["topic_id"], unique=False)
