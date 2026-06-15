"""merge heads and drop norm topic_norm_id

Revision ID: d3a1f7e9b2c5
Revises: 1f5eb66ffca0, b7f3e1a2d8c4
Create Date: 2026-04-04 08:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d3a1f7e9b2c5"
down_revision: str | Sequence[str] | None = ("1f5eb66ffca0", "b7f3e1a2d8c4")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_index(op.f("ix_norm_topic_norm_id"), table_name="norm")
    op.drop_column("norm", "topic_norm_id")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column("norm", sa.Column("topic_norm_id", sa.UUID(), nullable=False))
    op.create_index(op.f("ix_norm_topic_norm_id"), "norm", ["topic_norm_id"], unique=False)
