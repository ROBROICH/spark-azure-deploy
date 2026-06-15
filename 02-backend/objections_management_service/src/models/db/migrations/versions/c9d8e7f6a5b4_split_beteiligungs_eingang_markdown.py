"""split beteiligungs_eingang markdown into separate node

Revision ID: c9d8e7f6a5b4
Revises: b2c3d4e5f6a7
Create Date: 2026-05-19 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from alembic_utils.temporal import setup_versioning_for_table, teardown_versioning_for_table
from sqlalchemy.dialects import postgresql

revision: str = "c9d8e7f6a5b4"
down_revision: str | Sequence[str] | None = "b2c3d4e5f6a7"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return _has_table(table) and column in {c["name"] for c in _inspector().get_columns(table)}


def _node_base_columns() -> list[sa.Column[Any]]:
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("is_outdated", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
        sa.Column("project_version", sa.Integer(), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "update_type",
            postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False),
            nullable=True,
            server_default=sa.text("'AUTOMATED'::updatetype"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column(
            "sys_period",
            postgresql.TSTZRANGE(),
            nullable=False,
            server_default=sa.text("tstzrange(current_timestamp, null)"),
        ),
    ]


def upgrade() -> None:
    """Upgrade schema."""
    if not _has_table("beteiligungs_eingang_markdown"):
        op.create_table(
            "beteiligungs_eingang_markdown",
            *_node_base_columns(),
            sa.Column("beteiligungs_eingang_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("text", sa.Text(), nullable=False),
            sa.ForeignKeyConstraint(
                ["beteiligungs_eingang_id", "project_version"],
                ["beteiligungs_eingang.id", "beteiligungs_eingang.project_version"],
                ondelete="CASCADE",
                deferrable=True,
                initially="DEFERRED",
            ),
            sa.PrimaryKeyConstraint("id", "project_version"),
        )
        op.create_index(
            "ix_beteiligungs_eingang_markdown_project_id_active",
            "beteiligungs_eingang_markdown",
            ["project_id", "project_version"],
            postgresql_where=sa.text("is_deleted IS false"),
        )
        op.create_index(
            op.f("ix_beteiligungs_eingang_markdown_beteiligungs_eingang_id"),
            "beteiligungs_eingang_markdown",
            ["beteiligungs_eingang_id"],
        )
        op.create_index(
            op.f("ix_beteiligungs_eingang_markdown_project_id"),
            "beteiligungs_eingang_markdown",
            ["project_id"],
        )
        op.create_index(
            "uq_beteiligungs_eingang_markdown_parent",
            "beteiligungs_eingang_markdown",
            ["project_id", "project_version", "beteiligungs_eingang_id"],
            unique=True,
            postgresql_where=sa.text("is_deleted IS false"),
        )
        setup_versioning_for_table(op, "beteiligungs_eingang_markdown")

    if not _has_column("beteiligungs_eingang", "beteiligungs_eingang_markdown_id"):
        op.add_column(
            "beteiligungs_eingang",
            sa.Column("beteiligungs_eingang_markdown_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_index(
            op.f("ix_beteiligungs_eingang_beteiligungs_eingang_markdown_id"),
            "beteiligungs_eingang",
            ["beteiligungs_eingang_markdown_id"],
        )
    if _has_table("beteiligungs_eingang_history") and not _has_column(
        "beteiligungs_eingang_history",
        "beteiligungs_eingang_markdown_id",
    ):
        op.add_column(
            "beteiligungs_eingang_history",
            sa.Column("beteiligungs_eingang_markdown_id", postgresql.UUID(as_uuid=True), nullable=True),
        )

    if _has_column("beteiligungs_eingang", "beteiligungs_eingang_markdown"):
        op.execute(
            sa.text(
                """
                WITH inserted AS (
                    INSERT INTO beteiligungs_eingang_markdown (
                        id,
                        project_id,
                        is_deleted,
                        is_outdated,
                        frontend_parent_ids,
                        project_version,
                        update_type,
                        created_at,
                        updated_at,
                        beteiligungs_eingang_id,
                        text
                    )
                    SELECT
                        gen_random_uuid(),
                        be.project_id,
                        be.is_deleted,
                        be.is_outdated,
                        ARRAY[]::varchar[],
                        be.project_version,
                        be.update_type,
                        be.created_at,
                        be.updated_at,
                        be.id,
                        be.beteiligungs_eingang_markdown
                    FROM beteiligungs_eingang be
                    WHERE be.beteiligungs_eingang_markdown IS NOT NULL
                      AND be.beteiligungs_eingang_markdown_id IS NULL
                    RETURNING id, project_version, beteiligungs_eingang_id
                )
                UPDATE beteiligungs_eingang be
                SET beteiligungs_eingang_markdown_id = inserted.id
                FROM inserted
                WHERE be.id = inserted.beteiligungs_eingang_id
                  AND be.project_version = inserted.project_version
                """
            )
        )
        op.drop_column("beteiligungs_eingang", "beteiligungs_eingang_markdown")
    if _has_column("beteiligungs_eingang_history", "beteiligungs_eingang_markdown"):
        op.drop_column("beteiligungs_eingang_history", "beteiligungs_eingang_markdown")


def downgrade() -> None:
    """Downgrade schema."""
    if not _has_column("beteiligungs_eingang", "beteiligungs_eingang_markdown"):
        op.add_column("beteiligungs_eingang", sa.Column("beteiligungs_eingang_markdown", sa.Text(), nullable=True))
    if _has_table("beteiligungs_eingang_history") and not _has_column(
        "beteiligungs_eingang_history",
        "beteiligungs_eingang_markdown",
    ):
        op.add_column(
            "beteiligungs_eingang_history",
            sa.Column("beteiligungs_eingang_markdown", sa.Text(), nullable=True),
        )

    if _has_table("beteiligungs_eingang_markdown"):
        op.execute(
            sa.text(
                """
                UPDATE beteiligungs_eingang be
                SET beteiligungs_eingang_markdown = md.text
                FROM beteiligungs_eingang_markdown md
                WHERE be.beteiligungs_eingang_markdown_id = md.id
                  AND be.project_version = md.project_version
                """
            )
        )

    if _has_column("beteiligungs_eingang", "beteiligungs_eingang_markdown_id"):
        op.drop_index(
            op.f("ix_beteiligungs_eingang_beteiligungs_eingang_markdown_id"),
            table_name="beteiligungs_eingang",
        )
        op.drop_column("beteiligungs_eingang", "beteiligungs_eingang_markdown_id")
    if _has_column("beteiligungs_eingang_history", "beteiligungs_eingang_markdown_id"):
        op.drop_column("beteiligungs_eingang_history", "beteiligungs_eingang_markdown_id")

    if _has_table("beteiligungs_eingang_markdown"):
        teardown_versioning_for_table(op, "beteiligungs_eingang_markdown")
        op.drop_index("uq_beteiligungs_eingang_markdown_parent", table_name="beteiligungs_eingang_markdown")
        op.drop_index(
            op.f("ix_beteiligungs_eingang_markdown_project_id"),
            table_name="beteiligungs_eingang_markdown",
        )
        op.drop_index(
            op.f("ix_beteiligungs_eingang_markdown_beteiligungs_eingang_id"),
            table_name="beteiligungs_eingang_markdown",
        )
        op.drop_index(
            "ix_beteiligungs_eingang_markdown_project_id_active",
            table_name="beteiligungs_eingang_markdown",
        )
        op.drop_table("beteiligungs_eingang_markdown")
    if _has_table("beteiligungs_eingang_markdown_history"):
        op.drop_table("beteiligungs_eingang_markdown_history")
