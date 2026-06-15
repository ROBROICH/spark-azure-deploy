"""add request_start_time and request_id to audit_log

Revision ID: 4983de5dcecd
Revises: 4d855501963e
Create Date: 2026-05-19 17:05:54.969535

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "4983de5dcecd"
down_revision: str | Sequence[str] | None = "4d855501963e"
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
