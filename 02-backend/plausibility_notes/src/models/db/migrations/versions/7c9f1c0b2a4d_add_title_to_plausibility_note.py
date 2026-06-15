"""add title to plausibility_note

Revision ID: 7c9f1c0b2a4d
Revises: f0a32cf3bbe0
Create Date: 2026-05-13 10:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c9f1c0b2a4d"
down_revision: str | Sequence[str] | None = "67654a1486b6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("plausibility_note", sa.Column("title", sa.String(), nullable=True))
    op.add_column("plausibility_note_history", sa.Column("title", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("plausibility_note_history", "title")
    op.drop_column("plausibility_note", "title")
