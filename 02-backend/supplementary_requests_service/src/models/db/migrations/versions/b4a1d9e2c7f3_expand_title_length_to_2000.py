"""Expand supplementary request title length to 2000.

Revision ID: b4a1d9e2c7f3
Revises: a1b2c3d4e5f6
Create Date: 2026-03-26 10:00:00.000000

"""

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "b4a1d9e2c7f3"
down_revision = "a1b2c3d4e5f6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("supplementary_request", "title", type_=sa.String(2000))


def downgrade() -> None:
    op.alter_column("supplementary_request", "title", type_=sa.String(255))
