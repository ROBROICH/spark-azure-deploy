"""Fix document_type unique constraint to exclude soft-deleted rows.

Replace the plain unique constraint on (project_id, name) with a partial unique
index that only applies to non-deleted rows, so a soft-deleted custom document
type does not block re-creation with the same name.

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-04-17

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "c2d3e4f5a6b7"
down_revision: str = "b1c2d3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # NOTE: At this revision the column is still called ``deleted`` — it is
    # renamed to ``is_deleted`` in a later migration (``499b1e0f451d``).
    # Postgres auto-rewrites the partial-index expression when the column is
    # renamed, so the final database state ends up referencing ``is_deleted``.
    op.drop_constraint("uq_document_type_project_name", "document_type", type_="unique")
    op.create_index(
        "uq_document_type_project_name",
        "document_type",
        ["project_id", "name"],
        unique=True,
        postgresql_where=sa.text("deleted IS false"),
        sqlite_where=sa.text("deleted IS false"),
    )


def downgrade() -> None:
    # Remove soft-deleted rows first to avoid violating the plain unique constraint.
    # Column is named ``deleted`` at this revision (see upgrade note).
    op.execute(sa.text("DELETE FROM document_type WHERE deleted IS TRUE"))
    op.drop_index("uq_document_type_project_name", table_name="document_type")
    op.create_unique_constraint("uq_document_type_project_name", "document_type", ["project_id", "name"])
