"""project_version_composite_pk

Revision ID: aa60740235be
Revises: a7f3b2e1d9c8
Create Date: 2026-05-08 09:28:32.783701

Adds the ``project_version`` column to every node table and converts the
primary key + in-service foreign keys to composite shape.
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision: str = "aa60740235be"
down_revision: str | Sequence[str] | None = "a7f3b2e1d9c8"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_COMPOSITE_PK_TABLES: tuple[str, ...] = ("argument", "beteiligungs_eingang")

# Cross-service refs (argument.sub_topic_id, argument.topic_id, and
# beteiligungs_eingang.file_id) are not enforced as DB FKs.
_IN_SERVICE_FKS: tuple[tuple[str, str, str, str, str | None], ...] = (
    ("argument_beteiligungs_eingang_id_fkey", "argument", "beteiligungs_eingang", "beteiligungs_eingang_id", "CASCADE"),
)


def upgrade() -> None:
    """Upgrade schema."""
    # ── 1. Add project_version column + tighten existing column defaults ─
    op.add_column("argument", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False))
    op.alter_column("argument", "in_vae", existing_type=sa.BOOLEAN(), server_default=None, existing_nullable=False)
    op.alter_column(
        "argument", "is_valid_argument", existing_type=sa.BOOLEAN(), server_default=None, existing_nullable=False
    )
    op.alter_column("argument", "is_deleted", existing_type=sa.BOOLEAN(), server_default=None, existing_nullable=False)
    op.alter_column(
        "argument",
        "status",
        existing_type=sa.Enum("open", "subtopic_reviewed", "done", name="argumentstatus"),
        server_default=None,
        existing_nullable=False,
    )
    op.create_index(op.f("ix_argument_project_id"), "argument", ["project_id"], unique=False)
    op.create_index(
        "ix_argument_project_id_active",
        "argument",
        ["project_id", "project_version"],
        unique=False,
        postgresql_where=sa.text("is_deleted IS false"),
    )
    op.execute("ALTER TABLE argument_history ADD COLUMN project_version INTEGER")
    op.add_column(
        "beteiligungs_eingang", sa.Column("project_version", sa.Integer(), server_default=sa.text("1"), nullable=False)
    )
    op.alter_column(
        "beteiligungs_eingang", "is_deleted", existing_type=sa.BOOLEAN(), server_default=None, existing_nullable=False
    )
    op.execute("ALTER TABLE beteiligungs_eingang_history ADD COLUMN project_version INTEGER")

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

    # ── 5. Rebuild business-key uniques to include project_version ───────
    # Idempotent so older deployments can re-run after a stamp.
    op.execute("DROP INDEX IF EXISTS uq_argument_project_id_argument_id")
    op.create_index(
        "uq_argument_project_id_argument_id",
        "argument",
        ["project_id", "project_version", "argument_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
        if_not_exists=True,
    )
    op.execute("DROP INDEX IF EXISTS uq_beteiligungs_eingang_project_file")
    op.create_index(
        "uq_beteiligungs_eingang_project_file",
        "beteiligungs_eingang",
        ["project_id", "project_version", "file_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
        if_not_exists=True,
    )

    op.add_column("argument", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False))
    op.execute("ALTER TABLE argument_history ADD COLUMN is_outdated BOOLEAN")
    op.add_column(
        "beteiligungs_eingang", sa.Column("is_outdated", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )
    op.execute("ALTER TABLE beteiligungs_eingang_history ADD COLUMN is_outdated BOOLEAN")


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_column("beteiligungs_eingang", "is_outdated")
    op.drop_column("argument", "is_outdated")
    for fk_name, table, _parent, _col, _ondelete in _IN_SERVICE_FKS:
        op.drop_constraint(fk_name, table, type_="foreignkey")
    for table in _COMPOSITE_PK_TABLES:
        op.drop_constraint(f"{table}_pkey", table, type_="primary")
        op.create_primary_key(f"{table}_pkey", table, ["id"])
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
    op.alter_column(
        "beteiligungs_eingang",
        "is_deleted",
        existing_type=sa.BOOLEAN(),
        server_default=sa.text("false"),
        existing_nullable=False,
    )
    op.drop_column("beteiligungs_eingang", "project_version")
    op.drop_index(op.f("ix_argument_project_id"), table_name="argument")
    op.alter_column(
        "argument", "is_deleted", existing_type=sa.BOOLEAN(), server_default=sa.text("false"), existing_nullable=False
    )
    op.alter_column(
        "argument",
        "is_valid_argument",
        existing_type=sa.BOOLEAN(),
        server_default=sa.text("true"),
        existing_nullable=False,
    )
    op.alter_column(
        "argument", "in_vae", existing_type=sa.BOOLEAN(), server_default=sa.text("false"), existing_nullable=False
    )
    op.drop_column("argument", "project_version")
