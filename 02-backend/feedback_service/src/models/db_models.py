"""SQLAlchemy database models for the Feedback Service."""

from __future__ import annotations

import uuid
from typing import Annotated

from alembic_utils import VersionedMixin
from node_crud import common_table_args, create_node_base
from pydantic import StringConstraints
from sqlalchemy import Enum, String
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column

from src.models.schemas.feedback_schemas import FeedbackRating

Base, NodeBase = create_node_base()

FeedbackText = Annotated[str, StringConstraints(max_length=5000)]
FeedbackReason = Annotated[str, StringConstraints(max_length=30)]


class Feedback(NodeBase, VersionedMixin):
    """User feedback entry."""

    __tablename__ = "feedback"
    __table_args__ = common_table_args(__tablename__)

    rating: Mapped[FeedbackRating] = mapped_column(
        Enum(
            FeedbackRating,
            name="feedbackrating",
        ),
        nullable=False,
    )
    reason: Mapped[FeedbackReason | None] = mapped_column(String(30), nullable=True)
    text: Mapped[FeedbackText | None] = mapped_column(String(5000), nullable=True)
    user_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
