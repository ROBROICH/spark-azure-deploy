"""merge_risikohinweise_and_temporal_versioning

Revision ID: 05d3e1a5f214
Revises: b7e1c3a4d9f0, 49eb7574839b
Create Date: 2026-05-13 13:48:13.106609

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "05d3e1a5f214"
down_revision: str | Sequence[str] | None = ("b7e1c3a4d9f0", "49eb7574839b")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
