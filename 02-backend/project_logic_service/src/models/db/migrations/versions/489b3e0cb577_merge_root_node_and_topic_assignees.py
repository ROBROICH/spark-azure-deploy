"""merge_root_node_and_topic_assignees

Revision ID: 489b3e0cb577
Revises: 530ab917243c, c3a9f2b1d7e5
Create Date: 2026-04-03 13:56:41.610246

"""

from collections.abc import Sequence

# revision identifiers, used by Alembic.
revision: str = "489b3e0cb577"
down_revision: str | Sequence[str] | None = ("530ab917243c", "c3a9f2b1d7e5")
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
