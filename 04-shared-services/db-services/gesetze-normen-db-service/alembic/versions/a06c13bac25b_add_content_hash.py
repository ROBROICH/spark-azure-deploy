"""add content hash and history relationships

Revision ID: a06c13bac25b
Revises: 564e82ec428d
Create Date: 2026-04-13 18:08:18.477531

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "a06c13bac25b"
down_revision: str | None = "564e82ec428d"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    # Add content_hash to live documents
    op.add_column("documents", sa.Column("content_hash", sa.String(), nullable=True))

    # Add Foreign Key Constraints to History tables
    op.create_foreign_key(
        "fk_norm_history_doc",
        "norm_history",
        "documents_history",
        ["doknr", "version"],
        ["doknr", "version"],
    )
    op.create_foreign_key(
        "fk_absatz_history_norm",
        "absatz_history",
        "norm_history",
        ["jurabk", "paragraph_nr", "sub_paragraph_nr", "version"],
        ["jurabk", "paragraph_nr", "sub_paragraph_nr", "version"],
    )
    op.create_foreign_key(
        "fk_satz_history_absatz",
        "satz_history",
        "absatz_history",
        ["jurabk", "paragraph_nr", "sub_paragraph_nr", "absatz_nr", "version"],
        ["jurabk", "paragraph_nr", "sub_paragraph_nr", "absatz_nr", "version"],
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint("fk_satz_history_absatz", "satz_history", type_="foreignkey")
    op.drop_constraint("fk_absatz_history_norm", "absatz_history", type_="foreignkey")
    op.drop_constraint("fk_norm_history_doc", "norm_history", type_="foreignkey")
    op.drop_column("documents", "content_hash")
