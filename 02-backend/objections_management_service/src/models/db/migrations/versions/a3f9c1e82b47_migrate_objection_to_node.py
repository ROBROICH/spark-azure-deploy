"""migrate objection table to node-crud base with AI fields

Revision ID: a3f9c1e82b47
Revises: 1090e4f74084
Create Date: 2026-04-20 00:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "a3f9c1e82b47"
down_revision: str | Sequence[str] | None = "1090e4f74084"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _soft_delete_duplicate_objection_ids() -> None:
    """Keep the newest objection row per project objection ID before enforcing uniqueness."""
    op.execute(
        """
        WITH ranked_duplicates AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY project_id, objection_id
                    ORDER BY updated_at DESC, created_at DESC, id DESC
                ) AS row_num
            FROM objection
            WHERE is_deleted IS false
        )
        UPDATE objection AS duplicate
        SET is_deleted = true
        FROM ranked_duplicates
        WHERE duplicate.id = ranked_duplicates.id
          AND ranked_duplicates.row_num > 1
        """
    )


def upgrade() -> None:
    """Upgrade schema."""
    # Drop old plain index on project_id
    op.drop_index("ix_objection_project_id", table_name="objection")

    # Add node-crud columns
    op.add_column(
        "objection",
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default="false"),
    )
    op.add_column(
        "objection",
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
    )
    op.execute("CREATE TYPE updatetype AS ENUM ('automated', 'manual')")
    op.add_column(
        "objection",
        sa.Column(
            "update_type",
            sa.Enum("automated", "manual", name="updatetype", create_type=False),
            nullable=True,
            server_default="automated",
        ),
    )

    # Add AI pipeline fields (all nullable)
    op.add_column("objection", sa.Column("argument_text", sa.Text(), nullable=True))
    op.add_column("objection", sa.Column("argument_description", sa.Text(), nullable=True))
    op.add_column("objection", sa.Column("context_text", sa.Text(), nullable=True))
    op.add_column("objection", sa.Column("source_document_id", sa.String(), nullable=True))
    op.add_column("objection", sa.Column("category_uid", sa.String(), nullable=True))
    op.add_column("objection", sa.Column("category_name", sa.String(), nullable=True))
    op.add_column("objection", sa.Column("reasoning", sa.Text(), nullable=True))
    op.add_column("objection", sa.Column("confidence", sa.Float(), nullable=True))

    # Soft-delete pre-existing duplicate objection IDs before enforcing the business key.
    _soft_delete_duplicate_objection_ids()

    op.create_index(
        "uq_objection_project_id_objection_id",
        "objection",
        ["project_id", "objection_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )

    # Create partial index (project_id WHERE is_deleted IS false)
    op.create_index(
        "ix_objection_project_id_active",
        "objection",
        ["project_id"],
        postgresql_where=sa.text("is_deleted IS false"),
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index("ix_objection_project_id_active", table_name="objection")
    op.drop_index(
        "uq_objection_project_id_objection_id",
        table_name="objection",
        postgresql_where=sa.text("is_deleted IS false"),
    )

    op.drop_column("objection", "confidence")
    op.drop_column("objection", "reasoning")
    op.drop_column("objection", "category_name")
    op.drop_column("objection", "category_uid")
    op.drop_column("objection", "source_document_id")
    op.drop_column("objection", "context_text")
    op.drop_column("objection", "argument_description")
    op.drop_column("objection", "argument_text")
    op.drop_column("objection", "update_type")
    op.execute("DROP TYPE updatetype")
    op.drop_column("objection", "frontend_parent_ids")
    op.drop_column("objection", "is_deleted")

    op.create_index("ix_objection_project_id", "objection", ["project_id"])
