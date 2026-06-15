"""fix topic history update_type enum drift

Revision ID: 4e0cf3e7c3b8
Revises: 8995b83c318d
Create Date: 2026-04-22 10:30:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4e0cf3e7c3b8"
down_revision: str | Sequence[str] | None = "8995b83c318d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_UPDATE_TYPE_ENUM = sa.Enum("AUTOMATED", "MANUAL", name="updatetype", create_constraint=True)


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column(
        "topic_history",
        "update_type",
        existing_type=sa.VARCHAR(length=9),
        type_=_UPDATE_TYPE_ENUM,
        postgresql_using="update_type::updatetype",
        existing_nullable=True,
    )
    op.alter_column(
        "topic_norm_history",
        "update_type",
        existing_type=sa.VARCHAR(length=9),
        type_=_UPDATE_TYPE_ENUM,
        postgresql_using="update_type::updatetype",
        existing_nullable=True,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column(
        "topic_norm_history",
        "update_type",
        existing_type=_UPDATE_TYPE_ENUM,
        type_=sa.VARCHAR(length=9),
        postgresql_using="update_type::text",
        existing_nullable=True,
    )
    op.alter_column(
        "topic_history",
        "update_type",
        existing_type=_UPDATE_TYPE_ENUM,
        type_=sa.VARCHAR(length=9),
        postgresql_using="update_type::text",
        existing_nullable=True,
    )
