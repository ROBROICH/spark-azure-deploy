"""remove objection_id business identifier

Revision ID: b1d2c3e4f5a6
Revises: 0d7448eab8a2
Create Date: 2026-04-21 17:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "b1d2c3e4f5a6"
down_revision: str | Sequence[str] | None = "0d7448eab8a2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.drop_index("uq_objection_project_id_objection_id", table_name="objection")
    op.drop_column("objection", "objection_id")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column("objection", sa.Column("objection_id", sa.String(), nullable=True))
    op.execute("UPDATE objection SET objection_id = id::text WHERE objection_id IS NULL")
    op.alter_column("objection", "objection_id", nullable=False)
    op.create_index(
        "uq_objection_project_id_objection_id",
        "objection",
        ["project_id", "objection_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )
