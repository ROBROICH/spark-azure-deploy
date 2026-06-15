"""Database models for FPP service."""

import enum
import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Base class for all database models."""

    pass


class TimestampMixin:
    """Timestamp mixin to automatically create timestamps."""

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class FPPRequestStatus(str, enum.Enum):
    """Status of an FPP request."""

    RECEIVED = "RECEIVED"
    IMPORTING = "IMPORTING"
    IMPORTED = "IMPORTED"
    FAILED = "FAILED"


class FPPFileType(str, enum.Enum):
    """Type of file attached to an FPP request."""

    PLANUNTERLAGEN = "PLANUNTERLAGEN"
    ERGAENZENDE_UNTERLAGEN = "ERGAENZENDE_UNTERLAGEN"


class FPPRequest(Base, TimestampMixin):
    """FPP request model - stores project creation requests from FPP platform."""

    __tablename__ = "fpp_request"

    # Primary identifier
    request_id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Project identification
    internal_project_id = Column(String, nullable=False, index=True)  # Aktenzeichen
    name = Column(String, nullable=False)  # Vorhaben Name

    # Raw data
    xml = Column(Text, nullable=False)  # Raw XML for future processing

    # Project creation tracking
    project_id = Column(UUID(as_uuid=True), nullable=True)  # Created project ID
    status = Column(String, nullable=False, default=FPPRequestStatus.RECEIVED.value)

    # Relationships
    files = relationship("FPPFile", back_populates="request", cascade="all, delete-orphan")


class FPPFile(Base, TimestampMixin):
    """FPP file model - stores file URLs for project documents."""

    __tablename__ = "fpp_file"

    # Primary identifier
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)

    # Foreign key
    request_id = Column(UUID(as_uuid=True), ForeignKey("fpp_request.request_id"), nullable=False, index=True)

    # File details
    file_type = Column(String, nullable=False)
    file_url = Column(String, nullable=False)
    file_name = Column(String, nullable=True)

    # Download tracking
    downloaded = Column(Boolean, nullable=False, default=False)
    dms_file_id = Column(UUID(as_uuid=True), nullable=True)

    # Relationships
    request = relationship("FPPRequest", back_populates="files")
