"""project_version_composite_pk

Revision ID: 2fc45d806661
Revises: d4f0a9c8e1b2
Create Date: 2026-05-08 09:28:35.358867

Adds the ``project_version`` column to every node table, rebuilds the partial
``ix_<table>_project_id_active`` indexes on ``(project_id, project_version)``,
and converts the primary key + in-service foreign keys to the composite shape
``(id, project_version) → (parent.id, parent.project_version)``. Required by
the new versioning workflow, which needs to insert copies of an existing row
at a higher ``project_version`` without colliding on the ``id`` PK.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "2fc45d806661"
down_revision: str | Sequence[str] | None = "d4f0a9c8e1b2"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


# Tables that gain the composite (id, project_version) PK.
_COMPOSITE_PK_TABLES: tuple[str, ...] = (
    "applicant",
    "deadline",
    "project",
    "subtopic",
    "topic",
    "topic_norm",
)

# In-service FKs: (fk_name, table, parent, child_col, ondelete).
# Cross-service refs (e.g. AdministrativeFileDraft.vae_node.topic_id) are
# *not* enforced as DB FKs and stay untouched.
_IN_SERVICE_FKS: tuple[tuple[str, str, str, str, str | None], ...] = (
    ("fk_project_applicant_id", "project", "applicant", "applicant_id", None),
    ("deadline_project_id_fkey", "deadline", "project", "project_id", None),
    ("topic_project_id_fkey", "topic", "project", "project_id", "CASCADE"),
    ("topic_parent_topic_id_fkey", "topic", "topic", "parent_topic_id", "CASCADE"),
    ("fk_subtopic_project_id_project", "subtopic", "project", "project_id", "CASCADE"),
    ("fk_subtopic_topic_id_topic", "subtopic", "topic", "topic_id", "CASCADE"),
    ("topic_norm_project_id_fkey", "topic_norm", "project", "project_id", "CASCADE"),
    ("topic_norm_topic_id_fkey", "topic_norm", "topic", "topic_id", "CASCADE"),
    ("fk_topic_norm_subtopic_id_subtopic", "topic_norm", "subtopic", "subtopic_id", "CASCADE"),
)


def _upgrade_topic_norm_revision_statuses(table_name: str) -> None:
    op.add_column(
        table_name,
        sa.Column("mvp_status", sa.String(length=32), server_default="unchecked", nullable=False),
    )
    op.add_column(
        table_name,
        sa.Column("satz_statuses", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
    )
    op.execute(
        sa.text(
            f"""
            UPDATE {table_name}
            SET
                mvp_status = CASE WHEN mvp_checked THEN 'checked' ELSE 'unchecked' END,
                satz_statuses = COALESCE(
                    (
                        SELECT jsonb_object_agg(satz_id::text, 'checked')
                        FROM unnest(checked_saetze) AS satz_id
                    ),
                    '{{}}'::jsonb
                )
            """
        )
    )
    op.create_check_constraint(
        f"ck_{table_name}_mvp_status",
        table_name,
        "mvp_status IN ('unchecked', 'checked', 'needs_revision')",
    )
    op.drop_column(table_name, "checked_saetze")
    op.drop_column(table_name, "rpb_checked")
    op.drop_column(table_name, "mvp_checked")


def _downgrade_topic_norm_revision_statuses(table_name: str) -> None:
    op.add_column(
        table_name,
        sa.Column("mvp_checked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        table_name,
        sa.Column("rpb_checked", sa.Boolean(), server_default=sa.text("false"), nullable=False),
    )
    op.add_column(
        table_name,
        sa.Column(
            "checked_saetze",
            postgresql.ARRAY(postgresql.UUID(as_uuid=True)),
            server_default=sa.text("ARRAY[]::uuid[]"),
            nullable=False,
        ),
    )
    op.execute(
        sa.text(
            f"""
            UPDATE {table_name}
            SET
                mvp_checked = (mvp_status = 'checked'),
                checked_saetze = COALESCE(
                    (
                        SELECT array_agg(key::uuid)
                        FROM jsonb_each_text(satz_statuses)
                        WHERE value = 'checked'
                    ),
                    ARRAY[]::uuid[]
                )
            """
        )
    )
    op.drop_constraint(f"ck_{table_name}_mvp_status", table_name, type_="check")
    op.drop_column(table_name, "satz_statuses")
    op.drop_column(table_name, "mvp_status")


def upgrade() -> None:
    """Upgrade schema."""
    # ── 1. Add project_version column + rebuild partial indexes ──────────
    op.add_column("applicant", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.drop_index(
        op.f("ix_applicant_project_id_active"), table_name="applicant", postgresql_where="(is_deleted IS FALSE)"
    )
    op.create_index(
        "ix_applicant_project_id_active",
        "applicant",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE applicant_history ADD COLUMN project_version INTEGER")
    op.add_column("deadline", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.drop_index(
        op.f("ix_deadline_project_id_active"), table_name="deadline", postgresql_where="(is_deleted IS FALSE)"
    )
    op.create_index(
        "ix_deadline_project_id_active",
        "deadline",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE deadline_history ADD COLUMN project_version INTEGER")
    op.add_column("project", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.execute("ALTER TABLE project_history ADD COLUMN project_version INTEGER")
    op.add_column("topic", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.drop_index(op.f("ix_topic_project_id_active"), table_name="topic", postgresql_where="(is_deleted IS FALSE)")
    op.create_index(
        "ix_topic_project_id_active",
        "topic",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE topic_history ADD COLUMN project_version INTEGER")
    op.add_column("subtopic", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.drop_index(
        op.f("ix_subtopic_project_id_active"), table_name="subtopic", postgresql_where="(is_deleted IS FALSE)"
    )
    op.create_index(
        "ix_subtopic_project_id_active",
        "subtopic",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE subtopic_history ADD COLUMN project_version INTEGER")
    op.add_column("topic_norm", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.drop_index(
        op.f("ix_topic_norm_project_id_active"), table_name="topic_norm", postgresql_where="(is_deleted IS FALSE)"
    )
    op.create_index(
        "ix_topic_norm_project_id_active",
        "topic_norm",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE topic_norm_history ADD COLUMN project_version INTEGER")

    # ── 2. Drop in-service FKs before touching the parent PKs ────────────
    for fk_name, table, _parent, _col, _ondelete in _IN_SERVICE_FKS:
        op.drop_constraint(fk_name, table, type_="foreignkey")

    # ── 3. Replace single-column PKs with composite (id, project_version) ─
    for table in _COMPOSITE_PK_TABLES:
        op.drop_constraint(f"{table}_pkey", table, type_="primary")
        op.create_primary_key(f"{table}_pkey", table, ["id", "project_version"])

    # ── 4. Recreate FKs as composite (col, project_version) → (id, project_version) ─
    for fk_name, table, parent, col, ondelete in _IN_SERVICE_FKS:
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

    # ── 5. Rebuild business-key unique indexes/constraints with project_version ─
    # The original constraints enforced uniqueness across all project versions,
    # which prevents the new versioning workflow from copying rows forward.
    # Idempotent so older deployments (which applied this migration before
    # this step existed) can re-run it after a stamp/backfill.
    op.execute("ALTER TABLE project DROP CONSTRAINT IF EXISTS project_internal_project_number_key")
    op.execute("DROP INDEX IF EXISTS project_internal_project_number_key")
    op.create_index(
        "project_internal_project_number_key",
        "project",
        ["internal_project_number", "project_version"],
        unique=True,
        if_not_exists=True,
    )
    op.execute("DROP INDEX IF EXISTS uq_topic_project_parent_name_active")
    op.create_index(
        "uq_topic_project_parent_name_active",
        "topic",
        ["project_id", "project_version", "parent_topic_id", "name"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
        if_not_exists=True,
    )
    op.execute("DROP INDEX IF EXISTS uq_subtopic_topic_name_active")
    op.create_index(
        "uq_subtopic_topic_name_active",
        "subtopic",
        ["topic_id", "project_version", "name"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
        if_not_exists=True,
    )
    op.execute("DROP INDEX IF EXISTS uq_topic_norm")
    op.create_index(
        "uq_topic_norm",
        "topic_norm",
        ["topic_id", "project_version", "jurabk", "paragraph_nr", "satz", "absatz", "nummer"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false AND topic_id IS NOT NULL"),
        if_not_exists=True,
    )
    op.execute("DROP INDEX IF EXISTS uq_subtopic_norm")
    op.create_index(
        "uq_subtopic_norm",
        "topic_norm",
        ["subtopic_id", "project_version", "jurabk", "paragraph_nr", "satz", "absatz", "nummer"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false AND subtopic_id IS NOT NULL"),
        if_not_exists=True,
    )

    op.create_table(
        "project_version_lock",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("project_id", sa.UUID(), nullable=False),
        sa.Column("source_version", sa.Integer(), nullable=False),
        sa.Column("target_version", sa.Integer(), nullable=False),
        sa.Column("zip_file_id", sa.UUID(), nullable=True),
        sa.Column("lock_token", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "ACTIVE",
                "RELEASED",
                name="projectversionlockstatus",
                native_enum=False,
                create_constraint=True,
            ),
            server_default="ACTIVE",
            nullable=False,
        ),
        sa.Column("error", sa.String(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("lock_token", name="uq_project_version_lock_lock_token"),
    )
    op.create_index("ix_project_version_lock_project_id", "project_version_lock", ["project_id"], unique=False)
    op.create_index("ix_project_version_lock_zip_file_id", "project_version_lock", ["zip_file_id"], unique=False)
    op.create_index(
        "uq_active_project_version_lock",
        "project_version_lock",
        ["project_id"],
        unique=True,
        postgresql_where=sa.text("status = 'ACTIVE'"),
    )

    _upgrade_topic_norm_revision_statuses("topic_norm")
    _upgrade_topic_norm_revision_statuses("topic_norm_history")

    op.add_column("applicant", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("ALTER TABLE applicant_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column("deadline", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("ALTER TABLE deadline_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column("project", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("ALTER TABLE project_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column("subtopic", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("ALTER TABLE subtopic_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column("topic", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("ALTER TABLE topic_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column("topic_norm", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("ALTER TABLE topic_norm_history ADD COLUMN is_outdated BOOLEAN")


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("topic_norm", "is_outdated")
    op.drop_column("topic", "is_outdated")
    op.drop_column("subtopic", "is_outdated")
    op.drop_column("project", "is_outdated")
    op.drop_column("deadline", "is_outdated")
    op.drop_column("applicant", "is_outdated")

    _downgrade_topic_norm_revision_statuses("topic_norm_history")
    _downgrade_topic_norm_revision_statuses("topic_norm")

    op.drop_index(
        "uq_active_project_version_lock",
        table_name="project_version_lock",
        postgresql_where=sa.text("status = 'ACTIVE'"),
    )
    op.drop_index("ix_project_version_lock_zip_file_id", table_name="project_version_lock")
    op.drop_index("ix_project_version_lock_project_id", table_name="project_version_lock")
    op.drop_table("project_version_lock")

    # ── Reverse step 5: restore single-column business-key uniques ───────
    op.drop_index(
        "uq_subtopic_norm",
        table_name="topic_norm",
        postgresql_where=sa.text("is_deleted IS false AND subtopic_id IS NOT NULL"),
    )
    op.create_index(
        "uq_subtopic_norm",
        "topic_norm",
        ["subtopic_id", "jurabk", "paragraph_nr", "satz", "absatz", "nummer"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false AND subtopic_id IS NOT NULL"),
    )
    op.drop_index(
        "uq_topic_norm",
        table_name="topic_norm",
        postgresql_where=sa.text("is_deleted IS false AND topic_id IS NOT NULL"),
    )
    op.create_index(
        "uq_topic_norm",
        "topic_norm",
        ["topic_id", "jurabk", "paragraph_nr", "satz", "absatz", "nummer"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false AND topic_id IS NOT NULL"),
    )
    op.drop_index(
        "uq_subtopic_topic_name_active", table_name="subtopic", postgresql_where=sa.text("is_deleted IS false")
    )
    op.create_index(
        "uq_subtopic_topic_name_active",
        "subtopic",
        ["topic_id", "name"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.drop_index(
        "uq_topic_project_parent_name_active", table_name="topic", postgresql_where=sa.text("is_deleted IS false")
    )
    op.create_index(
        "uq_topic_project_parent_name_active",
        "topic",
        ["project_id", "parent_topic_id", "name"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.drop_index("project_internal_project_number_key", table_name="project")
    op.create_unique_constraint(
        "project_internal_project_number_key",
        "project",
        ["internal_project_number"],
    )

    # ── Reverse step 4: drop composite FKs ───────────────────────────────
    for fk_name, table, _parent, _col, _ondelete in _IN_SERVICE_FKS:
        op.drop_constraint(fk_name, table, type_="foreignkey")

    # ── Reverse step 3: restore single-column PKs ────────────────────────
    for table in _COMPOSITE_PK_TABLES:
        op.drop_constraint(f"{table}_pkey", table, type_="primary")
        op.create_primary_key(f"{table}_pkey", table, ["id"])

    # ── Reverse step 2: restore single-column FKs ────────────────────────
    for fk_name, table, parent, col, ondelete in _IN_SERVICE_FKS:
        op.create_foreign_key(
            fk_name,
            table,
            parent,
            [col],
            ["id"],
            ondelete=ondelete,
            deferrable=True,
            initially="DEFERRED",
        )

    # ── Reverse step 1: drop project_version column + restore indexes ────
    op.drop_index(
        "ix_topic_norm_project_id_active", table_name="topic_norm", postgresql_where=sa.text("is_deleted IS false")
    )
    op.create_index(
        op.f("ix_topic_norm_project_id_active"),
        "topic_norm",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.drop_column("topic_norm", "project_version")
    op.drop_index("ix_topic_project_id_active", table_name="topic", postgresql_where=sa.text("is_deleted IS false"))
    op.create_index(
        op.f("ix_topic_project_id_active"),
        "topic",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.drop_column("topic", "project_version")
    op.drop_index(
        "ix_subtopic_project_id_active", table_name="subtopic", postgresql_where=sa.text("is_deleted IS false")
    )
    op.create_index(
        op.f("ix_subtopic_project_id_active"),
        "subtopic",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.drop_column("subtopic", "project_version")
    op.drop_column("project", "project_version")
    op.drop_index(
        "ix_deadline_project_id_active", table_name="deadline", postgresql_where=sa.text("is_deleted IS false")
    )
    op.create_index(
        op.f("ix_deadline_project_id_active"),
        "deadline",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.drop_column("deadline", "project_version")
    op.drop_index(
        "ix_applicant_project_id_active", table_name="applicant", postgresql_where=sa.text("is_deleted IS false")
    )
    op.create_index(
        op.f("ix_applicant_project_id_active"),
        "applicant",
        ["project_id"],
        unique=False,
        postgresql_where="(is_deleted IS FALSE)",
    )
    op.drop_column("applicant", "project_version")
