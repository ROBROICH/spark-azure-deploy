"""fundstelle changes

Revision ID: a48f13bae7bf
Revises: 6a2d7f4c8b91
Create Date: 2026-04-09 17:10:04.072566

"""

from collections.abc import Sequence

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a48f13bae7bf"
down_revision: str | Sequence[str] | None = "6a2d7f4c8b91"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema. Idempotent: safe to re-run against partially-applied state."""
    op.execute("TRUNCATE TABLE fundstelle CASCADE")
    op.execute("ALTER TABLE fundstelle ADD COLUMN IF NOT EXISTS title TEXT NOT NULL")
    op.execute("ALTER TABLE fundstelle ADD COLUMN IF NOT EXISTS text TEXT NOT NULL")
    op.execute(
        "ALTER TABLE fundstelle ADD COLUMN IF NOT EXISTS page_numbers INTEGER[] NOT NULL DEFAULT ARRAY[]::integer[]"
    )
    op.execute("ALTER TABLE fundstelle ADD COLUMN IF NOT EXISTS chunk_ids UUID[] NOT NULL DEFAULT ARRAY[]::uuid[]")


def downgrade() -> None:
    """Downgrade schema. Idempotent."""
    op.execute("ALTER TABLE fundstelle DROP COLUMN IF EXISTS chunk_ids")
    op.execute("ALTER TABLE fundstelle DROP COLUMN IF EXISTS page_numbers")
    op.execute("ALTER TABLE fundstelle DROP COLUMN IF EXISTS text")
    op.execute("ALTER TABLE fundstelle DROP COLUMN IF EXISTS title")
