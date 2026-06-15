"""Temporal table versioning utilities for Alembic migrations.

Provides helper functions to install the nearform/temporal_tables versioning
function and set up history tables + triggers for node-crud models.

Usage in an Alembic migration::

    from alembic_utils.temporal import install_versioning_function, setup_versioning_for_table

    def upgrade():
        install_versioning_function(op)
        setup_versioning_for_table(op, "my_table")

    def downgrade():
        teardown_versioning_for_table(op, "my_table")
        uninstall_versioning_function(op)

To enable automatic history table management in Alembic autogenerate,
wire up the hooks in your ``env.py``::

    from alembic_utils.temporal import build_versioning_hooks

    hooks = build_versioning_hooks(version="v1")

    context.configure(
        ...,
        include_name=hooks["include_name"],
        process_revision_directives=hooks["process_revision_directives"],
    )
"""

from __future__ import annotations

from functools import partial
from pathlib import Path
from typing import Any

from alembic import op as _op_type
from alembic.operations.ops import (
    AddColumnOp,
    CreateForeignKeyOp,
    CreateTableOp,
    DropColumnOp,
    DropConstraintOp,
    DropIndexOp,
    DropTableOp,
    ExecuteSQLOp,
    ModifyTableOps,
)
from sqlalchemy import Enum as SQLEnum
from sqlalchemy import String
from sqlalchemy import inspect as sa_inspect
from sqlalchemy.dialects.postgresql import TSTZRANGE
from sqlalchemy.exc import NoSuchTableError
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.elements import ColumnElement
from sqlalchemy.types import TypeDecorator


class SysPeriodType(TypeDecorator):
    """TSTZRANGE on PostgreSQL, TEXT on other dialects (e.g. SQLite for tests)."""

    impl = String
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == "postgresql":
            return dialect.type_descriptor(TSTZRANGE())
        return dialect.type_descriptor(String())


class _SysPeriodDefault(ColumnElement):
    """Server default that emits ``tstzrange()`` on PG and ``''`` on SQLite.

    Alembic autogenerate compares server defaults by building SQL expressions.
    ``ColumnElement`` makes this object coercible there; ``ClauseElement`` raises
    ``ArgumentError: SQL expression element or literal value expected``.
    """

    type = String()
    inherit_cache = True


@compiles(_SysPeriodDefault)
def _compile_sys_period_default(element, compiler, **kw):
    return "tstzrange(current_timestamp, null)"


@compiles(_SysPeriodDefault, "sqlite")
def _compile_sys_period_default_sqlite(element, compiler, **kw):
    return "''"


_SQL_DIR = Path(__file__).parent / "versioning"
_SYS_PERIOD = "sys_period"
_HISTORY_SUFFIX = "_history"
_EXTERNAL_TABLES = {"audit_log"}


def _read_sql(filename: str) -> str:
    return (_SQL_DIR / filename).read_text()


def install_versioning_function(op: _op_type, version: str) -> None:
    """Install the PL/pgSQL versioning() trigger function."""
    op.execute(_read_sql(f"functions_{version}.sql"))


def uninstall_versioning_function(op: _op_type) -> None:
    """Drop the versioning() trigger function."""
    op.execute("DROP FUNCTION IF EXISTS versioning() CASCADE")


def create_history_table(op: _op_type, table_name: str) -> None:
    """Create a history table mirroring the source table's structure."""
    history = f"{table_name}{_HISTORY_SUFFIX}"
    op.execute(f"CREATE TABLE {history} (LIKE {table_name} EXCLUDING ALL)")
    op.execute(f"CREATE INDEX ON {history} ({_SYS_PERIOD})")
    op.execute(f"CREATE INDEX ON {history} (id)")


def drop_history_table(op: _op_type, table_name: str) -> None:
    """Drop a history table."""
    op.execute(f"DROP TABLE IF EXISTS {table_name}{_HISTORY_SUFFIX} CASCADE")


def create_versioning_trigger(op: _op_type, table_name: str) -> None:
    """Create the versioning trigger on a table."""
    history = f"{table_name}{_HISTORY_SUFFIX}"
    if len(history) > 63:
        raise ValueError(
            f"Table name '{table_name}' is too long for versioning trigger "
            f"(must be at most {63 - len(_HISTORY_SUFFIX)} characters)"
        )
    op.execute(
        f"CREATE TRIGGER versioning_trigger "
        f"BEFORE INSERT OR UPDATE OR DELETE ON {table_name} "
        f"FOR EACH ROW EXECUTE PROCEDURE versioning("
        f"'{_SYS_PERIOD}', '{history}', true)"
    )


def drop_versioning_trigger(op: _op_type, table_name: str) -> None:
    """Drop the versioning trigger from a table."""
    op.execute(f"DROP TRIGGER IF EXISTS versioning_trigger ON {table_name}")


def setup_versioning_for_table(op: _op_type, table_name: str) -> None:
    """Set up complete temporal versioning for a table.

    Creates the history table and adds the versioning trigger.
    The source table must already have a ``sys_period`` column.
    """
    create_history_table(op, table_name)
    create_versioning_trigger(op, table_name)


def teardown_versioning_for_table(op: _op_type, table_name: str) -> None:
    """Remove temporal versioning from a table.

    Drops the trigger and history table.
    """
    drop_versioning_trigger(op, table_name)
    drop_history_table(op, table_name)


# ---------------------------------------------------------------------------
# Alembic autogenerate hooks
# ---------------------------------------------------------------------------


def _table_has_sys_period(table: Any) -> bool:
    """Check whether an Alembic CreateTableOp or SA Table has a sys_period column."""
    # Works for both alembic.operations.ops.CreateTableOp (has .columns)
    # and sqlalchemy.Table (has .columns too)
    return any(c.name == _SYS_PERIOD for c in table.columns)


def _is_history_table(name: str) -> bool:
    return name.endswith(_HISTORY_SUFFIX)


def _exclude_autogen_tables(name: str | None, type_: str, parent_names: dict[str, str | None]) -> bool:
    """Exclude tables managed outside each service's SQLAlchemy metadata."""
    if type_ == "table" and name is not None:
        if _is_history_table(name) or name in _EXTERNAL_TABLES:
            return False
    return True


def _target_tables(context: Any) -> dict[str, Any]:
    target_meta = context.opts.get("target_metadata")
    if target_meta is None:
        return {}

    metas = target_meta if isinstance(target_meta, list | tuple) else [target_meta]
    return {table.name: table for meta in metas for table in meta.sorted_tables}


def _current_primary_key_columns(context: Any, table: Any) -> tuple[str, ...]:
    connection = getattr(context, "connection", None)
    if connection is None:
        return ()

    inspector = sa_inspect(connection)
    try:
        pk = inspector.get_pk_constraint(table.name, schema=table.schema)
    except NoSuchTableError:
        return ()
    return tuple(pk.get("constrained_columns") or ())


def _primary_key_rebuild_ops(context: Any, table_name: str, target_tables: dict[str, Any]) -> list[Any]:
    table = target_tables.get(table_name)
    if table is None:
        return []

    target_columns = tuple(column.name for column in table.primary_key.columns)
    if "project_version" not in target_columns:
        return []

    current_columns = _current_primary_key_columns(context, table)
    if not current_columns or current_columns == target_columns:
        return []

    pk_name = f"{table_name}_pkey"
    column_sql = ", ".join(target_columns)
    return [
        ExecuteSQLOp(f"ALTER TABLE {table_name} DROP CONSTRAINT {pk_name}"),
        ExecuteSQLOp(f"ALTER TABLE {table_name} ADD CONSTRAINT {pk_name} PRIMARY KEY ({column_sql})"),
    ]


def _primary_key_restore_ops(context: Any, table_name: str, target_tables: dict[str, Any]) -> list[Any]:
    table = target_tables.get(table_name)
    if table is None:
        return []

    current_columns = _current_primary_key_columns(context, table)
    if not current_columns:
        return []

    pk_name = f"{table_name}_pkey"
    column_sql = ", ".join(current_columns)
    return [
        ExecuteSQLOp(f"ALTER TABLE {table_name} DROP CONSTRAINT {pk_name}"),
        ExecuteSQLOp(f"ALTER TABLE {table_name} ADD CONSTRAINT {pk_name} PRIMARY KEY ({column_sql})"),
    ]


def _create_table_references_rebuilt_pk(op_container: CreateTableOp, rebuilt_tables: set[str]) -> bool:
    table = op_container.to_table()
    return any(fk.referred_table.name in rebuilt_tables for fk in table.foreign_key_constraints)


def _incoming_foreign_keys(
    context: Any, rebuilt_tables: set[str]
) -> tuple[dict[tuple[str, str], DropConstraintOp], dict[tuple[str, str, tuple[str, ...]], str]]:
    connection = getattr(context, "connection", None)
    if connection is None:
        return {}, {}

    inspector = sa_inspect(connection)
    drops: dict[tuple[str, str], DropConstraintOp] = {}
    names_by_recreated_shape: dict[tuple[str, str, tuple[str, ...]], str] = {}
    for table_name in inspector.get_table_names():
        for foreign_key in inspector.get_foreign_keys(table_name):
            fk_name = foreign_key.get("name")
            if fk_name and foreign_key.get("referred_table") in rebuilt_tables:
                drops[(table_name, fk_name)] = DropConstraintOp(fk_name, table_name, type_="foreignkey")
                names_by_recreated_shape[
                    (
                        table_name,
                        foreign_key["referred_table"],
                        tuple(foreign_key.get("constrained_columns") or ()),
                    )
                ] = fk_name
    return drops, names_by_recreated_shape


def _enum_type_create_ops(context: Any, upgrade_ops: list[Any]) -> list[ExecuteSQLOp]:
    if context.dialect.name != "postgresql":
        return []

    enum_types: dict[str, tuple[str, ...]] = {}

    def collect_column(column: Any) -> None:
        column_type = getattr(column, "type", None)
        if isinstance(column_type, SQLEnum) and column_type.name:
            enum_types.setdefault(column_type.name, tuple(column_type.enums))

    for op_container in upgrade_ops:
        if isinstance(op_container, ModifyTableOps):
            for table_op in op_container.ops:
                if isinstance(table_op, AddColumnOp):
                    collect_column(table_op.column)

    ops: list[ExecuteSQLOp] = []
    for enum_name, values in enum_types.items():
        value_sql = ", ".join(f"'{value.replace("'", "''")}'" for value in values)
        ops.append(
            ExecuteSQLOp(
                f"DO $$ BEGIN CREATE TYPE {enum_name} AS ENUM ({value_sql}); "
                f"EXCEPTION WHEN duplicate_object THEN NULL; END $$;"
            )
        )
    return ops


def _move_rebuilt_pk_foreign_keys(
    table_ops: list[Any],
    rebuilt_tables: set[str],
    incoming_fk_drops: dict[tuple[str, str], DropConstraintOp],
    incoming_fk_names: dict[tuple[str, str, tuple[str, ...]], str],
    pre_fk_drop_ops: list[DropConstraintOp],
    post_fk_create_ops: list[CreateForeignKeyOp],
) -> list[Any]:
    kept_ops: list[Any] = []
    emitted_drop_keys = {(op.table_name, op.constraint_name) for op in pre_fk_drop_ops}

    for table_op in table_ops:
        if isinstance(table_op, DropConstraintOp) and table_op.constraint_type == "foreignkey":
            key = (table_op.table_name, str(table_op.constraint_name))
            if key in incoming_fk_drops:
                if key not in emitted_drop_keys:
                    pre_fk_drop_ops.append(table_op)
                    emitted_drop_keys.add(key)
                continue
        if isinstance(table_op, CreateForeignKeyOp) and table_op.referent_table in rebuilt_tables:
            previous_fk_name = incoming_fk_names.get(
                (
                    table_op.source_table,
                    table_op.referent_table,
                    tuple(col for col in table_op.local_cols if col != "project_version"),
                )
            )
            if previous_fk_name and table_op.constraint_name is None:
                table_op.constraint_name = previous_fk_name
            post_fk_create_ops.append(table_op)
            continue
        kept_ops.append(table_op)

    return kept_ops


def _add_primary_key_rebuild_ops(table_ops: list[Any], pk_ops: list[Any]) -> list[Any]:
    if not pk_ops:
        return table_ops
    if any(isinstance(op, ExecuteSQLOp) and " PRIMARY KEY " in str(op.sqltext).upper() for op in table_ops):
        return table_ops

    insert_at = len(table_ops)
    for index, table_op in enumerate(table_ops):
        if isinstance(table_op, AddColumnOp) and table_op.column.name == "project_version":
            insert_at = index + 1
            break
    return [*table_ops[:insert_at], *pk_ops, *table_ops[insert_at:]]


def _rewrite_downgrade_ops(
    ops: list[Any],
    rebuilt_pk_tables: set[str],
    deferred_table_names: set[str],
    incoming_fk_names: set[str],
    pk_restore_ops_by_table: dict[str, list[Any]],
    pre_table_drop_ops: list[Any],
    pre_fk_drop_ops: list[DropConstraintOp],
    post_fk_create_ops: list[CreateForeignKeyOp],
) -> list[Any]:
    kept_ops: list[Any] = []
    emitted_drop_keys = {(op.table_name, op.constraint_name) for op in pre_fk_drop_ops}

    for index, op_container in enumerate(ops):
        nested_ops = getattr(op_container, "ops", None)
        if nested_ops is not None:
            op_container.ops = _rewrite_downgrade_ops(
                nested_ops,
                rebuilt_pk_tables,
                deferred_table_names,
                incoming_fk_names,
                pk_restore_ops_by_table,
                pre_table_drop_ops,
                pre_fk_drop_ops,
                post_fk_create_ops,
            )
            if op_container.ops:
                kept_ops.append(op_container)
            continue

        if isinstance(op_container, (DropIndexOp, DropTableOp)) and op_container.table_name in deferred_table_names:
            pre_table_drop_ops.append(op_container)
            continue

        if isinstance(op_container, DropConstraintOp) and op_container.constraint_type == "foreignkey":
            if op_container.constraint_name is None:
                for table_op in ops[index + 1 :]:
                    if isinstance(table_op, CreateForeignKeyOp) and table_op.source_table == op_container.table_name:
                        op_container.constraint_name = table_op.constraint_name
                        break
            if op_container.constraint_name not in incoming_fk_names:
                kept_ops.append(op_container)
                continue

            key = (op_container.table_name, op_container.constraint_name)
            if key not in emitted_drop_keys:
                pre_fk_drop_ops.append(op_container)
                emitted_drop_keys.add(key)
            continue

        if (
            isinstance(op_container, CreateForeignKeyOp)
            and op_container.constraint_name in incoming_fk_names
            and op_container.referent_table in rebuilt_pk_tables
        ):
            post_fk_create_ops.append(op_container)
            continue

        if (
            isinstance(op_container, DropColumnOp)
            and op_container.column_name == "project_version"
            and op_container.table_name in rebuilt_pk_tables
        ):
            kept_ops.extend(pk_restore_ops_by_table.get(op_container.table_name, []))

        kept_ops.append(op_container)

    return kept_ops


def _history_setup_ops(table_name: str) -> list[ExecuteSQLOp]:
    history = f"{table_name}{_HISTORY_SUFFIX}"
    return [
        ExecuteSQLOp(f"CREATE TABLE {history} (LIKE {table_name} EXCLUDING ALL)"),
        ExecuteSQLOp(f"CREATE INDEX ON {history} ({_SYS_PERIOD})"),
        ExecuteSQLOp(f"CREATE INDEX ON {history} (id)"),
        ExecuteSQLOp(
            f"CREATE TRIGGER versioning_trigger "
            f"BEFORE INSERT OR UPDATE OR DELETE ON {table_name} "
            f"FOR EACH ROW EXECUTE PROCEDURE versioning("
            f"'{_SYS_PERIOD}', '{history}', true)"
        ),
    ]


def _history_column_ops(context: Any, table_name: str, table_ops: list[Any]) -> tuple[bool, list[ExecuteSQLOp]]:
    history = f"{table_name}{_HISTORY_SUFFIX}"
    needs_versioning_function = False
    history_ops: list[ExecuteSQLOp] = []

    for table_op in table_ops:
        if isinstance(table_op, AddColumnOp):
            if table_op.column.name == _SYS_PERIOD:
                needs_versioning_function = True
                history_ops.extend(_history_setup_ops(table_name))
            else:
                history_ops.append(
                    ExecuteSQLOp(
                        f"ALTER TABLE {history} ADD COLUMN "
                        f"{table_op.column.name} "
                        f"{table_op.column.type.compile(dialect=context.dialect)}"
                    )
                )
        elif isinstance(table_op, DropColumnOp) and table_op.column_name != _SYS_PERIOD:
            history_ops.append(ExecuteSQLOp(f"ALTER TABLE {history} ALTER COLUMN {table_op.column_name} DROP NOT NULL"))

    return needs_versioning_function, history_ops


def _prepend_history_drop_ops(new_ops: list[Any], table_name: str) -> None:
    history = f"{table_name}{_HISTORY_SUFFIX}"
    insert_at = len(new_ops) - 1
    new_ops.insert(insert_at, ExecuteSQLOp(f"DROP TRIGGER IF EXISTS versioning_trigger ON {table_name}"))
    new_ops.insert(insert_at + 1, ExecuteSQLOp(f"DROP TABLE IF EXISTS {history} CASCADE"))


def _process_temporal_directives(
    context: Any,
    revision: Any,
    directives: list[Any],
    version,
) -> None:
    """Alembic ``process_revision_directives`` callback.

    Walks the auto-generated upgrade ops and appends history-table
    management operations for tables that use ``VersionedMixin``.
    """
    if not directives:
        return

    script = directives[0]
    upgrade_ops = script.upgrade_ops
    if upgrade_ops is None:
        return

    target_tables = _target_tables(context)
    versioned_tables = {table.name for table in target_tables.values() if _table_has_sys_period(table)}
    pk_rebuild_ops_by_table = {
        table_name: pk_ops
        for table_name in versioned_tables
        if (pk_ops := _primary_key_rebuild_ops(context, table_name, target_tables))
    }
    pk_restore_ops_by_table = {
        table_name: _primary_key_restore_ops(context, table_name, target_tables)
        for table_name in pk_rebuild_ops_by_table
    }
    rebuilt_pk_tables = set(pk_rebuild_ops_by_table)
    incoming_fk_drops, incoming_fk_names = _incoming_foreign_keys(context, rebuilt_pk_tables)
    pre_fk_drop_ops: list[DropConstraintOp] = []
    post_fk_create_ops: list[CreateForeignKeyOp] = []
    deferred_ops: list[Any] = []
    deferred_table_names = {
        op_container.table_name
        for op_container in upgrade_ops.ops
        if isinstance(op_container, CreateTableOp)
        and _create_table_references_rebuilt_pk(op_container, rebuilt_pk_tables)
    }
    new_ops: list[Any] = []
    needs_versioning_function = False

    for op_container in upgrade_ops.ops:
        deferred_target = getattr(op_container, "table_name", None) in deferred_table_names
        target_ops = deferred_ops if deferred_target else new_ops

        if isinstance(op_container, CreateTableOp):
            target_ops.append(op_container)
            if _table_has_sys_period(op_container):
                needs_versioning_function = True
                target_ops.extend(_history_setup_ops(op_container.table_name))

        elif isinstance(op_container, ModifyTableOps):
            table_name = op_container.table_name
            op_container.ops = _move_rebuilt_pk_foreign_keys(
                op_container.ops,
                rebuilt_pk_tables,
                incoming_fk_drops,
                incoming_fk_names,
                pre_fk_drop_ops,
                post_fk_create_ops,
            )
            if table_name in versioned_tables:
                op_container.ops = _add_primary_key_rebuild_ops(
                    op_container.ops,
                    pk_rebuild_ops_by_table.get(table_name, []),
                )
            if op_container.ops:
                target_ops.append(op_container)
            if table_name not in versioned_tables:
                continue

            needs_function_for_table, history_ops = _history_column_ops(context, table_name, op_container.ops)
            needs_versioning_function = needs_versioning_function or needs_function_for_table
            target_ops.extend(history_ops)

        elif isinstance(op_container, DropTableOp):
            target_ops.append(op_container)
            _prepend_history_drop_ops(target_ops, op_container.table_name)

        else:
            target_ops.append(op_container)

    emitted_drop_keys = {(op.table_name, str(op.constraint_name)) for op in pre_fk_drop_ops}
    for key, drop_op in incoming_fk_drops.items():
        if key not in emitted_drop_keys:
            pre_fk_drop_ops.append(drop_op)

    new_ops = [
        *_enum_type_create_ops(context, upgrade_ops.ops),
        *pre_fk_drop_ops,
        *new_ops,
        *deferred_ops,
        *post_fk_create_ops,
    ]

    # If any new versioned table was created, prepend the versioning function install
    if needs_versioning_function:
        versioning_sql = _read_sql(f"functions_{version}.sql")
        new_ops.insert(0, ExecuteSQLOp(versioning_sql))

    upgrade_ops.ops = new_ops
    if script.downgrade_ops is not None:
        downgrade_table_drop_ops: list[Any] = []
        downgrade_fk_drop_ops: list[DropConstraintOp] = []
        downgrade_fk_create_ops: list[CreateForeignKeyOp] = []
        rewritten_downgrade_ops = _rewrite_downgrade_ops(
            script.downgrade_ops.ops,
            rebuilt_pk_tables,
            deferred_table_names,
            set(incoming_fk_names.values()),
            pk_restore_ops_by_table,
            downgrade_table_drop_ops,
            downgrade_fk_drop_ops,
            downgrade_fk_create_ops,
        )
        script.downgrade_ops.ops = [
            *downgrade_table_drop_ops,
            *downgrade_fk_drop_ops,
            *rewritten_downgrade_ops,
            *downgrade_fk_create_ops,
        ]


def build_versioning_hooks(version: str) -> dict[str, Any]:
    """Return Alembic hooks for automatic temporal versioning.

    Wire these into your ``env.py``::

        from alembic_utils.temporal import build_versioning_hooks

        hooks = build_versioning_hooks(version="v1")

        context.configure(
            ...,
            include_name=hooks["include_name"],
            process_revision_directives=hooks["process_revision_directives"],
        )
    """
    return {
        "include_name": _exclude_autogen_tables,
        "process_revision_directives": partial(_process_temporal_directives, version=version),
    }


class VersionedMixin:
    """Mixin that adds a ``sys_period`` column for temporal table versioning.

    Tables that inherit from this mixin can be paired with a ``_history``
    shadow table and a versioning trigger (see ``alembic_utils.temporal``).
    """

    sys_period: Mapped[Any] = mapped_column(
        SysPeriodType(),
        nullable=False,
        server_default=_SysPeriodDefault(),
    )
