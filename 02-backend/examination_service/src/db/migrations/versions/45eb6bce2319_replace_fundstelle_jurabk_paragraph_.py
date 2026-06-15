"""replace fundstelle jurabk paragraph with gesetz_id norm_id

Revision ID: 45eb6bce2319
Revises: fbd210a31ca7
Create Date: 2026-04-08 21:42:54.717961

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "45eb6bce2319"
down_revision: str | Sequence[str] | None = "fbd210a31ca7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Truncate fundstelle before altering columns (data will be re-seeded)
    op.execute("TRUNCATE TABLE fundstelle CASCADE")

    op.drop_index(op.f("ix_fundstelle_chunk_id"), table_name="fundstelle")
    op.drop_constraint(op.f("fundstelle_chunk_id_fkey"), "fundstelle", type_="foreignkey")
    op.drop_column("fundstelle", "paragraph")
    op.drop_column("fundstelle", "chunk_id")
    op.drop_column("fundstelle", "jurabk")

    op.add_column("fundstelle", sa.Column("satz_id", sa.UUID(), nullable=False))
    op.add_column("fundstelle", sa.Column("gesetz_id", sa.UUID(), nullable=False))
    op.add_column("fundstelle", sa.Column("norm_id", sa.UUID(), nullable=False))
    op.create_index(op.f("ix_fundstelle_gesetz_id"), "fundstelle", ["gesetz_id"], unique=False)
    op.create_index(op.f("ix_fundstelle_norm_id"), "fundstelle", ["norm_id"], unique=False)
    op.create_index(op.f("ix_fundstelle_satz_id"), "fundstelle", ["satz_id"], unique=False)
    op.create_foreign_key(None, "fundstelle", "norm", ["norm_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "fundstelle", "satz", ["satz_id"], ["id"], ondelete="CASCADE")
    op.create_foreign_key(None, "fundstelle", "gesetz", ["gesetz_id"], ["id"], ondelete="CASCADE")


def downgrade() -> None:
    """Downgrade schema."""
    op.execute("TRUNCATE TABLE fundstelle CASCADE")

    op.drop_index(op.f("ix_fundstelle_satz_id"), table_name="fundstelle")
    op.drop_index(op.f("ix_fundstelle_norm_id"), table_name="fundstelle")
    op.drop_index(op.f("ix_fundstelle_gesetz_id"), table_name="fundstelle")
    op.drop_constraint(None, "fundstelle", type_="foreignkey")  # pyrefly: ignore[bad-argument-type]
    op.drop_constraint(None, "fundstelle", type_="foreignkey")  # pyrefly: ignore[bad-argument-type]
    op.drop_constraint(None, "fundstelle", type_="foreignkey")  # pyrefly: ignore[bad-argument-type]
    op.drop_column("fundstelle", "norm_id")
    op.drop_column("fundstelle", "gesetz_id")
    op.drop_column("fundstelle", "satz_id")

    op.add_column("fundstelle", sa.Column("jurabk", sa.VARCHAR(), autoincrement=False, nullable=False))
    op.add_column("fundstelle", sa.Column("chunk_id", sa.UUID(), autoincrement=False, nullable=False))
    op.add_column("fundstelle", sa.Column("paragraph", sa.VARCHAR(), autoincrement=False, nullable=False))
    op.create_foreign_key(
        op.f("fundstelle_chunk_id_fkey"), "fundstelle", "chunk", ["chunk_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index(op.f("ix_fundstelle_chunk_id"), "fundstelle", ["chunk_id"], unique=False)
