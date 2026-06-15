"""DB schema defitions"""

from typing import Optional, Annotated

# from uuid import UUID, uuid4
from sqlmodel import SQLModel, Field, Relationship, Column
from sqlalchemy.dialects.postgresql import ENUM  # ARRAY,
from pydantic import Field as PydanticField
from enum import Enum
from datetime import date


# validate hashes via regex
BLAKE2S_REGEX_PATTERN = r"^[a-f0-9]{64}$"
HashType = Annotated[str, PydanticField(pattern=BLAKE2S_REGEX_PATTERN)]


class DocType(Enum):
    GESETZ = "Gesetz"
    VERORDNUNG = "Verordnung"
    RICHTLINIE = "Richtlinie"


class BaseNorm(SQLModel, table=False):
    """Affected Norms Table"""

    paragraph_nr: str = Field(primary_key=True)
    current_text: str = Field(description="current law text (from gesetze-normen-db)")
    change_text: str = Field(description="source text for the change")
    new_text: str = Field(description="law text after change")
    transitional_note: str = Field("", description="übergangsregelung")


class Norm(BaseNorm, table=True):
    """Affected Norms Table"""

    jurabk: str = Field(primary_key=True)
    name: str = Field(description="name as parsed from the original feed?")
    doc_id: Optional[HashType] = Field(None, foreign_key="documents.doc_id")
    document: "Document" = Relationship(back_populates="affected_norms")
    valid_from: date = Field(description="date when the change comes into effect")


class Document(SQLModel, table=True):
    """main documents table"""

    __tablename__ = "documents"

    doc_id: Optional[HashType] = Field(
        None, primary_key=True, description="unique document hash"
    )
    doc_type: DocType = Field(None, sa_column=Column(type_=ENUM(DocType)))
    title: str
    valid_from: date = Field(description="date when the change comes into effect")
    affected_norms: list[Norm] = Relationship(back_populates="document")
