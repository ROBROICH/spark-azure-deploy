"""add classification_status to beteiligungs_eingang

Revision ID: b8e2a4d7c019
Revises: a1b2c3d4e5f6
Create Date: 2026-05-08 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b8e2a4d7c019"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


classification_status_enum = sa.Enum(
    "loading",
    "done",
    "failed",
    name="classificationstatus",
)


def upgrade() -> None:
    """Upgrade schema."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        classification_status_enum.create(bind, checkfirst=True)

    # Live table — backfill existing rows to DONE before flipping NOT NULL.
    op.add_column(
        "beteiligungs_eingang",
        sa.Column(
            "classification_status",
            classification_status_enum,
            nullable=False,
            server_default=sa.text("'done'"),
        ),
    )
    op.alter_column(
        "beteiligungs_eingang",
        "classification_status",
        server_default=None,
    )

    # Mirror history table (versioned).
    op.add_column(
        "beteiligungs_eingang_history",
        sa.Column(
            "classification_status",
            classification_status_enum,
            nullable=True,
            server_default=sa.text("'done'"),
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("beteiligungs_eingang_history", "classification_status")
    op.drop_column("beteiligungs_eingang", "classification_status")

    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        classification_status_enum.drop(bind, checkfirst=True)
