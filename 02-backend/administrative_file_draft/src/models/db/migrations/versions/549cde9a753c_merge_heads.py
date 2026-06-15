"""merge heads

Revision ID: 549cde9a753c
Revises: 4ce408ee0e40, 9be36c71d099
Create Date: 2026-04-21 18:03:30.712994

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "549cde9a753c"
down_revision: str | Sequence[str] | None = ("4ce408ee0e40", "9be36c71d099")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
