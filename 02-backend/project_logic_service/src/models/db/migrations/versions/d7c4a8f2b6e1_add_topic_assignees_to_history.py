"""add topic assignee arrays to history

Revision ID: d7c4a8f2b6e1
Revises: a6f4e3b2c1d0
Create Date: 2026-06-09
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "d7c4a8f2b6e1"
down_revision: str | Sequence[str] | None = "a6f4e3b2c1d0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID_ARRAY = postgresql.ARRAY(sa.dialects.postgresql.UUID(as_uuid=True))


def upgrade() -> None:
    """Add assignee arrays to topic history snapshots."""
    op.add_column(
        "topic_history",
        sa.Column(
            "mvp_assignees",
            UUID_ARRAY,
            nullable=True,
        ),
    )
    op.add_column(
        "topic_history",
        sa.Column(
            "rpb_assignees",
            UUID_ARRAY,
            nullable=True,
        ),
    )

    op.execute(
        """
        UPDATE topic_history
        SET mvp_assignees = ARRAY[]::uuid[],
            rpb_assignees = ARRAY[]::uuid[]
        WHERE mvp_assignees IS NULL
           OR rpb_assignees IS NULL;
        """
    )

    op.alter_column(
        "topic_history",
        "mvp_assignees",
        server_default=sa.text("ARRAY[]::uuid[]"),
        nullable=False,
    )
    op.alter_column(
        "topic_history",
        "rpb_assignees",
        server_default=sa.text("ARRAY[]::uuid[]"),
        nullable=False,
    )


def downgrade() -> None:
    """Remove assignee arrays from topic history snapshots."""
    op.drop_column("topic_history", "rpb_assignees")
    op.drop_column("topic_history", "mvp_assignees")
