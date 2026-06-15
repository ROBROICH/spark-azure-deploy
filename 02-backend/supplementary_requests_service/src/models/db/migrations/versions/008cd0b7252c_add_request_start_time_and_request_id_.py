"""add request_start_time and request_id to audit_log

Revision ID: 008cd0b7252c
Revises: bbdf24015762
Create Date: 2026-05-19 17:06:00.770904

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "008cd0b7252c"
down_revision = "bbdf24015762"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "audit_log",
        sa.Column("request_start_time", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "audit_log",
        sa.Column("request_id", sa.String(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("audit_log", "request_id")
    op.drop_column("audit_log", "request_start_time")
