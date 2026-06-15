"""empty message

Revision ID: 88ccd87ab415
Revises: 0af5d54e8820, 0dc662e7f29c
Create Date: 2026-04-08 15:17:35.393711

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "88ccd87ab415"
down_revision: str | Sequence[str] | None = ("0af5d54e8820", "0dc662e7f29c")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
