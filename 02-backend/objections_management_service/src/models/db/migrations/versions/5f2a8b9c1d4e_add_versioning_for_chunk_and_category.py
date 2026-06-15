"""add versioning for objection chunk and category

Revision ID: 5f2a8b9c1d4e
Revises: e91a9f6322b0
Create Date: 2026-04-22 16:45:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from alembic_utils.temporal import (
    install_versioning_function,
    setup_versioning_for_table,
    teardown_versioning_for_table,
)

# revision identifiers, used by Alembic.
revision: str = "5f2a8b9c1d4e"
down_revision: str | Sequence[str] | None = "e91a9f6322b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_table(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    if not _has_table(table_name):
        return False
    return column_name in {column["name"] for column in _inspector().get_columns(table_name)}


def upgrade() -> None:
    """Upgrade schema."""
    # Safe to run repeatedly; SQL is CREATE OR REPLACE FUNCTION.
    install_versioning_function(op, version="v1")

    for table_name in ("objection_chunk", "objection_category"):
        if not _has_table(table_name):
            continue
        if _has_column(table_name, "sys_period"):
            continue

        op.add_column(
            table_name,
            sa.Column(
                "sys_period",
                sa.dialects.postgresql.TSTZRANGE(),
                server_default=sa.text("tstzrange(current_timestamp, null)"),
                nullable=False,
            ),
        )
        setup_versioning_for_table(op, table_name)


def downgrade() -> None:
    """Downgrade schema."""
    for table_name in ("objection_chunk", "objection_category"):
        if not _has_table(table_name):
            continue
        if not _has_column(table_name, "sys_period"):
            continue

        teardown_versioning_for_table(op, table_name)
        op.drop_column(table_name, "sys_period")
