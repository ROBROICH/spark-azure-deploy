import re
from collections import defaultdict
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import date, datetime, time
from enum import Enum as PyEnum
from typing import Any, TypedDict
from uuid import UUID, uuid4

from audit_client import ChangeType, audit_log_table
from pydantic import BaseModel
from sqlalchemy import (
    Boolean,
    Integer,
    Select,
    String,
    any_,
    bindparam,
    case,
    cast,
    column,
    delete,
    func,
    insert,
    literal_column,
    select,
    union_all,
    update,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.dialects.postgresql import ARRAY, JSON, JSONB, aggregate_order_by
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.dialects.postgresql import array as pg_array
from sqlalchemy.engine import MappingResult
from sqlalchemy.ext.asyncio import AsyncScalarResult, AsyncSession
from sqlalchemy.sql.elements import ColumnElement

from node_crud.base import NodeModelBase, NodeType
from node_crud.exceptions import NodeNotFoundError
from node_crud.registry import (
    NodeModelRegistry,
    ParentForeignKeyMap,
    get_model_for_type,
)

_SYSTEM_MANAGED_FIELDS = {
    "id",
    "project_id",
    "project_version",
    "created_at",
    "updated_at",
    "is_deleted",
    "sys_period",
}
_COLUMN_NAME_PATTERN = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


@dataclass(frozen=True)
class NodeRef:
    id: UUID
    node_type: NodeType


@dataclass(frozen=True)
class CopyVersionNodeDirective:
    id: UUID
    node_type: NodeType
    set_outdated: bool = False
    overrides: dict[str, Any] = field(default_factory=dict)


class NodeResult(TypedDict):
    node_type: NodeType
    payload: dict[str, Any]


@dataclass(frozen=True)
class CreateNodeChange:
    node_type: NodeType
    payload: BaseModel
    project_id: UUID
    id: UUID = field(default_factory=uuid4)


@dataclass(frozen=True)
class PatchNodeChange:
    id: UUID
    node_type: NodeType
    payload: BaseModel


@dataclass(frozen=True)
class DeleteNodeChange:
    id: UUID
    node_type: NodeType


@dataclass(frozen=True)
class NamedMutationStatement:
    name: str
    statement: Any


class DeleteNodePayload(TypedDict):
    id: UUID


class DeleteNodeResult(TypedDict):
    node_type: NodeType
    payload: DeleteNodePayload


class CopyVersionResult(TypedDict):
    copied: int


class ProcessUpdateResult(TypedDict):
    inserted: list[NodeResult]
    updated: list[NodeResult]
    deleted: list[DeleteNodeResult]


def _node_type_key(node_type: NodeType) -> str:
    return node_type.value if isinstance(node_type, PyEnum) else str(node_type)


def _validate_column_name(column_name: str) -> str:
    if column_name in _SYSTEM_MANAGED_FIELDS:
        raise ValueError(f"Blocked payload column: {column_name}")
    if _COLUMN_NAME_PATTERN.fullmatch(column_name) is None:
        raise ValueError(f"Invalid payload column: {column_name}")
    return column_name


def _json_build_object_args(model: type[NodeModelBase], source: Any | None = None) -> list[Any]:
    args: list[Any] = []
    table = model.__table__  # pyrefly: ignore[missing-attribute]

    for col in table.columns:
        args.append(literal_column(f"'{col.key}'"))
        attr = source.c[col.key] if source is not None else getattr(model, col.key)
        if isinstance(col.type, SAEnum):
            # SAEnum stores the python ``Enum`` *name* (e.g. ``AUTOMATED``)
            # but the generated response schemas validate against the *value*
            # (e.g. ``automated``). Map name → value via a CASE so the JSON
            # output round-trips through Pydantic regardless of whether the
            # enum's name/value happen to match.
            enum_class = getattr(col.type, "enum_class", None)
            text_attr = cast(attr, String)
            if enum_class is not None:
                whens = [
                    (text_attr == literal_column(f"'{member.name}'"), literal_column(f"'{member.value}'"))
                    for member in enum_class
                ]
                args.append(case(*whens, else_=text_attr))
            else:
                args.append(text_attr)
        else:
            args.append(attr)

    return args


def _ids_array(node_type: NodeType, ids: set[UUID]) -> Any:
    node_key = _node_type_key(node_type)
    return any_(bindparam(f"{node_key}_ids", value=list(ids), type_=ARRAY(PG_UUID(as_uuid=True))))


def _as_node_ref(node: NodeRef | CopyVersionNodeDirective) -> NodeRef:
    return NodeRef(id=node.id, node_type=node.node_type)


def _dedupe_copy_directives(
    nodes: list[NodeRef | CopyVersionNodeDirective],
) -> list[CopyVersionNodeDirective]:
    merged: dict[tuple[NodeType, UUID], CopyVersionNodeDirective] = {}
    for node in nodes:
        directive = (
            node
            if isinstance(node, CopyVersionNodeDirective)
            else CopyVersionNodeDirective(id=node.id, node_type=node.node_type)
        )
        key = (directive.node_type, directive.id)
        existing = merged.get(key)
        if existing is None:
            merged[key] = directive
            continue

        overrides = dict(existing.overrides)
        for column_name, value in directive.overrides.items():
            if column_name in overrides and overrides[column_name] != value:
                raise ValueError(
                    f"Conflicting copy-version override for {_node_type_key(directive.node_type)}:{directive.id}"
                )
            overrides[column_name] = value
        merged[key] = CopyVersionNodeDirective(
            id=directive.id,
            node_type=directive.node_type,
            set_outdated=existing.set_outdated or directive.set_outdated,
            overrides=overrides,
        )
    return sorted(merged.values(), key=lambda node: (_node_type_key(node.node_type), str(node.id)))


def _copy_override_value(input_cte: Any, col: Any) -> Any:
    override_json = input_cte.c.overrides[col.key]
    if isinstance(col.type, (JSON, JSONB)):
        return override_json
    return cast(input_cte.c.overrides.op("->>")(col.key), col.type)


def _mutation_cte_select(cte: Any) -> Select[Any]:
    return select(cte.c.ord, cte.c.op, cte.c.node_type, cte.c.payload)


def _mutation_result_cte(name: str, statements: list[NamedMutationStatement]) -> Any | None:
    if not statements:
        return None

    row_ctes = [statement.statement.cte(statement.name) for statement in statements]
    selects = [_mutation_cte_select(cte) for cte in row_ctes]
    return (selects[0] if len(selects) == 1 else union_all(*selects)).cte(name)


def _mutation_result_array(result_cte: Any | None) -> Any:
    if result_cte is None:
        return literal_column("'[]'::json")

    row_obj = func.json_build_object(
        literal_column("'node_type'"),
        result_cte.c.node_type,
        literal_column("'payload'"),
        result_cte.c.payload,
    )

    return (
        select(
            func.coalesce(
                func.json_agg(aggregate_order_by(row_obj, result_cte.c.ord)),
                literal_column("'[]'::json"),
            )
        )
        .select_from(result_cte)
        .scalar_subquery()
    )


def _build_mutation_params_cte(project_id: UUID, project_version: int) -> Any:
    return select(
        bindparam("project_id", value=project_id, type_=PG_UUID(as_uuid=True)).label("project_id"),
        bindparam("project_version", value=project_version, type_=Integer()).label("project_version"),
        func.now().label("ts"),
        literal_column("false").label("is_deleted"),
    ).cte("mutation_params")


def _payload_columns_for_model(model: type[NodeModelBase]) -> dict[str, Any]:
    table = model.__table__  # pyrefly: ignore[missing-attribute]
    return {col.key: col for col in table.columns if col.key not in _SYSTEM_MANAGED_FIELDS}


def _enum_to_db_label(value: Any, enum_type: SAEnum) -> Any:
    if value is None:
        return None

    labels = list(enum_type.enums)

    if isinstance(value, PyEnum):
        candidates = [value.name, str(value.value)]
    else:
        text_value = str(value)
        candidates = [text_value, text_value.upper(), text_value.lower()]

    for candidate in candidates:
        if candidate in labels:
            return candidate

    if isinstance(value, PyEnum):
        return value.name

    return str(value)


def _to_json_compatible(value: Any, sql_type: Any | None) -> Any:
    if value is None:
        return None

    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")

    if isinstance(sql_type, ARRAY):
        return [_to_json_compatible(item, sql_type.item_type) for item in value]

    if isinstance(sql_type, SAEnum):
        return _enum_to_db_label(value, sql_type)

    if isinstance(value, UUID):
        return str(value)

    if isinstance(value, (datetime, date, time)):
        return value.isoformat()

    if isinstance(value, PyEnum):
        return value.value

    if isinstance(value, list):
        return [_to_json_compatible(item, None) for item in value]

    if isinstance(value, dict):
        return {str(key): _to_json_compatible(item, None) for key, item in value.items()}

    return value


def _validate_and_encode_payload(
    model: type[NodeModelBase],
    payload: dict[str, Any],
) -> dict[str, Any]:
    allowed_columns = _payload_columns_for_model(model)
    encoded: dict[str, Any] = {}

    for column_name, value in payload.items():
        safe_name = _validate_column_name(column_name)
        column_obj = allowed_columns.get(safe_name)
        if column_obj is None:
            table = model.__table__  # pyrefly: ignore[missing-attribute]
            raise ValueError(f"Unknown or blocked payload column for {table.name}: {column_name}")
        encoded[safe_name] = _to_json_compatible(value, column_obj.type)

    return encoded


def _normalize_insert_payload(
    model: type[NodeModelBase],
    payload: dict[str, Any],
) -> dict[str, Any]:
    table = model.__table__  # pyrefly: ignore[missing-attribute]
    normalized = dict(payload)

    if "frontend_parent_ids" in table.c and "frontend_parent_ids" not in normalized:
        normalized["frontend_parent_ids"] = []

    return _validate_and_encode_payload(model, normalized)


def _jsonb_recordset_cte(
    *,
    cte_name: str,
    param_name: str,
    payload: list[dict[str, Any]],
    column_specs: list[Any],
) -> Any:
    tvf = (
        func.jsonb_to_recordset(bindparam(param_name, value=payload, type_=JSONB))
        .table_valued(*column_specs)
        .render_derived(name=f"{cte_name}_src", with_types=True)
    )

    return select(*(tvf.c[spec.name] for spec in column_specs)).cte(cte_name)


def _project_scope_filters(
    target: Any,
    project_id: UUID | Any,
    project_version: int | Any,
    *,
    only_active: bool = True,
) -> list[ColumnElement[bool]]:
    """Return the standard ``project_id`` / ``project_version`` filter clauses.

    Works with either a mapped model class (``model.project_id``) or a Core
    ``Table`` (``table.c.project_id``). When ``only_active`` is true the
    standard ``is_deleted IS false`` clause gets appended.
    """
    columns = target.c if hasattr(target, "c") else target

    clauses: list[ColumnElement[bool]] = [
        columns.project_id == project_id,
        columns.project_version == project_version,
    ]
    if only_active:
        clauses.append(columns.is_deleted.is_(False))
    return clauses


class NodeService:
    """Provides bulk CRUD operations with optimized SQL generation."""

    def __init__(
        self,
        model_registry: NodeModelRegistry,
        parent_fk_map: ParentForeignKeyMap,
    ) -> None:
        self._registry = model_registry
        self._fk_map = parent_fk_map

    def _get_model(self, node_type: NodeType) -> type[NodeModelBase]:
        return get_model_for_type(node_type, self._registry)

    def _delete_ordered_registry(self) -> list[tuple[NodeType, type[NodeModelBase]]]:
        children_by_parent: dict[NodeType, set[NodeType]] = defaultdict(set)
        for child_type, parent_cols in self._fk_map.items():
            if child_type not in self._registry:
                continue
            for parent_type in parent_cols.values():
                if parent_type in self._registry and parent_type != child_type:
                    children_by_parent[parent_type].add(child_type)

        ordered: list[NodeType] = []
        visiting: set[NodeType] = set()
        visited: set[NodeType] = set()

        def visit(node_type: NodeType) -> None:
            if node_type in visited:
                return
            if node_type in visiting:
                raise ValueError(f"Cycle detected in node rollback dependencies at {_node_type_key(node_type)}")

            visiting.add(node_type)
            for child_type in sorted(children_by_parent.get(node_type, ()), key=_node_type_key):
                visit(child_type)
            visiting.remove(node_type)
            visited.add(node_type)
            ordered.append(node_type)

        for node_type in sorted(self._registry, key=_node_type_key):
            visit(node_type)

        return [(node_type, self._registry[node_type]) for node_type in ordered]

    def _validate_process_update_inputs(
        self,
        inserts: list[CreateNodeChange],
        updates: list[PatchNodeChange],
        deletes: list[DeleteNodeChange],
        project_id: UUID,
    ) -> None:
        insert_keys: set[tuple[NodeType, UUID]] = set()
        for change in inserts:
            if change.project_id != project_id:
                raise ValueError(
                    f"Insert project_id mismatch for {_node_type_key(change.node_type)}:{change.id} "
                    f"(change.project_id={change.project_id}, request.project_id={project_id})"
                )
            key = (change.node_type, change.id)
            if key in insert_keys:
                raise ValueError(f"Duplicate insert id for {_node_type_key(change.node_type)}: {change.id}")
            insert_keys.add(key)

        update_keys: set[tuple[NodeType, UUID]] = set()
        for change in updates:
            if not change.payload.model_dump(exclude_unset=True):
                continue
            key = (change.node_type, change.id)
            if key in update_keys:
                raise ValueError(f"Duplicate update id for {_node_type_key(change.node_type)}: {change.id}")
            update_keys.add(key)

        delete_keys = {(change.node_type, change.id) for change in deletes}

        conflicts = (insert_keys & update_keys) | (insert_keys & delete_keys) | (update_keys & delete_keys)
        if conflicts:
            rendered = ", ".join(
                f"{_node_type_key(node_type)}:{node_id}"
                for node_type, node_id in sorted(conflicts, key=lambda item: (_node_type_key(item[0]), str(item[1])))
            )
            raise ValueError(f"Same node targeted by multiple mutation kinds in one statement: {rendered}")

    def _validate_insert_changes(
        self,
        inserts: list[CreateNodeChange],
        project_id: UUID,
    ) -> None:
        seen: set[tuple[NodeType, UUID]] = set()

        for change in inserts:
            if change.project_id != project_id:
                raise ValueError(
                    f"Insert project_id mismatch for {_node_type_key(change.node_type)}:{change.id} "
                    f"(change.project_id={change.project_id}, request.project_id={project_id})"
                )

            key = (change.node_type, change.id)
            if key in seen:
                raise ValueError(f"Duplicate insert id for {_node_type_key(change.node_type)}: {change.id}")
            seen.add(key)

    def _validate_update_changes(self, updates: list[PatchNodeChange]) -> None:
        seen: set[tuple[NodeType, UUID]] = set()

        for change in updates:
            if not change.payload.model_dump(exclude_unset=True):
                continue

            key = (change.node_type, change.id)
            if key in seen:
                raise ValueError(f"Duplicate update id for {_node_type_key(change.node_type)}: {change.id}")
            seen.add(key)

    def _build_parents_json_without_nulls(
        self,
        node_type: NodeType,
        model: type[NodeModelBase],
    ) -> Any:
        parent_candidates = [
            case(
                (
                    getattr(model, fk).is_not(None),
                    func.json_build_object(
                        literal_column("'id'"),
                        getattr(model, fk),
                        literal_column("'node_type'"),
                        literal_column(f"'{_node_type_key(parent_type)}'"),
                    ),
                ),
                else_=None,
            )
            for fk, parent_type in self._fk_map[node_type].items()
        ]

        if not parent_candidates:
            return literal_column("'[]'::json")

        parent_rows = (
            func.unnest(pg_array(parent_candidates, type_=JSON))
            .table_valued(column("parent_json", JSON))
            .render_derived()
        )

        return (
            select(
                func.coalesce(
                    func.json_agg(parent_rows.c.parent_json),
                    literal_column("'[]'::json"),
                )
            )
            .select_from(parent_rows)
            .where(parent_rows.c.parent_json.is_not(None))
            .scalar_subquery()
        )

    def _build_node_summary_json(
        self,
        node_type: NodeType,
        model: type[NodeModelBase],
    ) -> Any:
        return cast(
            func.json_build_object(
                literal_column("'id'"),
                model.id,
                literal_column("'node_type'"),
                literal_column(f"'{_node_type_key(node_type)}'"),
                literal_column("'parents'"),
                self._build_parents_json_without_nulls(node_type, model),
                literal_column("'frontend_parent_ids'"),
                func.coalesce(
                    func.array_to_json(model.frontend_parent_ids),
                    literal_column("'[]'::json"),
                ),
                literal_column("'is_outdated'"),
                model.is_outdated,
            ),
            String,
        )

    async def _stream_json_array(self, rows: AsyncScalarResult[str]) -> AsyncIterator[bytes]:
        yield b'{"nodes":['

        first_item = True

        async for partition in rows.partitions():
            if not partition:
                continue

            chunk = ",".join(partition).encode("utf-8")
            if first_item:
                first_item = False
                yield chunk
            else:
                yield b"," + chunk

        yield b"]}"

    # ── Read operations ────────────────────────────────────────────────

    async def stream_all_nodes_json(
        self, project_id: UUID, db: AsyncSession, project_version: int
    ) -> AsyncIterator[bytes]:
        """Stream the `/nodes` response body as JSON rows produced by Postgres."""
        project_id_param = bindparam("project_id", value=project_id, type_=PG_UUID(as_uuid=True))
        project_version_param = bindparam("project_version", value=project_version, type_=Integer())

        statements = []
        for node_type, model in self._registry.items():
            where_clauses = _project_scope_filters(model, project_id_param, project_version_param)

            statements.append(
                select(
                    self._build_node_summary_json(node_type, model).label("node_json"),
                ).where(
                    *where_clauses,
                )
            )

        if not statements:

            async def empty_payload() -> AsyncIterator[bytes]:
                yield b'{"nodes":[]}'

            return empty_payload()

        statement = statements[0] if len(statements) == 1 else union_all(*statements)

        async def stream() -> AsyncIterator[bytes]:
            result = (await db.stream_scalars(statement)).yield_per(2048)

            try:
                async for chunk in self._stream_json_array(result):
                    yield chunk
            finally:
                await result.close()

        return stream()

    async def batch_get_nodes(
        self,
        project_id: UUID,
        nodes: list[NodeRef],
        db: AsyncSession,
        project_version: int,
    ) -> list[NodeResult]:
        """Read selected active nodes for one project version in one UNION query."""
        grouped: dict[NodeType, set[UUID]] = defaultdict(set)
        for node in nodes:
            grouped[node.node_type].add(node.id)

        if not grouped:
            return []

        project_id_param = bindparam("project_id", value=project_id, type_=PG_UUID(as_uuid=True))
        project_version_param = bindparam("project_version", value=project_version, type_=Integer())

        statements = [
            select(
                literal_column(f"'{_node_type_key(node_type)}'").label("node_type"),
                func.json_build_object(*_json_build_object_args(model)).label("payload"),
            ).where(
                *_project_scope_filters(model, project_id_param, project_version_param),
                model.id == _ids_array(node_type, ids),
            )
            for node_type, ids in grouped.items()
            for model in [self._get_model(node_type)]
        ]

        statement = statements[0] if len(statements) == 1 else union_all(*statements)
        result = await db.execute(statement)
        return [{"node_type": row["node_type"], "payload": row["payload"]} for row in result.mappings()]

    # ── Mutation query builders ────────────────────────────────────────

    def build_insert_queries(
        self,
        inserts: list[CreateNodeChange],
        project_id: UUID,
        params_cte: Any,
    ) -> list[NamedMutationStatement]:
        """Build grouped INSERT statements from JSONB payload rows."""
        if not inserts:
            return []

        self._validate_insert_changes(inserts, project_id)

        rows_by_type: dict[NodeType, list[dict[str, Any]]] = defaultdict(list)

        for ord_, change in enumerate(inserts, start=1):
            model = self._get_model(change.node_type)
            payload = _normalize_insert_payload(
                model,
                change.payload.model_dump(exclude_unset=True),
            )
            rows_by_type[change.node_type].append(
                {
                    "ord": ord_,
                    "id": str(change.id),
                    **payload,
                }
            )

        statements: list[NamedMutationStatement] = []

        for node_type, rows in rows_by_type.items():
            node_key = _node_type_key(node_type)
            model = self._get_model(node_type)
            table = model.__table__  # pyrefly: ignore[missing-attribute]

            present_columns = {
                column_name for row in rows for column_name in row.keys() if column_name not in {"ord", "id"}
            }
            insertable_columns = [
                col.key for col in table.columns if col.key not in _SYSTEM_MANAGED_FIELDS and col.key in present_columns
            ]
            input_columns = [
                column("ord", Integer()),
                column("id", table.c.id.type),
                *(column(column_name, table.c[column_name].type) for column_name in insertable_columns),
            ]

            input_cte = _jsonb_recordset_cte(
                cte_name=f"{node_key}_insert_input",
                param_name=f"{node_key}_insert_rows",
                payload=rows,
                column_specs=input_columns,
            )

            target_column_names = [
                "id",
                "project_id",
                "project_version",
                "is_deleted",
                "created_at",
                "updated_at",
                *insertable_columns,
            ]

            source_select = (
                select(
                    input_cte.c.id,
                    params_cte.c.project_id,
                    params_cte.c.project_version,
                    params_cte.c.is_deleted,
                    params_cte.c.ts,
                    params_cte.c.ts,
                    *(input_cte.c[column_name] for column_name in insertable_columns),
                )
                .select_from(input_cte)
                .select_from(params_cte)
            )

            insert_dml = (
                insert(table)
                .from_select(target_column_names, source_select, include_defaults=False)
                .returning(*table.columns)
                .cte(f"{node_key}_insert_dml")
            )

            result_select = select(
                input_cte.c.ord.label("ord"),
                literal_column("'insert'").label("op"),
                literal_column(f"'{node_key}'").label("node_type"),
                func.json_build_object(*_json_build_object_args(model, source=insert_dml)).label("payload"),
            ).select_from(insert_dml.join(input_cte, insert_dml.c.id == input_cte.c.id))

            statements.append(
                NamedMutationStatement(
                    name=f"insert_{node_key}",
                    statement=result_select,
                )
            )

        return statements

    def build_update_queries(
        self,
        updates: list[PatchNodeChange],
        params_cte: Any,
    ) -> list[NamedMutationStatement]:
        """Build grouped sparse UPDATE statements from JSONB payload rows."""
        if not updates:
            return []

        self._validate_update_changes(updates)

        rows_by_type: dict[NodeType, list[dict[str, Any]]] = defaultdict(list)

        for ord_, change in enumerate(updates, start=1):
            model = self._get_model(change.node_type)
            payload = _validate_and_encode_payload(model, change.payload.model_dump(exclude_unset=True))
            if not payload:
                continue

            rows_by_type[change.node_type].append(
                {
                    "ord": ord_,
                    "id": str(change.id),
                    "present_keys": sorted(payload.keys()),
                    **payload,
                }
            )

        statements: list[NamedMutationStatement] = []

        for node_type, rows in rows_by_type.items():
            node_key = _node_type_key(node_type)
            model = self._get_model(node_type)
            table = model.__table__  # pyrefly: ignore[missing-attribute]

            touched_columns = sorted({column_name for row in rows for column_name in row["present_keys"]})

            input_columns = [
                column("ord", Integer()),
                column("id", table.c.id.type),
                column("present_keys", ARRAY(String())),
                *(column(column_name, table.c[column_name].type) for column_name in touched_columns),
            ]

            input_cte = _jsonb_recordset_cte(
                cte_name=f"{node_key}_update_input",
                param_name=f"{node_key}_update_rows",
                payload=rows,
                column_specs=input_columns,
            )

            assignments: dict[str, Any] = {
                column_name: case(
                    (
                        literal_column(f"'{column_name}'") == any_(input_cte.c.present_keys),
                        input_cte.c[column_name],
                    ),
                    else_=table.c[column_name],
                )
                for column_name in touched_columns
            }
            assignments["updated_at"] = params_cte.c.ts

            statements.append(
                NamedMutationStatement(
                    name=f"update_{node_key}",
                    statement=(
                        update(table)
                        .where(
                            table.c.id == input_cte.c.id,
                            table.c.project_id == params_cte.c.project_id,
                            table.c.project_version == params_cte.c.project_version,
                            table.c.is_deleted.is_(False),
                        )
                        .values(assignments)
                        .returning(
                            input_cte.c.ord.label("ord"),
                            literal_column("'update'").label("op"),
                            literal_column(f"'{node_key}'").label("node_type"),
                            func.json_build_object(*_json_build_object_args(model, source=table)).label("payload"),
                        )
                    ),
                )
            )

        return statements

    def build_delete_queries(
        self,
        deletes: list[DeleteNodeChange],
        params_cte: Any,
        hard_delete: bool,
    ) -> list[NamedMutationStatement]:
        """
        Group deletes by node type and generate one named delete statement per
        type. The returned rows match the same top-level mutation shape as
        inserts and updates, but the payload only contains the deleted id.

        Delete rows are passed in with their original request ordinals so the
        unioned delete result can preserve global request order even when the
        batch spans multiple node types.

        When ``hard_delete`` is False the generated SQL is a soft
        delete: ``UPDATE table SET is_deleted=true, updated_at=now()``. Only
        rows that are not already soft-deleted are touched.

        When ``hard_delete`` is True the row is physically removed via
        ``DELETE FROM table``. Soft-deleted rows are still removed (the
        ``is_deleted IS false`` filter is dropped) — hard delete is meant for
        rollback / cleanup paths that need the rows gone regardless of state.
        """
        if not deletes:
            return []

        rows_by_type: dict[NodeType, list[dict[str, Any]]] = defaultdict(list)
        seen: set[tuple[NodeType, UUID]] = set()

        for ord_, change in enumerate(deletes, start=1):
            key = (change.node_type, change.id)
            if key in seen:
                continue

            seen.add(key)
            rows_by_type[change.node_type].append(
                {
                    "ord": ord_,
                    "id": str(change.id),
                }
            )

        statements: list[NamedMutationStatement] = []

        for node_type, rows in rows_by_type.items():
            node_key = _node_type_key(node_type)
            model = self._get_model(node_type)
            table = model.__table__  # pyrefly: ignore[missing-attribute]

            input_cte = _jsonb_recordset_cte(
                cte_name=f"{node_key}_delete_input",
                param_name=f"{node_key}_delete_rows",
                payload=rows,
                column_specs=[
                    column("ord", Integer()),
                    column("id", table.c.id.type),
                ],
            )

            returning_cols = (
                input_cte.c.ord.label("ord"),
                literal_column("'delete'").label("op"),
                literal_column(f"'{node_key}'").label("node_type"),
                func.json_build_object(literal_column("'id'"), table.c.id).label("payload"),
            )

            if hard_delete:
                statement = (
                    delete(table)
                    .where(
                        table.c.id == input_cte.c.id,
                        table.c.project_id == params_cte.c.project_id,
                        table.c.project_version == params_cte.c.project_version,
                    )
                    .returning(*returning_cols)
                )
            else:
                statement = (
                    update(table)
                    .where(
                        table.c.id == input_cte.c.id,
                        table.c.project_id == params_cte.c.project_id,
                        table.c.project_version == params_cte.c.project_version,
                        table.c.is_deleted.is_(False),
                    )
                    .values(
                        is_deleted=True,
                        updated_at=params_cte.c.ts,
                    )
                    .returning(*returning_cols)
                )

            statements.append(NamedMutationStatement(name=f"delete_{node_key}", statement=statement))

        return statements

    def build_copy_version_queries(
        self,
        *,
        project_id: UUID,
        source_version: int,
        target_version: int,
        nodes: list[NodeRef | CopyVersionNodeDirective],
    ) -> list[NamedMutationStatement]:
        grouped: dict[NodeType, list[CopyVersionNodeDirective]] = defaultdict(list)
        for node in _dedupe_copy_directives(nodes):
            grouped[node.node_type].append(node)

        if not grouped:
            return []

        params_cte = _build_mutation_params_cte(project_id, target_version)
        source_project_version = bindparam("source_project_version", value=source_version, type_=Integer())
        statements: list[NamedMutationStatement] = []

        for node_type, directives in grouped.items():
            node_key = _node_type_key(node_type)
            model = self._get_model(node_type)
            table = model.__table__  # pyrefly: ignore[missing-attribute]
            source = table.alias(f"{node_key}_copy_source")

            input_cte = _jsonb_recordset_cte(
                cte_name=f"{node_key}_copy_input",
                param_name=f"{node_key}_copy_rows",
                payload=[
                    {
                        "id": str(directive.id),
                        "set_outdated": directive.set_outdated,
                        "overrides": directive.overrides,
                    }
                    for directive in directives
                ],
                column_specs=[
                    column("id", table.c.id.type),
                    column("set_outdated", Boolean()),
                    column("overrides", JSONB()),
                ],
            )

            target_column_names = [col.key for col in table.columns if col.key != "sys_period"]
            source_columns = []
            for col in table.columns:
                if col.key == "sys_period":
                    continue
                if col.key == "project_id":
                    source_columns.append(params_cte.c.project_id)
                elif col.key == "project_version":
                    source_columns.append(params_cte.c.project_version)
                elif col.key == "is_deleted":
                    source_columns.append(params_cte.c.is_deleted)
                elif col.key in {"created_at", "updated_at"}:
                    source_columns.append(params_cte.c.ts)
                elif col.key == "is_outdated":
                    source_columns.append(
                        case((input_cte.c.set_outdated.is_(True), literal_column("true")), else_=source.c[col.key])
                    )
                elif col.key not in _SYSTEM_MANAGED_FIELDS:
                    source_columns.append(
                        case(
                            (input_cte.c.overrides.op("?")(col.key), _copy_override_value(input_cte, col)),
                            else_=source.c[col.key],
                        )
                    )
                else:
                    source_columns.append(source.c[col.key])

            source_select = (
                select(*source_columns)
                .select_from(source.join(input_cte, source.c.id == input_cte.c.id))
                .select_from(params_cte)
                .where(
                    source.c.project_id == params_cte.c.project_id,
                    source.c.project_version == source_project_version,
                    source.c.is_deleted.is_(False),
                )
            )

            statements.append(
                NamedMutationStatement(
                    name=f"copy_version_{node_key}",
                    statement=insert(table).from_select(target_column_names, source_select, include_defaults=False),
                )
            )

        return statements

    def build_process_update_query(
        self,
        inserts: list[CreateNodeChange],
        updates: list[PatchNodeChange],
        deletes: list[DeleteNodeChange],
        project_id: UUID,
        project_version: int,
        hard_delete: bool,
    ) -> Select[Any]:
        """Build one roundtrip mutation statement for insert/update/delete batches."""
        self._validate_process_update_inputs(inserts, updates, deletes, project_id)
        params_cte = _build_mutation_params_cte(project_id, project_version)

        insert_results = _mutation_result_cte(
            "insert_results",
            self.build_insert_queries(inserts, project_id, params_cte),
        )
        update_results = _mutation_result_cte(
            "update_results",
            self.build_update_queries(updates, params_cte),
        )
        delete_results = _mutation_result_cte(
            "delete_results",
            self.build_delete_queries(deletes, params_cte, hard_delete=hard_delete),
        )

        return select(
            _mutation_result_array(insert_results).label("inserted"),
            _mutation_result_array(update_results).label("updated"),
            _mutation_result_array(delete_results).label("deleted"),
        )

    # ── Full mutation execution ────────────────────────────────────────

    async def process_update(
        self,
        inserts: list[CreateNodeChange],
        updates: list[PatchNodeChange],
        deletes: list[DeleteNodeChange],
        db: AsyncSession,
        project_id: UUID,
        project_version: int,
        hard_delete: bool,
        audit_log_enabled: bool = False,
        audit_context: dict[str, Any] | None = None,
    ) -> ProcessUpdateResult:
        expected_insert_count = len(inserts)
        expected_update_count = sum(1 for change in updates if change.payload.model_dump(exclude_unset=True))
        expected_delete_count = len({(change.node_type, change.id) for change in deletes})
        result_row: dict[str, Any] = {"inserted": [], "updated": [], "deleted": []}

        try:
            statement = self.build_process_update_query(
                inserts, updates, deletes, project_id, project_version, hard_delete=hard_delete
            )
            mappings: MappingResult = (await db.execute(statement)).mappings()
            row = mappings.one()

            result_row = {
                "inserted": row["inserted"] or [],
                "updated": row["updated"] or [],
                "deleted": row["deleted"] or [],
            }

            if len(result_row["inserted"]) != expected_insert_count:
                raise NodeNotFoundError("Insert batch affected fewer rows than expected")
            if len(result_row["updated"]) != expected_update_count:
                raise NodeNotFoundError("Update batch affected fewer rows than expected")
            # Hard delete is meant for rollback / cleanup paths where the
            # caller may not know which refs survived earlier failures, so a
            # short delete-count is not an error there.
            if not hard_delete and len(result_row["deleted"]) != expected_delete_count:
                raise NodeNotFoundError("Delete batch affected fewer rows than expected")

            if audit_log_enabled:
                audit_rows = self._build_audit_rows(
                    inserted=result_row["inserted"],
                    updated=result_row["updated"],
                    deleted=result_row["deleted"],
                    project_id=project_id,
                    audit_context=audit_context or {},
                )
                if audit_rows:
                    await db.execute(audit_log_table.insert(), audit_rows)

            await db.commit()
        except Exception:
            await db.rollback()
            raise

        return {
            "inserted": [{"node_type": row["node_type"], "payload": row["payload"]} for row in result_row["inserted"]],
            "updated": [{"node_type": row["node_type"], "payload": row["payload"]} for row in result_row["updated"]],
            "deleted": [
                {"node_type": row["node_type"], "payload": {"id": row["payload"]["id"]}}
                for row in result_row["deleted"]
            ],
        }

    def _audit_row(
        self,
        entity_type: str,
        entity_id: Any,
        change_type: ChangeType,
        project_id: UUID,
        audit_context: dict[str, Any],
    ) -> dict[str, Any]:
        return {
            "id": uuid4(),
            "project_id": project_id,
            "entity_id": UUID(entity_id) if isinstance(entity_id, str) else entity_id,
            "entity_type": entity_type,
            "change_type": change_type.value,
            "action_type": None,
            "actor_user_id": audit_context.get("actor_user_id"),
            "triggered_by_user_id": audit_context.get("triggered_by_user_id"),
            "workflow_run_id": audit_context.get("workflow_run_id"),
            "workflow_type": audit_context.get("workflow_type"),
        }

    def _build_audit_rows(
        self,
        *,
        inserted: list[dict[str, Any]],
        updated: list[dict[str, Any]],
        deleted: list[dict[str, Any]],
        project_id: UUID,
        audit_context: dict[str, Any],
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for row in inserted:
            rows.append(
                self._audit_row(row["node_type"], row["payload"]["id"], ChangeType.CREATE, project_id, audit_context)
            )
        for row in updated:
            rows.append(
                self._audit_row(row["node_type"], row["payload"]["id"], ChangeType.UPDATE, project_id, audit_context)
            )
        for row in deleted:
            rows.append(
                self._audit_row(row["node_type"], row["payload"]["id"], ChangeType.DELETE, project_id, audit_context)
            )
        return rows

    async def _count_nodes(
        self,
        *,
        project_id: UUID,
        project_version: int,
        nodes: list[NodeRef],
        db: AsyncSession,
        only_active: bool,
    ) -> int:
        grouped: dict[NodeType, set[UUID]] = defaultdict(set)
        for node in nodes:
            grouped[node.node_type].add(node.id)

        total = 0
        for node_type, ids in grouped.items():
            model = self._get_model(node_type)
            table = model.__table__  # pyrefly: ignore[missing-attribute]
            result = await db.execute(
                select(func.count())
                .select_from(table)
                .where(
                    *_project_scope_filters(
                        table,
                        project_id,
                        project_version,
                        only_active=only_active,
                    ),
                    table.c.id.in_(ids),
                )
            )
            total += int(result.scalar_one())

        return total

    async def copy_project_version_nodes(
        self,
        *,
        project_id: UUID,
        source_version: int,
        target_version: int,
        nodes: list[NodeRef | CopyVersionNodeDirective],
        db: AsyncSession,
        dry_run: bool,
    ) -> CopyVersionResult:
        unique_nodes = _dedupe_copy_directives(nodes)
        unique_refs = [_as_node_ref(node) for node in unique_nodes]
        expected_count = len(unique_refs)

        source_count = await self._count_nodes(
            project_id=project_id,
            project_version=source_version,
            nodes=unique_refs,
            db=db,
            only_active=True,
        )
        if source_count != expected_count:
            raise NodeNotFoundError("copy-version allow-list contains missing source nodes")

        target_count = await self._count_nodes(
            project_id=project_id,
            project_version=target_version,
            nodes=unique_refs,
            db=db,
            only_active=False,
        )
        if target_count:
            if target_count == expected_count:
                return {"copied": expected_count}
            raise ValueError(
                f"{target_count} target rows already exist for project {project_id} at project_version {target_version}"
            )

        if dry_run:
            return {"copied": expected_count}

        try:
            for statement in self.build_copy_version_queries(
                project_id=project_id,
                source_version=source_version,
                target_version=target_version,
                nodes=unique_nodes,
            ):
                result = await db.execute(statement.statement)
                if result.rowcount not in (-1, None):
                    expected_for_statement = len(
                        {
                            node.id
                            for node in unique_nodes
                            if _node_type_key(node.node_type) == statement.name.removeprefix("copy_version_")
                        }
                    )
                    if int(result.rowcount) != expected_for_statement:
                        raise NodeNotFoundError("Copy-version batch affected fewer rows than expected")
            await db.commit()
        except Exception:
            await db.rollback()
            raise

        return {"copied": expected_count}

    async def hard_delete_project_version(
        self,
        *,
        project_id: UUID,
        project_version: int,
        db: AsyncSession,
    ) -> dict[str, int]:
        """Physically delete every registered node row for one project version."""
        deleted: dict[str, int] = {}
        try:
            for node_type, model in self._delete_ordered_registry():
                result = await db.execute(
                    delete(model).where(
                        model.project_id == project_id,
                        model.project_version == project_version,
                    )
                )
                deleted[_node_type_key(node_type)] = int(result.rowcount or 0)
            await db.commit()
        except Exception:
            await db.rollback()
            raise
        return deleted
