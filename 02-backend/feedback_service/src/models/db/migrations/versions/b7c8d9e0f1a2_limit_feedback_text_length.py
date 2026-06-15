"""limit feedback text length

Revision ID: b7c8d9e0f1a2
Revises: a1b2c3d4e5f6
Create Date: 2026-05-11 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "b7c8d9e0f1a2"
down_revision: str | Sequence[str] | None = "a1b2c3d4e5f6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "feedback",
        "text",
        existing_type=sa.Text(),
        type_=sa.String(length=5000),
        existing_nullable=True,
    )
    op.alter_column(
        "feedback_history",
        "text",
        existing_type=sa.Text(),
        type_=sa.String(length=5000),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "feedback_history",
        "text",
        existing_type=sa.String(length=5000),
        type_=sa.Text(),
        existing_nullable=True,
    )
    op.alter_column(
        "feedback",
        "text",
        existing_type=sa.String(length=5000),
        type_=sa.Text(),
        existing_nullable=True,
    )
