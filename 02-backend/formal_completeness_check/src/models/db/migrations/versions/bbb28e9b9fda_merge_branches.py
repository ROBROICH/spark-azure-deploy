"""merge branches

Revision ID: bbb28e9b9fda
Revises: 5a6d492f96aa, f1a2b3c4d5e6, f6a7b8c9d0e1
Create Date: 2026-02-26 13:51:33.831611

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "bbb28e9b9fda"
down_revision: str | Sequence[str] | None = ("5a6d492f96aa", "f1a2b3c4d5e6", "f6a7b8c9d0e1")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
