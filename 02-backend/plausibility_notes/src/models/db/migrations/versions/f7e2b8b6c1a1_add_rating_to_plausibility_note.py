"""add rating to plausibility_note

Revision ID: f7e2b8b6c1a1
Revises: 831cd18f2d19
Create Date: 2026-03-27 22:30:00.000000
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "f7e2b8b6c1a1"
down_revision: str | None = "831cd18f2d19"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("plausibility_note", sa.Column("rating", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("plausibility_note", "rating")
