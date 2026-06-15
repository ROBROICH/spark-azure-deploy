from typing import NewType, TypedDict

from node_crud.base import NodeModelBase, NodeType
from node_crud.exceptions import UnknownNodeTypeError

ColumnName = NewType("ColumnName", str)
ExternalParentSpec = str | tuple[str, str]

NodeModelRegistry = dict[NodeType, type[NodeModelBase]]
ParentColumnMap = dict[ColumnName, NodeType]
ParentForeignKeyMap = dict[NodeType, ParentColumnMap]

# Columns shared by every node model. Composite parent FKs cover ``project_version``
# alongside the real parent column, so the FK iteration would otherwise treat
# ``project_version`` as a parent reference for every parent table.
_FK_DETECTION_SKIP_COLS = frozenset(
    {"id", "project_id", "project_version", "is_deleted", "is_outdated", "created_at", "updated_at"}
)


def external_parent_node_type(spec: ExternalParentSpec) -> NodeType:
    return NodeType(spec[1] if isinstance(spec, tuple) else spec)


def build_registries(base: type) -> tuple[NodeModelRegistry, ParentForeignKeyMap]:
    """Build the model registry and parent-FK map by introspecting FK columns on *base*.registry.mappers."""
    model_reg: NodeModelRegistry = {}
    node_classes: list[type[NodeModelBase]] = []

    for mapper in base.registry.mappers:
        if not issubclass(mapper.class_, NodeModelBase):
            continue
        cls = mapper.class_
        tablename = getattr(cls, "__tablename__", None)
        if tablename is None or cls.__dict__.get("__abstract__", False):
            continue
        if getattr(cls, "__node_crud_exclude__", False):
            continue
        model_reg[tablename] = cls
        node_classes.append(cls)

    parent_fk: ParentForeignKeyMap = {}
    for cls in node_classes:
        tablename = cls.__tablename__
        fk_map: ParentColumnMap = {}

        # Auto-detect parents from FK columns targeting registered node tables.
        # Composite parent FKs include ``project_version``; we skip it (and the
        # other shared system columns) so they aren't reported as parent links.
        for col in cls.__table__.columns:  # type: ignore[attr-defined]
            if col.name in _FK_DETECTION_SKIP_COLS:
                continue
            for fk in col.foreign_keys:
                target_table = fk.column.table.name
                if target_table in model_reg:
                    fk_map[ColumnName(col.name)] = NodeType(target_table)

        # Cross-service parent columns (no FK constraint, just column -> node_type)
        external_cols: dict[str, ExternalParentSpec] = getattr(cls, "__external_parent_cols__", {})
        for col_name, spec in external_cols.items():
            fk_map[ColumnName(col_name)] = external_parent_node_type(spec)

        parent_fk[NodeType(tablename)] = fk_map

    return model_reg, parent_fk


def get_model_for_type(
    node_type: NodeType,
    model_registry: NodeModelRegistry,
) -> type[NodeModelBase]:
    model = model_registry.get(node_type)
    if model is None:
        raise UnknownNodeTypeError(f'Could not get model for node "{node_type}"')
    return model


def get_parent_fks(
    node_type: NodeType,
    parent_fk_map: ParentForeignKeyMap,
) -> dict[ColumnName, NodeType]:
    fks = parent_fk_map.get(node_type)
    if fks is None:
        raise UnknownNodeTypeError(f'Could not get foreign keys for node "{node_type}"')
    return fks


class ParentRef(TypedDict):
    id: str
    node_type: str


def extract_parent_refs(
    entity: NodeModelBase,
    parent_fk_map: ParentForeignKeyMap,
) -> list[ParentRef]:
    node_type = NodeType(entity.__tablename__)
    fk_map = parent_fk_map.get(node_type, {})
    refs: list[ParentRef] = []

    for fk_col, parent_type in fk_map.items():
        value = getattr(entity, fk_col, None)
        if value is not None:
            refs.append(
                {
                    "id": str(value),
                    "node_type": parent_type,
                }
            )

    return refs
