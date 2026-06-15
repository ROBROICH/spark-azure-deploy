"""add unique constraint to technische_normen dokument

Revision ID: 1d0a01672834
Revises: 2d7a8e3f1b9c
Create Date: 2026-05-18 10:20:38.442299

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import sqlmodel


# revision identifiers, used by Alembic.
revision: str = '1d0a01672834'
down_revision: Union[str, Sequence[str], None] = '2d7a8e3f1b9c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.create_unique_constraint(
        "uq_technische_normen_dokument",
        "technische_normen",
        ["dokument"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        "uq_technische_normen_dokument",
        "technische_normen",
        type_="unique",
    )
