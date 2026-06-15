"""add german_state to project

Revision ID: a3b7c9d1e5f2
Revises: 4e0cf3e7c3b8
Create Date: 2026-04-27 12:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a3b7c9d1e5f2"
down_revision: str | Sequence[str] | None = "4e0cf3e7c3b8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "project",
        sa.Column(
            "state",
            sa.Enum(
                "BY",
                "BW",
                "BE",
                "BB",
                "HB",
                "HH",
                "HE",
                "MV",
                "NI",
                "NW",
                "RP",
                "SL",
                "SN",
                "ST",
                "SH",
                "TH",
                name="germanstate",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=True,
        ),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("project", "state")
