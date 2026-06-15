"""limit feedback reason length

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-05-11 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "c8d9e0f1a2b3"
down_revision: str | Sequence[str] | None = "b7c8d9e0f1a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.alter_column(
        "feedback",
        "reason",
        existing_type=sa.String(),
        type_=sa.String(length=30),
        existing_nullable=True,
    )
    op.alter_column(
        "feedback_history",
        "reason",
        existing_type=sa.String(),
        type_=sa.String(length=30),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "feedback_history",
        "reason",
        existing_type=sa.String(length=30),
        type_=sa.String(),
        existing_nullable=True,
    )
    op.alter_column(
        "feedback",
        "reason",
        existing_type=sa.String(length=30),
        type_=sa.String(),
        existing_nullable=True,
    )
