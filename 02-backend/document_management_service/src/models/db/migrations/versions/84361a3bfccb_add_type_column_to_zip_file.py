"""add type column to zip_file

Revision ID: 84361a3bfccb
Revises: def1607a2376
Create Date: 2026-04-28 15:53:22.532885

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "84361a3bfccb"
down_revision: str | Sequence[str] | None = "def1607a2376"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "zip_file",
        sa.Column(
            "type",
            sa.Enum(name="filetypeenum"),
            nullable=False,
            server_default="ZIP",
        ),
    )
    op.create_index("ix_zip_file_type", "zip_file", ["type"])


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_zip_file_type", table_name="zip_file")
    op.drop_column("zip_file", "type")
