"""normalize objection storage into root, chunk, and category nodes

Revision ID: c8a6f4b7d2e1
Revises: b1d2c3e4f5a6
Create Date: 2026-04-22 00:00:00.000000

"""

from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "c8a6f4b7d2e1"
down_revision: str | Sequence[str] | None = "b1d2c3e4f5a6"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


LEGACY_COLUMNS: tuple[tuple[str, sa.types.TypeEngine[Any]], ...] = (
    ("objection_text", sa.Text()),
    ("response_text", sa.Text()),
    ("classification_text", sa.String()),
    ("category", sa.String()),
    ("sender", sa.String()),
    ("objection_date", sa.String()),
    ("filename", sa.String()),
    ("keywords", sa.String()),
)

OBSOLETE_ROOT_COLUMNS: tuple[tuple[str, sa.types.TypeEngine[Any]], ...] = (
    ("category_uid", sa.String()),
    ("category_name", sa.String()),
)

ROOT_COLUMNS: tuple[tuple[str, sa.types.TypeEngine[Any]], ...] = (
    ("source_document_name", sa.String()),
    ("objection_chunk_id", postgresql.UUID(as_uuid=True)),
    ("category_id", postgresql.UUID(as_uuid=True)),
    ("argument_start_idx", sa.Integer()),
    ("argument_end_idx", sa.Integer()),
    ("context_start_idx", sa.Integer()),
    ("context_end_idx", sa.Integer()),
)

HISTORY_COLUMNS: tuple[tuple[str, sa.types.TypeEngine[Any]], ...] = (
    ("argument_text", sa.Text()),
    ("argument_description", sa.Text()),
    ("context_text", sa.Text()),
    ("source_document_id", sa.String()),
    ("source_document_name", sa.String()),
    ("objection_chunk_id", postgresql.UUID(as_uuid=True)),
    ("category_id", postgresql.UUID(as_uuid=True)),
    ("argument_start_idx", sa.Integer()),
    ("argument_end_idx", sa.Integer()),
    ("context_start_idx", sa.Integer()),
    ("context_end_idx", sa.Integer()),
    ("reasoning", sa.Text()),
    ("confidence", sa.Float()),
)


def _inspector() -> sa.Inspector:
    return sa.inspect(op.get_bind())


def _has_table(table_name: str) -> bool:
    return table_name in _inspector().get_table_names()


def _column_names(table_name: str) -> set[str]:
    if not _has_table(table_name):
        return set()
    return {column["name"] for column in _inspector().get_columns(table_name)}


def _index_names(table_name: str) -> set[str]:
    if not _has_table(table_name):
        return set()
    return {index["name"] for index in _inspector().get_indexes(table_name) if index["name"]}


def _foreign_key_names(table_name: str) -> set[str]:
    if not _has_table(table_name):
        return set()
    return {fk["name"] for fk in _inspector().get_foreign_keys(table_name) if fk["name"]}


def _update_type_default() -> sa.TextClause:
    bind = op.get_bind()
    row = bind.execute(
        sa.text(
            """
            SELECT enumlabel
            FROM pg_enum e
            JOIN pg_type t ON t.oid = e.enumtypid
            WHERE t.typname = 'updatetype'
            ORDER BY enumsortorder
            LIMIT 1
            """
        )
    ).fetchone()
    label = row[0] if row else "automated"
    return sa.text(f"'{label}'")


def _add_column_if_missing(table_name: str, column_name: str, column_type: sa.types.TypeEngine[Any]) -> None:
    if column_name in _column_names(table_name):
        return
    op.add_column(table_name, sa.Column(column_name, column_type, nullable=True))


def _drop_column_if_exists(table_name: str, column_name: str) -> None:
    if column_name not in _column_names(table_name):
        return
    op.drop_column(table_name, column_name)


def _create_index_if_missing(
    name: str,
    table_name: str,
    columns: list[str],
    *,
    unique: bool = False,
    postgresql_where: sa.ColumnElement[bool] | sa.TextClause | None = None,
) -> None:
    if name in _index_names(table_name):
        return
    op.create_index(
        name,
        table_name,
        columns,
        unique=unique,
        postgresql_where=postgresql_where,
    )


def _drop_index_if_exists(name: str, table_name: str) -> None:
    if name not in _index_names(table_name):
        return
    op.drop_index(name, table_name=table_name)


def _create_fk_if_missing(
    name: str,
    source_table: str,
    referent_table: str,
    local_cols: list[str],
    remote_cols: list[str],
    *,
    ondelete: str | None = None,
) -> None:
    if name in _foreign_key_names(source_table):
        return
    op.create_foreign_key(
        name,
        source_table,
        referent_table,
        local_cols,
        remote_cols,
        ondelete=ondelete,
    )


def _drop_fk_if_exists(name: str, source_table: str) -> None:
    if name not in _foreign_key_names(source_table):
        return
    op.drop_constraint(name, source_table, type_="foreignkey")


def _create_objection_chunk_table() -> None:
    if _has_table("objection_chunk"):
        return

    update_type_enum = postgresql.ENUM(
        "automated",
        "manual",
        name="updatetype",
        create_type=False,
    )

    op.create_table(
        "objection_chunk",
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
            update_type_enum,
            nullable=True,
            server_default=_update_type_default(),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source_document_id", sa.String(), nullable=False),
        sa.Column("source_document_name", sa.String(), nullable=True),
        sa.Column("source_chunk_id", sa.String(), nullable=False),
        sa.Column("page_content", sa.Text(), nullable=False),
        sa.Column("page_numbers", sa.JSON(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    _create_index_if_missing(
        "ix_objection_chunk_project_id_active",
        "objection_chunk",
        ["project_id"],
        postgresql_where=sa.text("is_deleted IS false"),
    )
    _create_index_if_missing(
        "uq_objection_chunk_source_active",
        "objection_chunk",
        ["project_id", "source_document_id", "source_chunk_id"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )


def _create_objection_category_table() -> None:
    if _has_table("objection_category"):
        return

    update_type_enum = postgresql.ENUM(
        "automated",
        "manual",
        name="updatetype",
        create_type=False,
    )

    op.create_table(
        "objection_category",
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
            update_type_enum,
            nullable=True,
            server_default=_update_type_default(),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("external_uid", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    _create_index_if_missing(
        "ix_objection_category_project_id_active",
        "objection_category",
        ["project_id"],
        postgresql_where=sa.text("is_deleted IS false"),
    )
    _create_index_if_missing(
        "uq_objection_category_external_uid_active",
        "objection_category",
        ["project_id", "external_uid"],
        unique=True,
        postgresql_where=sa.text("is_deleted IS false"),
    )


def upgrade() -> None:
    """Upgrade schema."""
    for table_name in ("objection", "objection_history"):
        for column_name, _ in LEGACY_COLUMNS:
            _drop_column_if_exists(table_name, column_name)

    for column_name, _ in OBSOLETE_ROOT_COLUMNS:
        _drop_column_if_exists("objection", column_name)
        _drop_column_if_exists("objection_history", column_name)

    for column_name, column_type in ROOT_COLUMNS:
        _add_column_if_missing("objection", column_name, column_type)

    for column_name, column_type in HISTORY_COLUMNS:
        _add_column_if_missing("objection_history", column_name, column_type)

    _create_objection_chunk_table()
    _create_objection_category_table()

    _create_index_if_missing("ix_objection_objection_chunk_id", "objection", ["objection_chunk_id"])
    _create_index_if_missing("ix_objection_category_id", "objection", ["category_id"])
    _create_fk_if_missing(
        "fk_objection_objection_chunk_id",
        "objection",
        "objection_chunk",
        ["objection_chunk_id"],
        ["id"],
        ondelete="SET NULL",
    )
    _create_fk_if_missing(
        "fk_objection_category_id",
        "objection",
        "objection_category",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )


def _drop_objection_chunk_fks_and_indexes() -> None:
    _drop_fk_if_exists("fk_objection_category_id", "objection")
    _drop_fk_if_exists("fk_objection_objection_chunk_id", "objection")
    _drop_index_if_exists("ix_objection_category_id", "objection")
    _drop_index_if_exists("ix_objection_objection_chunk_id", "objection")


def _drop_objection_category_and_chunk_tables() -> None:
    if _has_table("objection_category"):
        _drop_index_if_exists("uq_objection_category_external_uid_active", "objection_category")
        _drop_index_if_exists("ix_objection_category_project_id_active", "objection_category")
        op.drop_table("objection_category")

    if _has_table("objection_chunk"):
        _drop_index_if_exists("uq_objection_chunk_source_active", "objection_chunk")
        _drop_index_if_exists("ix_objection_chunk_project_id_active", "objection_chunk")
        op.drop_table("objection_chunk")


def _drop_root_and_history_columns() -> None:
    root_column_names = {name for name, _ in ROOT_COLUMNS}
    for table_name in ("objection", "objection_history"):
        for column_name, _ in ROOT_COLUMNS:
            _drop_column_if_exists(table_name, column_name)
        if table_name == "objection_history":
            for column_name, _ in HISTORY_COLUMNS:
                if column_name not in root_column_names:
                    _drop_column_if_exists(table_name, column_name)


def _restore_legacy_columns() -> None:
    for table_name in ("objection", "objection_history"):
        for column_name, column_type in OBSOLETE_ROOT_COLUMNS:
            _add_column_if_missing(table_name, column_name, column_type)

    for table_name in ("objection", "objection_history"):
        if table_name == "objection" and "objection_text" not in _column_names(table_name):
            op.add_column(
                table_name,
                sa.Column("objection_text", sa.Text(), nullable=False, server_default=""),
            )
            op.alter_column(table_name, "objection_text", server_default=None)

        for column_name, column_type in LEGACY_COLUMNS[1:]:
            _add_column_if_missing(table_name, column_name, column_type)

    if "objection_text" not in _column_names("objection_history"):
        op.add_column(
            "objection_history",
            sa.Column("objection_text", sa.Text(), nullable=True),
        )


def downgrade() -> None:
    """Downgrade schema."""
    _drop_objection_chunk_fks_and_indexes()
    _drop_objection_category_and_chunk_tables()
    _drop_root_and_history_columns()
    _restore_legacy_columns()
