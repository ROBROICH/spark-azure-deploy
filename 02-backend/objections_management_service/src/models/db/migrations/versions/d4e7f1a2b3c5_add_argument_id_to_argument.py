"""add argument_id business identifier to argument

Revision ID: d4e7f1a2b3c5
Revises: 922fa108f9ce
Create Date: 2026-05-04 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d4e7f1a2b3c5"
down_revision: str | Sequence[str] | None = "922fa108f9ce"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("argument", sa.Column("argument_id", sa.String(), nullable=True))
    op.add_column("argument_history", sa.Column("argument_id", sa.String(), nullable=True))
    op.create_index(
        "uq_argument_project_id_argument_id",
        "argument",
        ["project_id", "argument_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
        sqlite_where=sa.text("is_deleted IS false"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("uq_argument_project_id_argument_id", table_name="argument")
    op.drop_column("argument_history", "argument_id")
    op.drop_column("argument", "argument_id")
