"""add cited_svm_id to bewertung_quelle

Revision ID: a1b2c3d4e5f6
Revises: 99c7d41b4c30, de409d5cc8fd
Create Date: 2026-04-25 14:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: tuple[str, ...] = ("99c7d41b4c30", "de409d5cc8fd")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "bewertung_quelle",
        sa.Column("cited_svm_id", sa.String(10), nullable=True),
    )
    # Also add to history table for temporal versioning
    op.add_column(
        "bewertung_quelle_history",
        sa.Column("cited_svm_id", sa.String(10), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bewertung_quelle_history", "cited_svm_id")
    op.drop_column("bewertung_quelle", "cited_svm_id")
