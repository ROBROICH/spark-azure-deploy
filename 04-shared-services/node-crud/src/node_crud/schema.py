"""
Generate Pydantic request/response schemas from the SQLAlchemy models in MODEL_REGISTRY.

What this module builds for each registered node/table:

- <Node>NodeResponse
    Response shape for a persisted row.
    Includes:
      - node_type: Literal["<node_type>"]
      - all mapped DB columns on the model
      - system-managed fields such as id / timestamps / soft-delete flag
    Does NOT include ORM relationship attributes such as `project` or `gesetz`.

- <Node>InsertPayload
    Payload used when creating a node.
    Includes:
      - all mapped DB columns except fields listed in _SYSTEM_MANAGED_FIELDS
    Field requiredness:
      - required if column is non-nullable and has no default/server default
      - optional otherwise

- <Node>PatchPayload
    Payload used when updating a node.
    Includes:
      - all mapped DB columns except fields listed in _SYSTEM_MANAGED_FIELDS
    All fields are optional.

- <Node>InsertNodeAction
    Envelope for create actions:
      - node_type
      - optional id
      - payload: <Node>InsertPayload

- <Node>PatchNodeAction
    Envelope for update actions:
      - node_type
      - required id
      - payload: <Node>PatchPayload

- NodeRef
    Shared `{node_type, id}` model used for batch-get requests, deletes, and delete
    responses. The `node_type` field is a Literal union of all registered node types.

Across all registered models, this module also builds discriminated unions and wrapper models:

- NodeResponseUnion
- InsertNodeActionUnion
- PatchNodeActionUnion
- NodeRef
- ProcessNodeChangesRequest
- ProcessNodeChangesResponse
- BatchGetNodesRequest
- BatchGetNodesResponse
- NodesListResponse

Important implementation detail:
- We inspect SQLAlchemy *columns*, not ORM relationships.
  So FK columns like `project_id` are included, but relationship attrs like `project`
  are not.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Annotated, Any, Literal, get_args, get_origin, get_type_hints
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, create_model
from sqlalchemy import JSON
from sqlalchemy.inspection import inspect as sa_inspect
from sqlalchemy.orm import Mapped
from sqlalchemy.sql.elements import NamedColumn

from node_crud.base import NodeModelBase, NodeType
from node_crud.registry import ColumnName, NodeModelRegistry, ParentForeignKeyMap

# Convenience aliases for the SQLAlchemy model class and inspected column object.
ModelClass = type[NodeModelBase]
DbColumn = NamedColumn[Any]

# Discriminated unions built via Annotated[Foo | Bar, Field(discriminator="node_type")]
# are type expressions, not concrete BaseModel subclasses, so `Any` is the most
# practical annotation here.

# Columns that are not user-editable in insert/patch payloads.
#
# These are still part of NodeResponse, but they are excluded from the generated
# input payloads because they are considered controlled elsewhere by the system.
#
# Note: `project_id` and `project_version` are also system-managed — clients
# can't override them via insert/patch payloads. The owning service pins both
# from the request scope.
_SYSTEM_MANAGED_FIELDS: frozenset[ColumnName] = frozenset(
    {
        ColumnName("id"),
        ColumnName("project_id"),
        ColumnName("project_version"),
        ColumnName("created_at"),
        ColumnName("updated_at"),
        ColumnName("is_deleted"),
    }
)


class _GeneratedSchemaBase(BaseModel):
    """
    Common base for every generated schema.

    - from_attributes=True
        Allows constructing response models from ORM objects / attribute access.
    - extra="forbid"
        Rejects unknown fields in request payloads and envelopes.
    """

    model_config = ConfigDict(from_attributes=True, extra="forbid")


GeneratedUnion = type[Annotated[BaseModel, Any]]


# ── Typed bases for generated models ─────────────────────────────────────────
# These provide attribute visibility to type checkers. create_model narrows
# the field types at runtime (e.g. str → Literal["gesetz"]).


class NodeRefBase(_GeneratedSchemaBase):
    node_type: NodeType
    id: str


class InsertNodeActionBase(_GeneratedSchemaBase):
    node_type: NodeType
    id: str | None
    payload: BaseModel


class PatchNodeActionBase(_GeneratedSchemaBase):
    node_type: NodeType
    id: str
    payload: BaseModel


class BatchGetNodesRequestBase(_GeneratedSchemaBase):
    nodes: list[NodeRefBase]


class BatchGetNodesResponseBase(_GeneratedSchemaBase):
    results: list[BaseModel]


class ProcessNodeChangesRequestBase(_GeneratedSchemaBase):
    inserts: list[InsertNodeActionBase]
    updates: list[PatchNodeActionBase]
    deletes: list[NodeRefBase]


class ProcessNodeChangesResponseBase(_GeneratedSchemaBase):
    inserted: list[BaseModel]
    updated: list[BaseModel]
    deleted: list[NodeRefBase]


class NodesListResponseBase(_GeneratedSchemaBase):
    nodes: list[BaseModel]


@dataclass(frozen=True)
class ModelColumnSpec:
    """Small helper object pairing a column name with the SQLAlchemy column object."""

    name: ColumnName
    column: DbColumn


@dataclass(frozen=True)
class GeneratedNodeSchemas:
    """
    Container for all top-level generated artifacts.

    The `*_union` values are discriminated union type aliases built across all
    registered node/action models.

    The request/response fields are actual generated Pydantic model classes.
    """

    node_response_union: GeneratedUnion
    insert_node_action_union: GeneratedUnion
    patch_node_action_union: GeneratedUnion
    node_ref: type[NodeRefBase]
    process_node_changes_request: type[ProcessNodeChangesRequestBase]
    process_node_changes_response: type[ProcessNodeChangesResponseBase]
    batch_get_nodes_request: type[BatchGetNodesRequestBase]
    batch_get_nodes_response: type[BatchGetNodesResponseBase]
    nodes_list_response: type[NodesListResponseBase]


def _make_literal_type(value: str | tuple[str, ...]) -> Any:
    """
    Construct Literal[...] dynamically for either one string or many strings.

    Examples:
        _make_literal_type("standangabe")
        -> Literal["standangabe"]
        _make_literal_type(("gesetz", "satz"))
        -> Literal["gesetz", "satz"]
    """
    if isinstance(value, tuple) and not value:
        raise ValueError("Cannot build a Literal union from an empty tuple")
    return Literal[value]  # pyrefly: ignore[not-a-type] — runtime Literal construction from dynamic value


def _to_pascal_case(value: str) -> str:
    return "".join(part.capitalize() for part in value.split("_"))


def _unwrap_mapped_annotation(annotation: Any) -> Any:
    """
    Convert SQLAlchemy's Mapped[T] annotation into plain T.

    Example:
        Mapped[str] -> str
        Mapped[uuid.UUID] -> uuid.UUID

    If the annotation is not Mapped[...] it is returned unchanged.
    """
    if get_origin(annotation) is Mapped:
        args = get_args(annotation)
        if args:
            return args[0]
    return annotation


def _infer_type_from_column(column: DbColumn) -> Any:
    """
    Infer a Python / Pydantic field type from a SQLAlchemy column.

    Resolution order:
    - SQLAlchemy enum with enum_class -> use the enum class directly
    - JSON -> dict[str, Any]
    - otherwise -> use column.type.python_type if available
    - fallback -> Any

    This is only used when the model class does not provide a usable type hint
    for the column name.
    """
    column_type = column.type

    if isinstance(column_type, JSON):
        return dict[str, Any]

    enum_class = getattr(column_type, "enum_class", None)
    if enum_class is not None:
        return enum_class

    try:
        return column_type.python_type
    except (AttributeError, NotImplementedError):
        return Any


def _resolve_field_annotation(
    model_class: ModelClass,
    column_name: ColumnName,
    column: DbColumn,
) -> Any:
    """
    Resolve the final Python type for one generated field.

    Preferred source:
    - the SQLAlchemy model's own type hint for that attribute

    Fallback:
    - infer from the SQLAlchemy column type

    Nullability rule:
    - if the DB column is nullable, add `| None` to the annotation
    """
    try:
        type_hints = get_type_hints(model_class, include_extras=True)
    except Exception:
        type_hints: dict[str, Any] = {}

    annotation = type_hints.get(str(column_name))
    if annotation is not None:
        annotation = _unwrap_mapped_annotation(annotation)
    else:
        annotation = _infer_type_from_column(column)

    if column.nullable:
        annotation = annotation | None

    return annotation


def _get_model_columns(
    model_class: ModelClass,
    *,
    exclude: frozenset[ColumnName] = frozenset(),
) -> list[ModelColumnSpec]:
    """
    Return the mapped SQLAlchemy columns for a model, excluding any listed names.

    Important:
    - This walks mapper.column_attrs, so it is focused on actual column-backed
      attributes.
    - Relationship attributes are not returned here unless they are backed by a
      real mapped column attr.
    - Therefore foreign key columns like `gesetz_id` are included, but relationship
      attrs like `gesetz` are not.

    The result preserves the mapper's attribute ordering.
    """
    mapper = sa_inspect(model_class)
    columns: list[ModelColumnSpec] = []

    for attr in (
        mapper.column_attrs  # pyrefly: ignore[missing-attribute] — sa_inspect returns InstanceState whose type pyrefly can't resolve
    ):
        if not attr.columns:
            continue
        name = ColumnName(attr.key)
        if name in exclude:
            continue
        columns.append(
            ModelColumnSpec(
                name=name,
                column=attr.columns[0],
            )
        )

    return columns


def _build_node_response_model(
    node_type: NodeType,
    model_class: ModelClass,
) -> type[BaseModel]:
    """
    Build <Node>NodeResponse.

    Shape:
        class <Node>NodeResponse(_GeneratedSchemaBase):
            node_type: Literal["<node_type>"] = "<node_type>"
            # all mapped DB columns, including system-managed fields

    Response models treat every emitted field as required.
    """
    field_definitions: dict[str, Any] = {
        "node_type": (_make_literal_type(str(node_type)), str(node_type)),
    }

    for column_spec in _get_model_columns(model_class):
        annotation = _resolve_field_annotation(model_class, column_spec.name, column_spec.column)
        default = ...  # all response fields are required
        field_definitions[str(column_spec.name)] = (annotation, default)

    return create_model(
        f"{_to_pascal_case(str(node_type))}NodeResponse",
        __base__=_GeneratedSchemaBase,
        __module__=__name__,
        **field_definitions,
    )


def _build_node_insert_payload_model(
    node_type: NodeType,
    model_class: ModelClass,
) -> type[BaseModel]:
    """
    Build <Node>InsertPayload.

    Shape:
        class <Node>InsertPayload(_GeneratedSchemaBase):
            # all mapped DB columns except _SYSTEM_MANAGED_FIELDS

    Requiredness rule:
    - required if column is non-nullable and has no Python default or server default
    - optional otherwise

    This payload contains only scalar column data, not relationships.
    """
    field_definitions: dict[str, Any] = {}

    for column_spec in _get_model_columns(model_class, exclude=_SYSTEM_MANAGED_FIELDS):
        annotation = _resolve_field_annotation(model_class, column_spec.name, column_spec.column)
        # nullable or server-defaulted columns are optional (default None), rest are required
        has_default = (
            column_spec.column.nullable
            or column_spec.column.server_default is not None
            or column_spec.column.default is not None
        )
        default = None if has_default else ...
        field_definitions[str(column_spec.name)] = (annotation, default)

    return create_model(
        f"{_to_pascal_case(str(node_type))}InsertPayload",
        __base__=_GeneratedSchemaBase,
        __module__=__name__,
        **field_definitions,
    )


def _build_node_patch_payload_model(
    node_type: NodeType,
    model_class: ModelClass,
) -> type[BaseModel]:
    """
    Build <Node>PatchPayload.

    Shape:
        class <Node>PatchPayload(_GeneratedSchemaBase):
            # all mapped DB columns except _SYSTEM_MANAGED_FIELDS
            # every field optional

    This is for partial updates, so every emitted field defaults to None.
    The default makes the field optional; the annotation still follows DB
    nullability so explicit null is only accepted for nullable columns.
    """
    field_definitions: dict[str, Any] = {}

    for column_spec in _get_model_columns(model_class, exclude=_SYSTEM_MANAGED_FIELDS):
        annotation = _resolve_field_annotation(model_class, column_spec.name, column_spec.column)
        default = None  # all patch fields are optional
        field_definitions[str(column_spec.name)] = (annotation, default)

    return create_model(
        f"{_to_pascal_case(str(node_type))}PatchPayload",
        __base__=_GeneratedSchemaBase,
        __module__=__name__,
        **field_definitions,
    )


def _build_create_node_action_model(
    node_type: NodeType,
    payload_model: type[BaseModel],
) -> type[BaseModel]:
    """
    Build <Node>InsertNodeAction.

    Shape:
        class <Node>InsertNodeAction(_GeneratedSchemaBase):
            node_type: Literal["<node_type>"] = "<node_type>"
            id: str | None = None
            payload: <Node>InsertPayload

    `node_type` is the discriminator used when this action is part of a union.
    """
    return create_model(
        f"{_to_pascal_case(str(node_type))}InsertNodeAction",
        __base__=InsertNodeActionBase,
        __module__=__name__,
        node_type=(_make_literal_type(str(node_type)), str(node_type)),
        id=(str | None, None),
        payload=(payload_model, ...),
    )


def _build_patch_node_action_model(
    node_type: NodeType,
    payload_model: type[BaseModel],
) -> type[BaseModel]:
    """
    Build <Node>PatchNodeAction.

    Shape:
        class <Node>PatchNodeAction(_GeneratedSchemaBase):
            node_type: Literal["<node_type>"] = "<node_type>"
            id: str
            payload: <Node>PatchPayload
    """
    return create_model(
        f"{_to_pascal_case(str(node_type))}PatchNodeAction",
        __base__=PatchNodeActionBase,
        __module__=__name__,
        node_type=(_make_literal_type(str(node_type)), str(node_type)),
        id=(str, ...),
        payload=(payload_model, ...),
    )


def _build_node_ref(node_types: list[NodeType]) -> type[NodeRefBase]:
    """Build NodeRef — a `{node_type, id}` model covering all registered node types."""
    all_node_types_literal = _make_literal_type(tuple(str(nt) for nt in sorted(node_types)))
    return create_model(
        "NodeRef",
        __base__=NodeRefBase,
        __module__=__name__,
        node_type=(all_node_types_literal, ...),
        id=(str, ...),
    )


def _build_discriminated_union(models: list[type[BaseModel]]) -> GeneratedUnion:
    """
    Combine a list of generated Pydantic models into a single discriminated union.

    Example output shape:
        Annotated[
            FooInsertNodeAction | BarInsertNodeAction | BazInsertNodeAction,
            Field(discriminator="node_type"),
        ]

    All participating models must have a `node_type` field with a Literal value.
    """
    if not models:
        raise ValueError("Cannot build a discriminated union from an empty model list")

    union_type = models[0]
    for model in models[1:]:
        union_type = union_type | model

    # pyrefly: ignore[bad-return] — Annotated[Union[...], Field(discriminator=...)] is a valid type form at runtime
    return Annotated[union_type, Field(discriminator="node_type")]


def _build_process_node_changes_request_model(
    insert_node_action_union: GeneratedUnion,
    patch_node_action_union: GeneratedUnion,
    node_ref: type[NodeRefBase],
) -> type[ProcessNodeChangesRequestBase]:
    """
    Build ProcessNodeChangesRequest.

    Shape:
      {
        "inserts": [<InsertNodeActionUnion>, ...],
        "updates": [<PatchNodeActionUnion>, ...],
        "deletes": [<NodeRef>, ...],
      }
    """
    process_node_changes_request = create_model(
        "ProcessNodeChangesRequest",
        __base__=ProcessNodeChangesRequestBase,
        __module__=__name__,
        inserts=(list[insert_node_action_union], Field(default_factory=list)),
        updates=(list[patch_node_action_union], Field(default_factory=list)),
        deletes=(list[node_ref], Field(default_factory=list)),
    )
    process_node_changes_request.model_rebuild()
    return process_node_changes_request


def _build_process_node_changes_response_model(
    node_response_union: GeneratedUnion,
    node_ref: type[NodeRefBase],
) -> type[ProcessNodeChangesResponseBase]:
    """
    Build ProcessNodeChangesResponse.

    Shape:
      {
        "inserted": [<NodeResponseUnion>, ...],
        "updated": [<NodeResponseUnion>, ...],
        "deleted": [<NodeRef>, ...],
      }
    """
    process_node_changes_response = create_model(
        "ProcessNodeChangesResponse",
        __base__=ProcessNodeChangesResponseBase,
        __module__=__name__,
        inserted=(list[node_response_union], Field(default_factory=list)),
        updated=(list[node_response_union], Field(default_factory=list)),
        deleted=(list[node_ref], Field(default_factory=list)),
    )
    process_node_changes_response.model_rebuild()
    return process_node_changes_response


def _build_batch_get_nodes_response_model(
    node_response_union: GeneratedUnion,
) -> type[BatchGetNodesResponseBase]:
    batch_get_nodes_response = create_model(
        "BatchGetNodesResponse",
        __base__=BatchGetNodesResponseBase,
        __module__=__name__,
        results=(list[node_response_union], ...),
    )
    batch_get_nodes_response.model_rebuild()
    return batch_get_nodes_response


def _build_batch_get_nodes_request_model(
    node_ref: type[NodeRefBase],
) -> type[BatchGetNodesRequestBase]:
    batch_get_nodes_request = create_model(
        "BatchGetNodesRequest",
        __base__=BatchGetNodesRequestBase,
        __module__=__name__,
        nodes=(list[node_ref], ...),
    )
    batch_get_nodes_request.model_rebuild()
    return batch_get_nodes_request


def _build_nodes_list_response_model(
    node_types: list[NodeType],
    parent_node_types: list[NodeType],
) -> type[NodesListResponseBase]:
    node_types_literal = _make_literal_type(tuple(str(nt) for nt in sorted(node_types)))
    parent_node_types_literal = _make_literal_type(tuple(str(nt) for nt in sorted(parent_node_types)))

    parent_ref = create_model(
        "ParentRef",
        __base__=_GeneratedSchemaBase,
        __module__=__name__,
        id=(UUID, ...),
        node_type=(parent_node_types_literal, ...),
    )
    node_summary = create_model(
        "NodeSummary",
        __base__=_GeneratedSchemaBase,
        __module__=__name__,
        id=(UUID, ...),
        node_type=(node_types_literal, ...),
        parents=(list[parent_ref], ...),
        frontend_parent_ids=(list[str], ...),
        is_outdated=(bool, ...),
    )
    node_summary.model_rebuild()

    nodes_list_response = create_model(
        "NodesListResponse",
        __base__=NodesListResponseBase,
        __module__=__name__,
        nodes=(list[node_summary], ...),
    )
    nodes_list_response.model_rebuild()
    return nodes_list_response


def build_generated_node_schemas(
    model_registry: NodeModelRegistry,
    parent_fk_map: ParentForeignKeyMap | None = None,
) -> GeneratedNodeSchemas:
    """
    Generate every schema artifact from the provided model registry.

    For each registry entry:
    - build one NodeResponse
    - build one InsertPayload
    - build one PatchPayload
    - build one InsertNodeAction
    - build one PatchNodeAction

    Then build the shared DeleteNodeRequest and DeleteNodeResponse models covering
    all registered node types.

    Then combine those per-node models into top-level discriminated unions and
    wrapper request/response models.

    Registry expectation:
    - key   -> node type string used in the discriminator, e.g. "standangabe"
    - value -> SQLAlchemy model class
    """
    node_response_models: list[type[BaseModel]] = []
    insert_node_action_models: list[type[BaseModel]] = []
    patch_node_action_models: list[type[BaseModel]] = []

    sorted_node_types = [NodeType(raw_node_type) for raw_node_type in sorted(model_registry)]
    parent_node_types = set(sorted_node_types)
    if parent_fk_map is not None:
        for fk_map in parent_fk_map.values():
            parent_node_types.update(fk_map.values())
    sorted_parent_node_types = sorted(parent_node_types)

    # Sort for deterministic output and stable generated class ordering.
    for node_type in sorted_node_types:
        model_class = model_registry[node_type]
        node_response_models.append(_build_node_response_model(node_type, model_class))

        create_payload_model = _build_node_insert_payload_model(node_type, model_class)
        patch_payload_model = _build_node_patch_payload_model(node_type, model_class)

        insert_node_action_models.append(_build_create_node_action_model(node_type, create_payload_model))
        patch_node_action_models.append(_build_patch_node_action_model(node_type, patch_payload_model))

    # Build one discriminated union per generated category.
    node_response_union = _build_discriminated_union(node_response_models)
    insert_node_action_union = _build_discriminated_union(insert_node_action_models)
    patch_node_action_union = _build_discriminated_union(patch_node_action_models)

    node_ref = _build_node_ref(sorted_node_types)
    batch_get_nodes_request = _build_batch_get_nodes_request_model(node_ref)
    batch_get_nodes_response = _build_batch_get_nodes_response_model(node_response_union)
    nodes_list_response = _build_nodes_list_response_model(sorted_node_types, sorted_parent_node_types)
    process_node_changes_request = _build_process_node_changes_request_model(
        insert_node_action_union=insert_node_action_union,
        patch_node_action_union=patch_node_action_union,
        node_ref=node_ref,
    )
    process_node_changes_response = _build_process_node_changes_response_model(
        node_response_union=node_response_union,
        node_ref=node_ref,
    )

    return GeneratedNodeSchemas(
        node_response_union=node_response_union,
        insert_node_action_union=insert_node_action_union,
        patch_node_action_union=patch_node_action_union,
        node_ref=node_ref,
        process_node_changes_request=process_node_changes_request,
        process_node_changes_response=process_node_changes_response,
        batch_get_nodes_request=batch_get_nodes_request,
        batch_get_nodes_response=batch_get_nodes_response,
        nodes_list_response=nodes_list_response,
    )
