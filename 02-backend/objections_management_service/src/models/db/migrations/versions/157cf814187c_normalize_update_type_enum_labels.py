"""normalize update_type enum labels

Revision ID: 157cf814187c
Revises: a3f9c1e82b47
Create Date: 2026-04-21 16:24:56.656004

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "157cf814187c"
down_revision: str | Sequence[str] | None = ["b1d2c3e4f5a6"]
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.execute("ALTER TYPE updatetype RENAME VALUE 'automated' TO 'AUTOMATED'")
    op.execute("ALTER TYPE updatetype RENAME VALUE 'manual' TO 'MANUAL'")
    op.execute("ALTER TABLE objection ALTER COLUMN update_type SET DEFAULT 'AUTOMATED'")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("ALTER TYPE updatetype RENAME VALUE 'AUTOMATED' TO 'automated'")
    op.execute("ALTER TYPE updatetype RENAME VALUE 'MANUAL' TO 'manual'")
    op.execute("ALTER TABLE objection ALTER COLUMN update_type SET DEFAULT 'automated'")
