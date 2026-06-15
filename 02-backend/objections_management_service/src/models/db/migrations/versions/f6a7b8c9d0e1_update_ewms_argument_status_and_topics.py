"""update EWMS argument status and topic fields

Revision ID: f6a7b8c9d0e1
Revises: d4e7f1a2b3c5
Create Date: 2026-05-07 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f6a7b8c9d0e1"
down_revision: str | Sequence[str] | None = "d4e7f1a2b3c5"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


argument_status_enum = sa.Enum(
    "open",
    "subtopic_reviewed",
    "done",
    name="argumentstatus",
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        op.execute("ALTER TYPE extractionstatus ADD VALUE IF NOT EXISTS 'loading'")
        argument_status_enum.create(bind, checkfirst=True)

    op.add_column(
        "argument",
        sa.Column("topic_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "argument_history",
        sa.Column("topic_id", sa.UUID(), nullable=True),
    )
    op.create_index("ix_argument_topic_id", "argument", ["topic_id"])

    op.add_column(
        "argument",
        sa.Column(
            "status",
            argument_status_enum,
            nullable=False,
            server_default=sa.text("'open'"),
        ),
    )
    op.add_column(
        "argument_history",
        sa.Column(
            "status",
            argument_status_enum,
            nullable=True,
            server_default=sa.text("'open'"),
        ),
    )

    op.drop_column("argument_history", "checked")
    op.drop_column("argument", "checked")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "argument",
        sa.Column("checked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
    )
    op.add_column(
        "argument_history",
        sa.Column("checked", sa.Boolean(), nullable=True, server_default=sa.text("false")),
    )

    op.drop_column("argument_history", "status")
    op.drop_column("argument", "status")
    op.drop_index("ix_argument_topic_id", table_name="argument")
    op.drop_column("argument_history", "topic_id")
    op.drop_column("argument", "topic_id")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        argument_status_enum.drop(bind, checkfirst=True)
