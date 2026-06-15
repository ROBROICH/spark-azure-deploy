"""drop topic_satz

Revision ID: f1a2b3c4d5e6
Revises: e6b2f4c9a3d7
Create Date: 2026-04-06 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "f1a2b3c4d5e6"
down_revision: str | Sequence[str] | None = "e6b2f4c9a3d7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_index(op.f("ix_topic_satz_topic_norm_id"), table_name="topic_satz")
    op.drop_index(op.f("ix_topic_satz_satz_id"), table_name="topic_satz")
    op.drop_index(
        "ix_topic_satz_project_id_active",
        table_name="topic_satz",
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.drop_index(op.f("ix_topic_satz_project_id"), table_name="topic_satz")
    op.drop_table("topic_satz")


def downgrade() -> None:
    """Downgrade schema."""
    op.create_table(
        "topic_satz",
        sa.Column("satz_id", sa.UUID(), nullable=False),
        sa.Column("topic_norm_id", sa.UUID(), nullable=False),
        sa.Column("rpb_checked", sa.Boolean(), nullable=True),
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            server_default=sa.text("ARRAY[]::varchar[]"),
            nullable=False,
        ),
        sa.Column(
            "update_type",
            postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["satz_id"], ["satz.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_topic_satz_project_id"), "topic_satz", ["project_id"], unique=False)
    op.create_index(
        "ix_topic_satz_project_id_active",
        "topic_satz",
        ["project_id"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_index(op.f("ix_topic_satz_satz_id"), "topic_satz", ["satz_id"], unique=False)
    op.create_index(op.f("ix_topic_satz_topic_norm_id"), "topic_satz", ["topic_norm_id"], unique=False)
