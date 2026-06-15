"""add topic_id and document_id

Revision ID: d5e8f3a7b1c9
Revises: b4a1d9e2c7f3
Create Date: 2026-04-02 16:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "d5e8f3a7b1c9"
down_revision: str | Sequence[str] | None = "b4a1d9e2c7f3"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Truncate supplementary_request so we can add NOT NULL columns.
    # Only test data exists at this point (39 rows testing, 2 rows production).
    op.execute("TRUNCATE TABLE supplementary_request CASCADE")
    op.add_column("supplementary_request", sa.Column("topic_id", sa.UUID(), nullable=False))
    op.create_index(op.f("ix_supplementary_request_topic_id"), "supplementary_request", ["topic_id"], unique=False)
    op.add_column("supplementary_request", sa.Column("document_id", sa.UUID(), nullable=False))
    op.create_index(
        op.f("ix_supplementary_request_document_id"), "supplementary_request", ["document_id"], unique=False
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f("ix_supplementary_request_document_id"), table_name="supplementary_request")
    op.drop_column("supplementary_request", "document_id")
    op.drop_index(op.f("ix_supplementary_request_topic_id"), table_name="supplementary_request")
    op.drop_column("supplementary_request", "topic_id")
