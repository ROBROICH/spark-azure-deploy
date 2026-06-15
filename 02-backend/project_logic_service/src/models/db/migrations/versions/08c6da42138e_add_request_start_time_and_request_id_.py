"""add request_start_time and request_id to audit_log

Revision ID: 08c6da42138e
Revises: 7c2e0f4a9b1d
Create Date: 2026-05-19 17:05:46.316025

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "08c6da42138e"
down_revision: str | Sequence[str] | None = "7c2e0f4a9b1d"
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
