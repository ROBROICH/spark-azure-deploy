"""add topic assignees and topic_norm checks

Revision ID: c3a9f2b1d7e5
Revises: 53c5bdb706d9
Create Date: 2026-04-02 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c3a9f2b1d7e5"
down_revision: str | Sequence[str] | None = "53c5bdb706d9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Topic: assignee fields
    op.add_column("topic", sa.Column("mvp_assignee", sa.UUID(), nullable=True))
    op.add_column("topic", sa.Column("rpb_assignee", sa.UUID(), nullable=True))

    # TopicNorm: checked fields
    op.add_column("topic_norm", sa.Column("mvp_checked", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("topic_norm", sa.Column("rpb_checked", sa.Boolean(), nullable=False, server_default=sa.text("false")))


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("topic_norm", "rpb_checked")
    op.drop_column("topic_norm", "mvp_checked")
    op.drop_column("topic", "rpb_assignee")
    op.drop_column("topic", "mvp_assignee")
