"""complete restructure: replace objection tables with beteiligungs_eingang and argument

Revision ID: 922fa108f9ce
Revises: 5f2a8b9c1d4e
Create Date: 2026-04-23 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from alembic_utils.temporal import (
    install_versioning_function,
    setup_versioning_for_table,
    teardown_versioning_for_table,
)
from sqlalchemy.dialects import postgresql

revision: str = "922fa108f9ce"
down_revision: str | Sequence[str] | None = "5f2a8b9c1d4e"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_OLD_VERSIONED_TABLES = ("objection", "objection_chunk", "objection_category")
_NEW_TABLES = ("beteiligungs_eingang", "argument")


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_table(name: str) -> bool:
    return name in _inspector().get_table_names()


def _has_column(table: str, column: str) -> bool:
    return _has_table(table) and column in {c["name"] for c in _inspector().get_columns(table)}


def _has_enum(name: str) -> bool:
    return (
        op.get_bind().execute(sa.text("SELECT 1 FROM pg_type WHERE typname = :n"), {"n": name}).fetchone() is not None
    )


def _node_base_columns() -> list[sa.Column[Any]]:
    return [
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_deleted", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column(
            "frontend_parent_ids",
            postgresql.ARRAY(sa.String()),
            nullable=False,
            server_default=sa.text("ARRAY[]::varchar[]"),
        ),
        sa.Column(
            "update_type",
            postgresql.ENUM("AUTOMATED", "MANUAL", name="updatetype", create_type=False),
            nullable=True,
            server_default=sa.text("'AUTOMATED'::updatetype"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "sys_period",
            postgresql.TSTZRANGE(),
            nullable=False,
            server_default=sa.text("tstzrange(current_timestamp, null)"),
        ),
    ]


def upgrade() -> None:
    """Drop legacy objection tables, create beteiligungs_eingang and argument."""
    # --- drop old tables ---
    for table in _OLD_VERSIONED_TABLES:
        if _has_table(table) and _has_column(table, "sys_period"):
            teardown_versioning_for_table(op, table)
        history = f"{table}_history"
        if _has_table(history):
            op.drop_table(history)
        if _has_table(table):
            op.drop_table(table)

    # --- versioning function (idempotent CREATE OR REPLACE) ---
    install_versioning_function(op, version="v1")

    # --- new enums ---
    if not _has_enum("beteiligungtyp"):
        sa.Enum("STELLUNGNAHME", "NATURSCHUTZ", "EINWENDUNG", name="beteiligungtyp").create(op.get_bind())
    if not _has_enum("extractionstatus"):
        sa.Enum(
            "SUCCESS",
            "FAILED",
            "PROMP_INJECTION_ERROR",
            name="extractionstatus",
        ).create(op.get_bind())

    # --- beteiligungs_eingang ---
    if not _has_table("beteiligungs_eingang"):
        op.create_table(
            "beteiligungs_eingang",
            *_node_base_columns(),
            sa.Column("sender", sa.String(), nullable=False),
            sa.Column(
                "beteiligung_typ",
                postgresql.ENUM("STELLUNGNAHME", "NATURSCHUTZ", "EINWENDUNG", name="beteiligungtyp", create_type=False),
                nullable=False,
            ),
            sa.Column("file_id", postgresql.UUID(as_uuid=True), nullable=False),
            sa.Column("beteiligungs_eingang_markdown", sa.Text(), nullable=True),
            sa.Column(
                "extraction_status",
                postgresql.ENUM(
                    "SUCCESS",
                    "FAILED",
                    "PROMP_INJECTION_ERROR",
                    name="extractionstatus",
                    create_type=False,
                ),
                nullable=False,
            ),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_beteiligungs_eingang_project_id", "beteiligungs_eingang", ["project_id"])
        setup_versioning_for_table(op, "beteiligungs_eingang")

    # --- argument ---
    if not _has_table("argument"):
        op.create_table(
            "argument",
            *_node_base_columns(),
            sa.Column(
                "beteiligungs_eingang_id",
                postgresql.UUID(as_uuid=True),
                sa.ForeignKey("beteiligungs_eingang.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("sub_topic_id", postgresql.UUID(as_uuid=True), nullable=True),
            sa.Column("text", sa.Text(), nullable=True),
            sa.Column("start_idx", sa.Integer(), nullable=True),
            sa.Column("end_idx", sa.Integer(), nullable=True),
            sa.Column("erwiderung", sa.Text(), nullable=True),
            sa.Column("einordnung", sa.Text(), nullable=True),
            sa.Column("context", sa.Text(), nullable=True),
            sa.Column("context_start_idx", sa.Integer(), nullable=True),
            sa.Column("context_end_idx", sa.Integer(), nullable=True),
            sa.Column("checked", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("in_vae", sa.Boolean(), nullable=False, server_default=sa.text("false")),
            sa.Column("is_valid_argument", sa.Boolean(), nullable=False, server_default=sa.text("true")),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index("ix_argument_beteiligungs_eingang_id", "argument", ["beteiligungs_eingang_id"])
        op.create_index("ix_argument_sub_topic_id", "argument", ["sub_topic_id"])
        setup_versioning_for_table(op, "argument")


def downgrade() -> None:
    """Drop new tables and restore previous state."""
    for table in reversed(_NEW_TABLES):
        if _has_table(table) and _has_column(table, "sys_period"):
            teardown_versioning_for_table(op, table)
        if _has_table(f"{table}_history"):
            op.drop_table(f"{table}_history")
        if _has_table(table):
            op.drop_table(table)

    if _has_enum("beteiligungtyp"):
        sa.Enum(name="beteiligungtyp").drop(op.get_bind())
    if _has_enum("extractionstatus"):
        sa.Enum(name="extractionstatus").drop(op.get_bind())
