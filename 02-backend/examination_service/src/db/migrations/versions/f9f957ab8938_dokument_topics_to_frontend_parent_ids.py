"""dokument topics to frontend_parent_ids

Revision ID: f9f957ab8938
Revises: f1a2b3c4d5e6
Create Date: 2026-04-06 18:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f9f957ab8938"
down_revision: str | Sequence[str] | None = "f1a2b3c4d5e6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Move dokument.topic_id into frontend_parent_ids, drop topic columns."""
    op.execute("""
        UPDATE dokument
        SET frontend_parent_ids = frontend_parent_ids || ARRAY[('topic:' || topic_id::varchar)]::varchar[]
        WHERE topic_id IS NOT NULL
          AND NOT (frontend_parent_ids @> ARRAY[('topic:' || topic_id::varchar)]::varchar[])
    """)
    op.drop_index(op.f("ix_dokument_topic_id"), table_name="dokument")
    op.drop_column("dokument", "topic_id")
    op.drop_column("dokument", "topic_name")


def downgrade() -> None:
    """Re-add scalar topic columns (topic_name data is lost)."""
    op.add_column("dokument", sa.Column("topic_name", sa.String(), nullable=True))
    op.add_column("dokument", sa.Column("topic_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_dokument_topic_id"), "dokument", ["topic_id"], unique=False)
