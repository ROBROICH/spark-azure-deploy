"""rename mvp_checked to rpb_checked

Revision ID: e6b2f4c9a3d7
Revises: a5aa5cc810b0
Create Date: 2026-04-05 06:00:00.000000

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "e6b2f4c9a3d7"
down_revision: str | Sequence[str] | None = "a5aa5cc810b0"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.alter_column("topic_satz", "mvp_checked", new_column_name="rpb_checked")


def downgrade() -> None:
    """Downgrade schema."""
    op.alter_column("topic_satz", "rpb_checked", new_column_name="mvp_checked")
