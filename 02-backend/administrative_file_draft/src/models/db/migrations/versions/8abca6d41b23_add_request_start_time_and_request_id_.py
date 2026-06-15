"""add request_start_time and request_id to audit_log

Revision ID: 8abca6d41b23
Revises: 111a4b8999bf
Create Date: 2026-05-19 17:05:51.408556

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "8abca6d41b23"
down_revision: str | Sequence[str] | None = "111a4b8999bf"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "audit_log",
        sa.Column("request_start_time", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "audit_log",
        sa.Column("request_id", sa.String(), nullable=True),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("audit_log", "request_id")
    op.drop_column("audit_log", "request_start_time")
