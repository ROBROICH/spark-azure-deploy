"""add legaldefinitionen table

Revision ID: 1c62b9d4a5e7
Revises: c1e2ec6eabbe
Create Date: 2026-04-23 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "1c62b9d4a5e7"
down_revision: Union[str, Sequence[str], None] = "c1e2ec6eabbe"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_table(
        "legaldefinitionen",
        sa.Column("id", sa.Integer(), sa.Identity(), nullable=False),
        sa.Column("jurabk", sa.Text(), nullable=False),
        sa.Column("paragraph_nr", sa.Text(), nullable=False),
        sa.Column("titel", sa.Text(), nullable=False),
        sa.Column("begriff", sa.Text(), nullable=False),
        sa.Column("definition", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("jurabk", "begriff", name="uq_legaldefinitionen_jurabk_begriff"),
    )
    op.create_index(
        "ix_legaldefinitionen_jurabk",
        "legaldefinitionen",
        ["jurabk"],
        unique=False,
    )
    op.create_index(
        "ix_legaldefinitionen_jurabk_titel",
        "legaldefinitionen",
        ["jurabk", "titel"],
        unique=False,
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_legaldefinitionen_jurabk_titel", table_name="legaldefinitionen")
    op.drop_index("ix_legaldefinitionen_jurabk", table_name="legaldefinitionen")
    op.drop_table("legaldefinitionen")
