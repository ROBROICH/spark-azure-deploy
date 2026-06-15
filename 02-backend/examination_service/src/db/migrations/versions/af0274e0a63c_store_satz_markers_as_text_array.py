"""store satz markers as text array

Revision ID: af0274e0a63c
Revises: c3f8a1b7d9e2
Create Date: 2026-04-13 12:06:42.221840

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "af0274e0a63c"
down_revision: str | Sequence[str] | None = "c3f8a1b7d9e2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "satz",
        sa.Column(
            "markers_array",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::text[]"),
        ),
    )
    op.execute(
        """
        UPDATE satz
        SET markers_array = CASE
            WHEN markers IS NULL OR json_typeof(markers) <> 'array' THEN ARRAY[]::text[]
            ELSE ARRAY(SELECT json_array_elements_text(markers))
        END
        """
    )
    op.drop_column("satz", "markers")
    op.alter_column("satz", "markers_array", new_column_name="markers")


def downgrade() -> None:
    """Downgrade schema."""
    op.add_column(
        "satz",
        sa.Column(
            "markers_json",
            postgresql.JSON(astext_type=sa.Text()),
            nullable=True,
        ),
    )
    op.execute("UPDATE satz SET markers_json = to_json(markers)")
    op.drop_column("satz", "markers")
    op.alter_column("satz", "markers_json", new_column_name="markers")
