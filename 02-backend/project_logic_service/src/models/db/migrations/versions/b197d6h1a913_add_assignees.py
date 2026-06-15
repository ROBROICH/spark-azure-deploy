"""add assignee arrays to topic

Revision ID: b197d6h1a913
Revises: 4e0cf3e7c3b8
Create Date: 2026-04-24
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "b197d6h1a913"
down_revision: str | Sequence[str] | None = "4e0cf3e7c3b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

UUID_ARRAY = postgresql.ARRAY(sa.dialects.postgresql.UUID(as_uuid=True))


def upgrade():
    op.add_column(
        "topic",
        sa.Column(
            "mvp_assignees",
            UUID_ARRAY,
            nullable=True,
        ),
    )

    op.add_column(
        "topic",
        sa.Column(
            "rpb_assignees",
            UUID_ARRAY,
            nullable=True,
        ),
    )

    op.execute(
        """
        UPDATE topic
        SET mvp_assignees = ARRAY[]::uuid[],
            rpb_assignees = ARRAY[]::uuid[]
        WHERE mvp_assignees IS NULL
           OR rpb_assignees IS NULL;
        """
    )

    op.alter_column(
        "topic",
        "mvp_assignees",
        server_default=sa.text("ARRAY[]::uuid[]"),
        nullable=False,
    )

    op.alter_column(
        "topic",
        "rpb_assignees",
        server_default=sa.text("ARRAY[]::uuid[]"),
        nullable=False,
    )


def downgrade():
    op.drop_column("topic", "mvp_assignees")
    op.drop_column("topic", "rpb_assignees")
