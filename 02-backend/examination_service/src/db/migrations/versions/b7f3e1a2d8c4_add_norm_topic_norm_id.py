"""add norm topic_norm_id

Revision ID: b7f3e1a2d8c4
Revises: a4d2a9c7e6f1
Create Date: 2026-04-02 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b7f3e1a2d8c4"
down_revision: str | Sequence[str] | None = "a4d2a9c7e6f1"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Truncate norm (and its children via CASCADE) so we can add a NOT NULL column.
    # Only test data exists at this point.
    op.execute("TRUNCATE TABLE gesetz CASCADE")
    op.add_column("norm", sa.Column("topic_norm_id", sa.UUID(), nullable=False))
    op.create_index(op.f("ix_norm_topic_norm_id"), "norm", ["topic_norm_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_norm_topic_norm_id"), table_name="norm")
    op.drop_column("norm", "topic_norm_id")
