"""add vae node subtopic parent

Revision ID: 6a1f4d8c2b9e
Revises: 05d3e1a5f214
Create Date: 2026-05-15 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "6a1f4d8c2b9e"
down_revision: str | Sequence[str] | None = "05d3e1a5f214"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column("vae_node", sa.Column("subtopic_id", sa.UUID(), nullable=True))
    op.add_column("vae_node_history", sa.Column("subtopic_id", sa.UUID(), nullable=True))
    op.create_index(op.f("ix_vae_node_subtopic_id"), "vae_node", ["subtopic_id"], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_vae_node_subtopic_id"), table_name="vae_node")
    op.drop_column("vae_node_history", "subtopic_id")
    op.drop_column("vae_node", "subtopic_id")
