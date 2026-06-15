import uuid
from datetime import datetime
from typing import override

from alembic_utils import VersionedMixin
from authentification.enums import Permission
from node_crud import (
    PERMISSIONS_KEY,
    ColumnPermissionRule,
    PermissionsMatrix,
    common_table_args,
    create_node_base,
    parent_fk,
)
from sqlalchemy import Boolean, CheckConstraint, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.expression import text as sa_text
from sqlalchemy.sql.schema import Index

from src.models.risk_enums import RiskStatus
from src.models.topic_enums import TopicEnum

Base, ModelBase = create_node_base()


class Risk(ModelBase, VersionedMixin):
    """Risk model."""

    __tablename__ = "risks"

    __table_args__ = (
        parent_fk("vae_node_id", "vae_node", ondelete=None),
        Index("ix_risk_vae_node_id", "vae_node_id"),
        CheckConstraint("severity >= 1 AND severity <= 10", name="ck_risks_severity_range"),
        *common_table_args(__tablename__),
    )

    vae_node_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    problem: Mapped[str] = mapped_column(Text, nullable=False)
    recommendation: Mapped[str | None] = mapped_column(Text, nullable=True)
    quote: Mapped[str | None] = mapped_column(Text, nullable=True)
    severity: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[RiskStatus] = mapped_column(
        SAEnum(RiskStatus, name="status_enum"),
        nullable=False,
        default=RiskStatus.OPEN,
        server_default=RiskStatus.OPEN.name,
    )
    implication: Mapped[str] = mapped_column(Text, nullable=False)

    @override
    def __repr__(self) -> str:
        return f"<Risk(id={self.id}, project_id={self.project_id}, vae_node_id={self.vae_node_id})>"


class VaeNodeMixin:
    """Mixin for VAE node columns"""

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    order: Mapped[float] = mapped_column(Float, nullable=False, default=0, server_default=sa_text("0"))
    can_add_child: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default=sa_text("false"),
    )
    is_hidden: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default=sa_text("false"),
    )


class VaeNode(ModelBase, VaeNodeMixin, VersionedMixin):
    """Model representing a VAE section."""

    __tablename__ = "vae_node"
    __external_parent_cols__ = {
        "topic_id": ("project_logic_service", "topic"),
        "subtopic_id": ("project_logic_service", "subtopic"),
    }

    __table_args__ = (
        parent_fk("parent_vae_node_id", "vae_node", ondelete=None),
        Index("ix_vae_node_parent_order", "parent_vae_node_id", "order"),
        Index("ix_vae_node_parent", "parent_vae_node_id"),
        Index("ix_vae_node_template", "template_id"),
        *common_table_args(__tablename__),
    )

    parent_vae_node_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    assignee: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    checked_by_assignee: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default=sa_text("false"),
    )
    checked_by_leader: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        server_default=sa_text("false"),
        info={
            PERMISSIONS_KEY: PermissionsMatrix(
                create=ColumnPermissionRule(
                    permissions=(Permission.APPROVE,),
                    ignore_values=(False,),
                ),
                update=ColumnPermissionRule(permissions=(Permission.APPROVE,)),
            ),
        },
    )

    checked_at_assignee: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    checked_at_leader: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        info={
            PERMISSIONS_KEY: PermissionsMatrix(
                create=ColumnPermissionRule(
                    permissions=(Permission.APPROVE,),
                    ignore_values=(None,),
                ),
                update=ColumnPermissionRule(permissions=(Permission.APPROVE,)),
            ),
        },
    )

    topic_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    subtopic_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        nullable=True,
    )

    @override
    def __repr__(self) -> str:
        return f"<VaeNode(id={self.id}, title={self.title})>"


class VaeTemplateNode(Base, VaeNodeMixin, VersionedMixin):
    """Model used to store VAE node templates."""

    __tablename__ = "vae_node_template"

    parent_vae_node_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("vae_node_template.id"), nullable=True
    )

    topic: Mapped[TopicEnum] = mapped_column(
        SAEnum(TopicEnum, name="topic_enum"),
        nullable=True,
    )

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("vae_template.id"),
        nullable=False,
    )


class VaeTemplate(Base, VersionedMixin):
    """Model to orchestrate VAE node templates."""

    __tablename__ = "vae_template"

    __table_args__ = (
        Index(
            "ux_vae_template_active_per_type",
            "project_type_id",
            unique=True,
            postgresql_where=(mapped_column("is_active") == True),  # noqa: E712
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    project_type_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    name: Mapped[str] = mapped_column(
        String,
        nullable=False,
    )

    version: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=1,
        server_default=sa_text("1"),
    )

    is_active: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=True,
        server_default=sa_text("true"),
    )

    @override
    def __repr__(self) -> str:
        return (
            f"<VaeTemplate(id={self.id}, "
            f"project_type_id={self.project_type_id}, "
            f"version={self.version}, active={self.is_active})>"
        )
