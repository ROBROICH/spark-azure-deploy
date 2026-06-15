"""add technische_normen table

Revision ID: 2d7a8e3f1b9c
Revises: 64316af22a3a
Create Date: 2026-05-08 18:44:03.110620

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "2d7a8e3f1b9c"
down_revision: Union[str, Sequence[str], None] = "64316af22a3a"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "technische_normen",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("dokument", sa.Text(), nullable=False),
        sa.Column("titel_de", sa.Text(), nullable=False),
        sa.Column("titel_en", sa.Text(), nullable=False),
        sa.Column("kurzbeschreibung", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_technische_normen_dokument",
        "technische_normen",
        ["dokument"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_technische_normen_dokument", table_name="technische_normen")
    op.drop_table("technische_normen")
