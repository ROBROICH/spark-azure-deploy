"""add file topic subtopic owner

Revision ID: 6f2c8d9a1b3e
Revises: 282282d14a7b
Create Date: 2026-05-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6f2c8d9a1b3e"
down_revision: str | Sequence[str] | None = "282282d14a7b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("file_topic", sa.Column("subtopic_id", sa.UUID(), nullable=True))
    op.add_column("file_topic_history", sa.Column("subtopic_id", sa.UUID(), nullable=True))
    op.alter_column("file_topic", "topic_id", existing_type=sa.UUID(), nullable=True)
    op.alter_column("file_topic_history", "topic_id", existing_type=sa.UUID(), nullable=True)
    op.create_index(op.f("ix_file_topic_subtopic_id"), "file_topic", ["subtopic_id"], unique=False)

    op.drop_index("uq_file_topic", table_name="file_topic")
    op.create_index(
        "uq_file_topic",
        "file_topic",
        ["file_id", "topic_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false AND topic_id IS NOT NULL"),
    )
    op.create_index(
        "uq_file_subtopic",
        "file_topic",
        ["file_id", "subtopic_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false AND subtopic_id IS NOT NULL"),
    )
    op.create_check_constraint(
        "ck_file_topic_exactly_one_owner",
        "file_topic",
        "(topic_id IS NOT NULL AND subtopic_id IS NULL) OR (topic_id IS NULL AND subtopic_id IS NOT NULL)",
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("ck_file_topic_exactly_one_owner", "file_topic", type_="check")
    op.drop_index(
        "uq_file_subtopic",
        table_name="file_topic",
        postgresql_where=sa.text("is_deleted IS false AND subtopic_id IS NOT NULL"),
    )
    op.drop_index(
        "uq_file_topic",
        table_name="file_topic",
        postgresql_where=sa.text("is_deleted IS false AND topic_id IS NOT NULL"),
    )

    op.execute("DELETE FROM file_topic_history WHERE subtopic_id IS NOT NULL")
    op.execute("DELETE FROM file_topic WHERE subtopic_id IS NOT NULL")

    op.alter_column("file_topic_history", "topic_id", existing_type=sa.UUID(), nullable=False)
    op.alter_column("file_topic", "topic_id", existing_type=sa.UUID(), nullable=False)
    op.create_index(
        "uq_file_topic",
        "file_topic",
        ["file_id", "topic_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.drop_index(op.f("ix_file_topic_subtopic_id"), table_name="file_topic")
    op.drop_column("file_topic_history", "subtopic_id")
    op.drop_column("file_topic", "subtopic_id")
