"""merge parallel objection migration heads

Revision ID: e91a9f6322b0
Revises: 157cf814187c, c8a6f4b7d2e1
Create Date: 2026-04-22 15:05:00.000000

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "e91a9f6322b0"
down_revision: str | Sequence[str] | None = ("157cf814187c", "c8a6f4b7d2e1")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Merge-only revision."""


def downgrade() -> None:
    """Merge-only revision."""
