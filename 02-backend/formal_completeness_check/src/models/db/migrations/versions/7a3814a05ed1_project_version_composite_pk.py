"""project_version_composite_pk

Revision ID: 7a3814a05ed1
Revises: c8a5e1d2f3b9
Create Date: 2026-05-08 09:28:31.263533

Adds the ``project_version`` column to every node table, rebuilds the partial
``ix_<table>_project_id_active`` indexes on ``(project_id, project_version)``,
and converts the primary key + in-service foreign keys from the previous
``(col, project_id) → (id, project_id)`` shape to the new
``(col, project_version) → (id, project_version)`` shape.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7a3814a05ed1"
down_revision: str | Sequence[str] | None = "c8a5e1d2f3b9"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_COMPOSITE_PK_TABLES: tuple[str, ...] = (
    "category",
    "document",
    "document_type",
    "project_template_version",
    "table_of_content_notes",
    "toc_job_status",
)

# In-service FKs after this migration. Pre-existing FKs are dropped by name
# below since FCC already had partial-composite FKs on ``(col, project_id)``.
_NEW_FKS: tuple[tuple[str, str, str, str, str | None], ...] = (
    ("document_type_category_id_fkey", "document_type", "category", "category_id", "SET NULL"),
    (
        "document_ai_suggested_required_document_type_id_fkey",
        "document",
        "document_type",
        "ai_suggested_required_document_type_id",
        "CASCADE",
    ),
    (
        "document_human_required_document_type_id_fkey",
        "document",
        "document_type",
        "human_required_document_type_id",
        "SET NULL",
    ),
)


def upgrade() -> None:
    """Upgrade schema."""
    # ── 0. Drop existing in-service FKs first (FCC previously kept them
    #      on ``(col, project_id) → (id, project_id)``). The ``uq_*_id_project_id``
    #      unique indexes back those FKs, so the FKs must go before the indexes. ─
    op.drop_constraint(op.f("fk_document_document_type_id_project_id"), "document", type_="foreignkey")
    op.drop_constraint(op.f("fk_document_human_required_document_type"), "document", type_="foreignkey")
    op.drop_constraint(op.f("document_type_category_id_project_id_fkey"), "document_type", type_="foreignkey")

    # ── 1. Add project_version column + rebuild partial indexes ──────────
    op.add_column("category", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.drop_index(op.f("uq_category_id_project_id"), table_name="category")
    op.drop_index(op.f("uq_category_project_name"), table_name="category", postgresql_where="(is_deleted IS FALSE)")
    op.drop_index(
        op.f("ix_category_project_id_active"), table_name="category", postgresql_where="(is_deleted IS FALSE)"
    )
    op.create_index(
        "ix_category_project_id_active",
        "category",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE category_history ADD COLUMN project_version INTEGER")
    op.add_column("document", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.drop_index(
        op.f("ix_document_project_id_active"), table_name="document", postgresql_where="(is_deleted IS FALSE)"
    )
    op.create_index(
        "ix_document_project_id_active",
        "document",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE document_history ADD COLUMN project_version INTEGER")
    op.add_column(
        "document_type", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False)
    )
    op.drop_index(op.f("uq_document_type_id_project_id"), table_name="document_type")
    op.drop_index(
        op.f("ix_document_type_project_id_active"), table_name="document_type", postgresql_where="(is_deleted IS FALSE)"
    )
    op.create_index(
        "ix_document_type_project_id_active",
        "document_type",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE document_type_history ADD COLUMN project_version INTEGER")
    op.add_column(
        "project_template_version",
        sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
    )
    op.drop_index(
        op.f("ix_project_template_version_project_id_active"),
        table_name="project_template_version",
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.create_index(
        "ix_project_template_version_project_id_active",
        "project_template_version",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE project_template_version_history ADD COLUMN project_version INTEGER")
    op.add_column(
        "table_of_content_notes",
        sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False),
    )
    op.drop_index(
        op.f("ix_table_of_content_notes_project_id_active"),
        table_name="table_of_content_notes",
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.create_index(
        "ix_table_of_content_notes_project_id_active",
        "table_of_content_notes",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE table_of_content_notes_history ADD COLUMN project_version INTEGER")
    op.add_column(
        "toc_job_status", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False)
    )
    op.drop_index(
        op.f("ix_toc_job_status_project_id_active"),
        table_name="toc_job_status",
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.create_index(
        "ix_toc_job_status_project_id_active",
        "toc_job_status",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE toc_job_status_history ADD COLUMN project_version INTEGER")

    # ── 3. Replace single-column PKs with composite (id, project_version) ─
    for table in _COMPOSITE_PK_TABLES:
        op.drop_constraint(f"{table}_pkey", table, type_="primary")
        op.create_primary_key(f"{table}_pkey", table, ["id", "project_version"])

    # ── 4. Create new composite FKs against the composite PKs ────────────
    for fk_name, table, parent, col, ondelete in _NEW_FKS:
        op.create_foreign_key(
            fk_name,
            table,
            parent,
            [col, "project_version"],
            ["id", "project_version"],
            ondelete=ondelete,
            deferrable=True,
            initially="DEFERRED",
        )

    # ── 5. Rebuild business-key unique indexes to include project_version ─
    # Idempotent so older deployments can re-run after a stamp.
    op.execute("DROP INDEX IF EXISTS uq_document_type_project_name")
    op.create_index(
        "uq_document_type_project_name",
        "document_type",
        ["project_id", "project_version", "name"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
        if_not_exists=True,
    )
    op.execute("DROP INDEX IF EXISTS uq_document_project_file_id")
    op.create_index(
        "uq_document_project_file_id",
        "document",
        ["project_id", "project_version", "file_id"],
        unique=True,
        postgresql_where=sa.text("file_id IS NOT NULL"),
        if_not_exists=True,
    )
    op.execute("DROP INDEX IF EXISTS uq_project_template_version_project_id")
    op.create_index(
        "uq_project_template_version_project_id",
        "project_template_version",
        ["project_id", "project_version"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
        if_not_exists=True,
    )
    op.execute("DROP INDEX IF EXISTS uq_toc_job_status_project_id")
    op.create_index(
        "uq_toc_job_status_project_id",
        "toc_job_status",
        ["project_id", "project_version"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
        if_not_exists=True,
    )

    op.add_column("category", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("ALTER TABLE category_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column("document", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("ALTER TABLE document_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column(
        "document_type", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )
    op.execute("ALTER TABLE document_type_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column(
        "project_template_version",
        sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.execute("ALTER TABLE project_template_version_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column(
        "table_of_content_notes",
        sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.execute("ALTER TABLE table_of_content_notes_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column(
        "toc_job_status", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )
    op.execute("ALTER TABLE toc_job_status_history ADD COLUMN is_outdated BOOLEAN")


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_column("toc_job_status", "is_outdated")
    op.drop_column("table_of_content_notes", "is_outdated")
    op.drop_column("project_template_version", "is_outdated")
    op.drop_column("document_type", "is_outdated")
    op.drop_column("document", "is_outdated")
    op.drop_column("category", "is_outdated")
    # ── Reverse step 4: drop new composite FKs ───────────────────────────
    for fk_name, table, _parent, _col, _ondelete in _NEW_FKS:
        op.drop_constraint(fk_name, table, type_="foreignkey")

    # ── Reverse step 3: restore single-column PKs ────────────────────────
    for table in _COMPOSITE_PK_TABLES:
        op.drop_constraint(f"{table}_pkey", table, type_="primary")
        op.create_primary_key(f"{table}_pkey", table, ["id"])

    # ── Reverse step 2: restore the prior ``(col, project_id)`` FKs ──────
    op.create_foreign_key(
        op.f("document_type_category_id_project_id_fkey"),
        "document_type",
        "category",
        ["category_id", "project_id"],
        ["id", "project_id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_document_human_required_document_type"),
        "document",
        "document_type",
        ["human_required_document_type_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_document_document_type_id_project_id"),
        "document",
        "document_type",
        ["ai_suggested_required_document_type_id", "project_id"],
        ["id", "project_id"],
        ondelete="CASCADE",
    )

    # ── Reverse step 1: drop project_version column + restore indexes ────
    op.drop_index(
        "ix_toc_job_status_project_id_active",
        table_name="toc_job_status",
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_index(
        op.f("ix_toc_job_status_project_id_active"),
        "toc_job_status",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.drop_column("toc_job_status", "project_version")
    op.drop_index(
        "ix_table_of_content_notes_project_id_active",
        table_name="table_of_content_notes",
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_index(
        op.f("ix_table_of_content_notes_project_id_active"),
        "table_of_content_notes",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.drop_column("table_of_content_notes", "project_version")
    op.drop_index(
        "ix_project_template_version_project_id_active",
        table_name="project_template_version",
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_index(
        op.f("ix_project_template_version_project_id_active"),
        "project_template_version",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.drop_column("project_template_version", "project_version")
    op.drop_index(
        "ix_document_type_project_id_active",
        table_name="document_type",
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.create_index(
        op.f("ix_document_type_project_id_active"),
        "document_type",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.create_index(op.f("uq_document_type_id_project_id"), "document_type", ["id", "project_id"], unique=True)
    op.drop_column("document_type", "project_version")
    op.drop_index(
        "ix_document_project_id_active", table_name="document", postgresql_where=sa.text("is_deleted IS false")
    )
    op.create_index(
        op.f("ix_document_project_id_active"),
        "document",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.drop_column("document", "project_version")
    op.drop_index(
        "ix_category_project_id_active", table_name="category", postgresql_where=sa.text("is_deleted IS false")
    )
    op.create_index(
        op.f("ix_category_project_id_active"),
        "category",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.create_index(
        op.f("uq_category_project_name"),
        "category",
        ["project_id", "name"],
        unique=True,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.create_index(op.f("uq_category_id_project_id"), "category", ["id", "project_id"], unique=True)
    op.drop_column("category", "project_version")
