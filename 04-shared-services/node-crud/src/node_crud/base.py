import enum
import uuid
from datetime import UTC, date, datetime
from textwrap import dedent
from typing import Any, NewType, TypeVar

from sqlalchemy import Boolean, DateTime, Enum, ForeignKeyConstraint, Index, Integer, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import ARRAY as PG_ARRAY
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.ext.asyncio import AsyncAttrs
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

PERMISSIONS_KEY = "permissions"
IGNORE_VALUES_KEY = "ignore_values"


class UpdateType(enum.Enum):
    AUTOMATED = "automated"
    MANUAL = "manual"


class ColumnAction(enum.StrEnum):
    READ = "read"
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"


NodeType = NewType("NodeType", str)
ModelClass = type["NodeModelBase"]
ModelT = TypeVar("ModelT", bound="NodeModelBase")


def _project_id_active_index(table_name: str, has_is_deleted: bool = True) -> Index:
    index_name = f"ix_{table_name}_project_id_active"
    if len(index_name) > 50:
        raise ValueError(
            dedent(
                f"""
                Index name too long: {index_name}
                Reduce the length of your table name.
                Postgres will otherwise silently truncate constraint and index names.
                """
            ).strip()
        )

    return Index(index_name, "project_id", "project_version", postgresql_where=text("is_deleted IS false"))


def common_table_args(table_name: str) -> tuple[Index]:
    return (_project_id_active_index(table_name),)


def parent_fk(
    column_name: str,
    parent_table: str,
    *,
    ondelete: str | None = "CASCADE",
) -> ForeignKeyConstraint:
    """Build a deferrable ``(column, project_version)`` parent FK."""
    # Deferrable FKs let version-copy inserts write a whole subgraph in one
    # statement and let Postgres validate parent rows at commit.
    return ForeignKeyConstraint(
        [column_name, "project_version"],
        [f"{parent_table}.id", f"{parent_table}.project_version"],
        ondelete=ondelete,
        deferrable=True,
        initially="DEFERRED",
    )


def _rewrite_unique_constraints_for_soft_delete(cls: type) -> None:
    """Auto-convert UniqueConstraints to partial unique indexes.

    PostgreSQL doesn't support WHERE on UniqueConstraint, but does on Index.
    This rewrites any UniqueConstraint in __table_args__ to
    ``Index(..., unique=True, postgresql_where="is_deleted IS false")``
    so soft-deleted rows never block new inserts with the same business key.
    """
    table_args = cls.__dict__.get("__table_args__")
    if not isinstance(table_args, tuple) or not table_args:
        return

    # __table_args__ may end with a dict of table-level kwargs
    if isinstance(table_args[-1], dict):
        constraints, table_kw = table_args[:-1], table_args[-1:]
    else:
        constraints, table_kw = table_args, ()

    new_constraints: list[Any] = []
    modified = False
    for arg in constraints:
        if isinstance(arg, UniqueConstraint):
            col_names: list[str] = [str(c) if not isinstance(c, str) else c for c in arg._pending_colargs]
            constraint_name: str = arg.name  # type: ignore[assignment]
            new_constraints.append(
                Index(
                    constraint_name,
                    *col_names,
                    unique=True,
                    postgresql_where=text("is_deleted IS false"),
                )
            )
            modified = True
        else:
            new_constraints.append(arg)

    if modified:
        cls.__table_args__ = (*new_constraints, *table_kw)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class NodeModelBase:
    """Mixin providing common columns and validation for node models.

    Every concrete subclass must define:
    - ``__tablename__``: the database table / node-type name

    Parent relationships are auto-detected from FK columns at registry build
    time.  Only FKs targeting other registered node tables are included.

    Optionally:
    - ``__external_parent_cols__``: dict mapping column names to external node
      type strings, or ``(service, node_type)`` tuples, for cross-service parent
      references (e.g. a column ``topic_norm_id`` that references a
      ``topic_norm`` node in another service).
    """

    __tablename__: str
    __external_parent_cols__: dict[str, str | tuple[str, str]] = {}
    __node_crud_exclude__: bool = False

    id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    project_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    is_deleted: Mapped[bool] = mapped_column(default=False, nullable=False)
    is_outdated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=text("false"))

    frontend_parent_ids: Mapped[list[str]] = mapped_column(
        PG_ARRAY(String),
        default=list,
        server_default=text("ARRAY[]::varchar[]"),
        nullable=False,
    )
    project_version: Mapped[int] = mapped_column(
        Integer,
        default=1,
        server_default=text("1"),
        nullable=False,
        primary_key=True,
    )

    update_type: Mapped[UpdateType] = mapped_column(
        Enum(UpdateType, name="updatetype", create_constraint=True),
        nullable=True,
        default=UpdateType.AUTOMATED,
        server_default=UpdateType.AUTOMATED.name,
    )

    @property
    def node_type(self) -> NodeType:
        return NodeType(self.__tablename__)

    def __init_subclass__(cls, **kwargs: dict[str, Any]) -> None:
        super().__init_subclass__(**kwargs)

        if cls.__dict__.get("__abstract__", False):
            return

        if "__tablename__" not in cls.__dict__:
            raise TypeError(f"{cls.__name__} must define __tablename__")

    def to_dict(self) -> dict[str, Any]:
        """Database model to serialized dict."""

        def serialize(value: Any) -> Any:
            if isinstance(value, uuid.UUID | datetime | date | enum.Enum):
                return str(value)
            return value

        return {col.name: serialize(getattr(self, col.name)) for col in self.__table__.columns}  # type: ignore[attr-defined]


def create_node_base() -> tuple[type[DeclarativeBase], type[NodeModelBase]]:
    """Create a fresh ``(Base, NodeBase)`` pair.

    Each service should call this once to get its own isolated SQLAlchemy
    declarative base and node-model abstract class.
    """

    class Base(DeclarativeBase, AsyncAttrs, TimestampMixin):
        pass

    class NodeBase(Base, NodeModelBase, TimestampMixin):  # pyright: ignore[reportGeneralIssues]
        __abstract__ = True

        def __init_subclass__(cls, **kwargs: dict[str, Any]) -> None:
            _rewrite_unique_constraints_for_soft_delete(cls)
            super().__init_subclass__(**kwargs)

    return Base, NodeBase  # type: ignore[return-value]
