"""database schema definitions"""

from datetime import date
from typing import Any, Optional, List
from sqlmodel import SQLModel, Field, Relationship
from sqlalchemy.schema import ForeignKey, Column
from sqlalchemy import String, Integer
from pgvector.sqlalchemy import Vector

DIMENSIONS = 1024


class NormLinkTable(SQLModel, table=True):
    """association table for many-to-many relationship between documents and norms"""

    __tablename__ = "document_norm_link"  # type: ignore[assignment]

    id: int = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    doc_id: str = Field(
        sa_column=Column(
            "doc_id", String, ForeignKey("documents.doc_id", ondelete="CASCADE")
        ),
        description="Reference to parent document",
    )
    chunk_id: Optional[int] = Field(
        sa_column=Column(
            "chunk_id", Integer, ForeignKey("chunks.chunk_id", ondelete="CASCADE")
        ),
        description="Reference to parent chunk",
    )

    norm_id: int = Field(
        sa_column=Column(
            "norm_id", Integer, ForeignKey("normen.norm_id", ondelete="CASCADE")
        ),
        description="Reference to legal norm",
    )


class RegionLinkTable(SQLModel, table=True):
    """association table for many-to-many relationship between documents and regions"""

    __tablename__ = "document_region_link"  # type: ignore[assignment]

    id: int = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    doc_id: str = Field(
        foreign_key="documents.doc_id", description="Reference to parent document"
    )
    region_id: int = Field(
        foreign_key="region.region_id", description="Reference to geographic region"
    )


class Document(SQLModel, table=True):
    """main documents table"""

    __tablename__ = "documents"  # type: ignore[assignment]

    doc_id: str = Field(primary_key=True, description="Unique document identifier")
    aktenzeichen: str = Field(default="", description="Case number", index=True)
    gericht: str = Field(default="", description="Court name")
    spruchkoerper: str = Field(default="", description="Decision body")
    entsch_datum: date = Field(description="Decision date")
    doktyp: str = Field(default="", description="Document type")
    mitwirkung: str = Field(default="", description="Involved parties")

    titelzeile: Optional[str] = Field(default=None, description="Title line")
    leitsatz: Optional[str] = Field(default=None, description="Leading sentence")
    sonstosatz: Optional[str] = Field(default=None, description="Other sentence")
    vorinstanz: Optional[str] = Field(None)

    normen: Optional[List["Norm"]] = Relationship(
        back_populates="documents",
        link_model=NormLinkTable,
        sa_relationship_kwargs={"cascade": "all, delete"},
    )
    region: Optional["Region"] = Relationship(
        back_populates="documents",
        link_model=RegionLinkTable,
        sa_relationship_kwargs={"cascade": "all, delete"},
    )
    leitsaetze: Optional[List["Leitsatz"]] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    sonstosaetze: Optional[List["Sonstosatz"]] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    tenor: Optional[List["Tenor"]] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    tatbestaende: Optional[List["Tatbestand"]] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    entscheidungsgruende: Optional[List["Entscheidungsgrund"]] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )
    gruende: Optional[List["Grund"]] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )

    chunks: Optional[List["Chunk"]] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={"cascade": "all, delete-orphan"},
    )


class Norm(SQLModel, table=True):
    """legal norms referenced in documents"""

    __tablename__ = "normen"  # type: ignore[assignment]

    norm_id: int = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    full_text: str = Field(
        description="The legal norm reference (e.g., '§ 44 BNatSchG')"
    )
    name: str = Field(description="the law name (without suffix, e.g. 'BNatSchG')")
    name_suffix: str | None = Field(
        default=None, description="the law name suffix (e.g., '2009' for BNatSchG_2009)"
    )
    paragraph_nr: int | None = Field(
        default=None,
        description="the paragraph number (e.g., '44' for '§ 44 BNatSchG')",
    )
    paragraph_nr_suffix: str | None = Field(
        default=None,
        description="the paragraph number suffix (e.g., 'a' for '§ 44a BNatSchG')",
    )
    absatz_nr: str | None = Field(
        default=None,
        description="the full Absatz number (e.g., '1' for '§ 44 Abs. 1 BNatSchG')",
    )
    documents: Optional[List["Document"]] = Relationship(
        back_populates="normen",
        link_model=NormLinkTable,
        sa_relationship_kwargs={"passive_deletes": True},
    )
    chunks: Optional[List["Chunk"]] = Relationship(
        back_populates="normen",
        link_model=NormLinkTable,
        sa_relationship_kwargs={
            "passive_deletes": True,
            "overlaps": "documents,normen",
        },
    )


class Region(SQLModel, table=True):
    """geographic region where the document was published"""

    __tablename__ = "region"  # type: ignore[assignment]

    region_id: int = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    abk: str = Field(description="Abbreviation (e.g., 'DEU')")
    long: str = Field(description="Full name (e.g., 'Bundesrepublik Deutschland')")
    documents: Optional[List[Document]] = Relationship(
        back_populates="region",
        link_model=RegionLinkTable,
        sa_relationship_kwargs={"passive_deletes": True},
    )


class BaseListItem(SQLModel, table=False):
    """base class for list items like leitsatz, sonstosatz, etc."""

    title: str | None = Field(default=None, description="Section name or identifier")
    text: str = Field(description="The actual text content")


class Leitsatz(BaseListItem, table=True):
    """leitsaetze (leading sentences) of legal decisions"""

    __tablename__ = "leitsaetze"  # type: ignore[assignment]

    leitsatz_id: int = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    doc_id: str = Field(
        foreign_key="documents.doc_id", description="Reference to parent document"
    )
    document: Optional[Document] = Relationship(back_populates="leitsaetze")


class Sonstosatz(BaseListItem, table=True):
    """sonstosatz (other sentences) of legal decisions"""

    __tablename__ = "sonstosatz"  # type: ignore[assignment]

    sonstosatz_id: int = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    doc_id: str = Field(
        foreign_key="documents.doc_id", description="Reference to parent document"
    )
    document: Optional[Document] = Relationship(back_populates="sonstosaetze")


class Tenor(BaseListItem, table=True):
    """tenor (operative part) of legal decisions"""

    __tablename__ = "tenor"  # type: ignore[assignment]

    tenor_id: int = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    doc_id: str = Field(
        foreign_key="documents.doc_id", description="Reference to parent document"
    )
    document: Optional[Document] = Relationship(back_populates="tenor")


class Tatbestand(BaseListItem, table=True):
    """tatbestand (facts of the case) of legal decisions"""

    __tablename__ = "tatbestaende"  # type: ignore[assignment]

    tatbestand_id: int = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    doc_id: str = Field(
        foreign_key="documents.doc_id", description="Reference to parent document"
    )
    document: Optional[Document] = Relationship(back_populates="tatbestaende")


class Entscheidungsgrund(BaseListItem, table=True):
    """legal reasoning and grounds for decisions"""

    __tablename__ = "entscheidungsgruende"  # type: ignore[assignment]

    entscheidungsgrund_id: int = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    doc_id: str = Field(
        foreign_key="documents.doc_id", description="Reference to parent document"
    )
    document: Optional[Document] = Relationship(back_populates="entscheidungsgruende")


class Grund(BaseListItem, table=True):
    """legal reasoning and grounds for decisions"""

    __tablename__ = "gruende"  # type: ignore[assignment]

    grund_id: int = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    doc_id: str = Field(
        foreign_key="documents.doc_id", description="Reference to parent document"
    )
    document: Optional[Document] = Relationship(back_populates="gruende")


class BaseChunk(SQLModel, table=False):
    """base class for text chunks"""

    section_title: str
    section_number: str = Field(index=True)
    section_text: str = Field(description="The entire section text")
    chunk_index: int
    start_char: int
    end_char: int
    section_length: int
    is_complete_section: bool
    is_part_of: str | None
    text: str = Field(description="The text content of the chunk")


class Chunk(BaseChunk, table=True):
    """text chunks for vectorization and embedding"""

    __tablename__ = "chunks"  # type: ignore[assignment]

    chunk_id: Optional[int] = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    doc_id: str = Field(
        foreign_key="documents.doc_id",
        description="Reference to parent document",
        index=True,
    )
    embedding: Any = Field(
        sa_column=Column("embedding", Vector(DIMENSIONS), nullable=False),
        description=f"Embedding vector of dimension {DIMENSIONS}",
    )
    document: Optional[Document] = Relationship(back_populates="chunks")
    normen: Optional[List[Norm]] = Relationship(
        back_populates="chunks",
        link_model=NormLinkTable,
        sa_relationship_kwargs={"overlaps": "documents,normen"},
    )
    citations: Optional[list["Citation"]] = Relationship(
        back_populates="chunk", sa_relationship_kwargs={"cascade": "all, delete"}
    )


class Citation(SQLModel, table=True):
    """in-text citations, extracted from chunks"""

    __tablename__ = "citations"  # type: ignore[assignment]

    citation_id: Optional[int] = Field(
        default=None, primary_key=True, description="Auto-generated primary key"
    )
    chunk_id: Optional[int] = Field(
        foreign_key="chunks.chunk_id",
        description="Reference to parent chunk",
        index=True,
    )
    aktenzeichen: str
    randnummer: int
    chunk: Chunk = Relationship(back_populates="citations")
