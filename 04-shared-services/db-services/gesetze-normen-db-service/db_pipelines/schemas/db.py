"""schemas for parsing norms from law documents"""

import enum
import re
import hashlib
import json
from pathlib import Path
from datetime import date, datetime
from uuid import UUID, uuid4

from pydantic import BaseModel, field_validator, ValidationInfo
from sqlalchemy import ForeignKey, ForeignKeyConstraint, Index, PrimaryKeyConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import ARRAY, ENUM
from sqlalchemy.types import String, Text
from sqlmodel import Column, Field, Relationship, SQLModel

from db_pipelines.constants import Hierarchy


_ART_PREFIX_RE = re.compile(r"^(?:Art\.?|Artikel)\s*")


class ParagraphTyp(str, enum.Enum):
    """paragraph type enumerator"""

    SINGLE = "§"
    # used to 'bundle' multiple paragraphs (e.g. for deleted entries)
    DOUBLE = "§§"
    ANLAGE = "Anlage"

    @classmethod
    def match_prefix(cls, text: str) -> "tuple[ParagraphTyp | None, str]":
        """Split ``text`` into (typ, remainder) by matching its leading enum value.

        Longer values are tried first so ``§§`` wins over ``§``.
        Boundary: the char after the prefix must be end-of-string, whitespace, or a digit
        (so ``§5a`` matches SINGLE, remainder ``5a``).
        """
        stripped = text.strip()
        for member in sorted(cls, key=lambda m: -len(m.value)):
            prefix = member.value
            if not stripped.startswith(prefix):
                continue
            rest = stripped[len(prefix):]
            if not rest or rest[0].isspace() or rest[0].isdigit():
                return member, rest.lstrip()
        return None, stripped

    @classmethod
    def normalize_prefix(cls, text: str) -> "tuple[ParagraphTyp | None, str]":
        """Like match_prefix but also normalizes Art./Art/Artikel prefixes to §."""
        stripped = text.strip()
        m = _ART_PREFIX_RE.match(stripped)
        if m:
            return cls.match_prefix("§" + stripped[m.end():])
        return cls.match_prefix(stripped)


class DocType(str, enum.Enum):
    """document type"""

    GESETZ = "gesetz"
    VERORDNUNG = "verordnung"
    RICHTLINIE = "richtlinie"
    VERWALTUNGSVORSCHRIFT = "verwaltungsvorschrift"
    TECHNISCHE_NORM = "technische_norm"



class BaseDocument(SQLModel, table=False):
    """base document object"""

    updated_at: datetime = Field(
        default_factory=datetime.now,
        description="timestamp of when the entry was last updated",
    )
    doknr: str = Field(primary_key=True)
    doktyp: DocType = Field(
        description="Document type (i.e. Gesetz, Verordnung, etc)",
        sa_column=Column(type_=ENUM(DocType), nullable=False),
    )
    hierarchy: Hierarchy = Field(
        description="the source of the entry (i.e. Bund, Bundesland, EU, etc)",
        sa_column=Column(type_=ENUM(Hierarchy), nullable=False),
    )
    builddate: str
    jurabk: str = Field(index=True)
    bundesland: str | None = Field(
        default=None,
        index=True,
        description="destatis abbreviation of the federal state (e.g. BY, NW, RP). NULL for EU/Bund.",
    )
    langue: str
    kurzue: str
    ausfertigung_datum: date | None = Field(default=None, serialization_alias="ausfertigung-datum")
    fundstelle: str

    # optional for Verordnungen
    eingangsformel: str | None = None
    schlussformel: str | None = None

    @field_validator("kurzue", mode="before")
    def set_kurzue(cls, v: str, validation_info: ValidationInfo) -> str:
        """sets fallback kurzue to langue if not provided"""
        # pyrefly: ignore [bad-return] - langue is not optional
        return v or validation_info.data.get("langue")

    # sqlmodel doesn't validate tables by default
    # https://github.com/fastapi/sqlmodel/issues/52#issuecomment-1225746421
    class Config:
        validate_assignment = True


class Document(BaseDocument, table=True):
    """entire law"""

    # pyrefly: ignore [bad-override]
    __tablename__ = "documents"

    content_hash: str | None = Field(
        default=None,
        description="SHA256 hash of the document's legal content (used for change detection)",
    )
    standangaben: list["Standangabe"] | None = Relationship(
        back_populates="document",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
        },
    )
    toc: list["TOC"] | None = Relationship(
        back_populates="document",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
        },
    )
    normen: list["Norm"] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
        },
    )
    anlagen: list["Anlage"] = Relationship(
        back_populates="document",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
        },
    )

    def _to_json(self, outpath: str | Path | None = None) -> dict[str, object]:
        """Return a json.dumps()-ready dict from a Document instance, including relations."""
        import json
        json_doc = self.model_dump_json()
        out_doc = json.loads(json_doc)  # ensure the top-level dump is valid JSON
        out_doc["standangaben"] = [json.loads(s.model_dump_json()) for s in self.standangaben] if self.standangaben else None
        out_doc["toc"] = [json.loads(t.model_dump_json()) for t in self.toc] if self.toc else None
        out_doc["normen"] = []
        for norm in self.normen:
            current_norm = json.loads(norm.model_dump_json())
            current_norm["absaetze"] = []
            for absatz in norm.absaetze or []:
                curr_absatz = absatz.model_dump()
                curr_absatz["saetze"] = [json.loads(s.model_dump_json()) for s in absatz.saetze]
                current_norm["absaetze"].append(curr_absatz)
            out_doc["normen"].append(current_norm)
        out_doc["anlagen"] = []
        for anlage in self.anlagen or []:
            curr_anlage = json.loads(anlage.model_dump_json())
            curr_anlage["content"] = anlage.content.model_dump() if isinstance(anlage.content, BaseModel) else anlage.content
            out_doc["anlagen"].append(curr_anlage)
        out_doc["anlagen"] = out_doc["anlagen"] if self.anlagen else None

        if outpath:
            with open(outpath, "w", encoding="utf-8") as f:
                json.dump(out_doc, f, indent=2, ensure_ascii=False)

        return out_doc

    @staticmethod
    def compute_content_hash(document: "Document") -> str:
        """Compute SHA256 hash over the legal content of a document and its children.

        Excludes volatile fields (updated_at, builddate, content_hash) and
        non-content relationships (standangaben, toc, anlagen).
        Ensures stable hashes by sorting child lists (normen, absaetze, saetze).
        """
        exclude_doc = {"updated_at", "builddate", "content_hash", "standangaben", "toc", "normen", "anlagen"}
        exclude_norm = {"absaetze", "document", "fussnoten"}
        exclude_absatz = {"saetze", "source_norm"}
        exclude_satz = {"absatz"}

        doc_data = document.model_dump(exclude=exclude_doc)
        doc_data["normen"] = []

        sorted_norms = sorted(
            document.normen,
            key=lambda n: (n.jurabk, n.paragraph_nr, n.sub_paragraph_nr),
        )

        for norm in sorted_norms:
            norm_data = norm.model_dump(exclude=exclude_norm)
            norm_data["absaetze"] = []

            sorted_absaetze = sorted(norm.absaetze, key=lambda a: a.absatz_nr)

            for absatz in sorted_absaetze:
                absatz_data = absatz.model_dump(exclude=exclude_absatz)

                sorted_saetze = sorted(absatz.saetze, key=lambda s: s.satz_id)
                absatz_data["saetze"] = [satz.model_dump(exclude=exclude_satz) for satz in sorted_saetze]

                norm_data["absaetze"].append(absatz_data)
            doc_data["normen"].append(norm_data)

        content = json.dumps(doc_data, sort_keys=True, ensure_ascii=False, default=str)
        return hashlib.sha256(content.encode()).hexdigest()


class BaseSatz(SQLModel, table=False):
    """shared base class for satz"""

    satz_id: int = Field(
        description="pure numeric ordering (used for sorting)", primary_key=True
    )
    satz_nr: int = Field(
        description="""
        numeric part of the alphanumeric sentence numbering
        (as provided in the source text)
        """
    )
    markers: list[str] = Field(
        default=[],
        description="""
        list of alphabetic parts of the alphanumeric sentence numbering
        (as provided in the source text)
        """,
        sa_column=Column(ARRAY(String), nullable=False),
    )
    satz_text: str = Field(description="atomic sentence")


class Satz(BaseSatz, table=True):
    """Individual Satz table"""

    jurabk: str = Field(
        default=None,
        primary_key=True,
    )
    paragraph_nr: int = Field(
        primary_key=True,
        description="numeric part of the paragraph nr",
    )
    sub_paragraph_nr: str = Field(
        "",
        primary_key=True,
        description="alphabetic part of the paragraph nr",
    )
    absatz_nr: str = Field(
        ..., primary_key=True, description="absatz nr. (can contain alphabetic part)"
    )

    absatz: "Absatz" = Relationship(
        back_populates="saetze",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
            "single_parent": True,
        },
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["jurabk", "paragraph_nr", "sub_paragraph_nr", "absatz_nr"],
            [
                "absatz.jurabk",
                "absatz.paragraph_nr",
                "absatz.sub_paragraph_nr",
                "absatz.absatz_nr",
            ],
            ondelete="CASCADE",
        ),
        PrimaryKeyConstraint(
            "jurabk", "paragraph_nr", "sub_paragraph_nr", "absatz_nr", "satz_id"
        ),
    )


class BaseAbsatz(SQLModel, table=False):
    """Base class for Absatz"""

    absatz_nr: str = Field(
        ..., primary_key=True, description="absatz nr. (can contain alphabetic part)"
    )
    absatz_text: str = Field(description="the entire absatz text")


class Absatz(BaseAbsatz, table=True):
    """Individual Absatz"""

    jurabk: str = Field(
        default=None,
        primary_key=True,
    )
    paragraph_nr: int = Field(
        primary_key=True,
        description="numeric part of the paragraph nr",
    )
    sub_paragraph_nr: str = Field(
        "",
        primary_key=True,
        description="alphabetic part of the paragraph nr",
    )

    saetze: list[Satz] = Relationship(
        back_populates="absatz",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
        },
    )

    source_norm: "Norm" = Relationship(
        back_populates="absaetze",
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["jurabk", "paragraph_nr", "sub_paragraph_nr"],
            ["norm.jurabk", "norm.paragraph_nr", "norm.sub_paragraph_nr"],
            ondelete="CASCADE",
        ),
        PrimaryKeyConstraint("jurabk", "paragraph_nr", "sub_paragraph_nr", "absatz_nr"),
    )


class Footnote(SQLModel, table=True):
    """footnote entries"""

    id_: str = Field(
        primary_key=True, description="unique footnote id, parsed from doc, if available"
    )
    text: str = Field(description="footnote text")
    # maybe something like 'relevent_satz' would be useful
    # if we can parse it out consistently?

    source_norm: "Norm" = Relationship(back_populates="fussnoten")
    jurabk: str = Field(
        default=None,
        index=True,
    )
    paragraph_nr: int = Field(
        description="numeric part of the paragraph nr",
        index=True,
    )
    sub_paragraph_nr: str = Field(
        "",
        description="alphabetic part of the paragraph nr",
        index=True,
    )

    __table_args__ = (
        ForeignKeyConstraint(
            ["jurabk", "paragraph_nr", "sub_paragraph_nr"],
            ["norm.jurabk", "norm.paragraph_nr", "norm.sub_paragraph_nr"],
            ondelete="CASCADE",
        ),
    )


class BaseNorm(SQLModel, table=False):
    """Common Norm attributes"""

    titel: str | None
    doknr: str | None = Field(
        default=None,
        sa_column=Column(String, ForeignKey("documents.doknr", ondelete="CASCADE")),
    )
    jurabk: str = Field(primary_key=True)
    paragraph_text: str = Field(description="the entire norm text")


class Norm(BaseNorm, table=True):
    """Individual Norm in db"""

    __tablename__ = "norm"

    paragraph_typ: ParagraphTyp = Field(
        None, sa_column=Column(type_=ENUM(ParagraphTyp))
    )
    paragraph_nr: int = Field(
        primary_key=True, description="numeric part of the paragraph nr"
    )
    sub_paragraph_nr: str = Field(
        "", primary_key=True, description="alphabetic part of the paragraph nr"
    )

    absaetze: list[Absatz] = Relationship(
        back_populates="source_norm",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
        },
    )
    document: Document | None = Relationship(
        back_populates="normen",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
            "single_parent": True,
        },
    )
    fussnoten: list[Footnote] | None = Relationship(
        back_populates="source_norm",
        sa_relationship_kwargs={
            "cascade": "all, delete-orphan",
            "passive_deletes": True,
        },
    )


class DocumentHistory(BaseDocument, table=True):
    """archived version of a document"""

    __tablename__ = "documents_history"

    version: str = Field(
        description="Content hash of archived document (SHA256)",
    )
    # override PK from BaseDocument — PK is defined via __table_args__ only
    doknr: str = Field()
    # override sa_column fields to create new Column objects for this table
    doktyp: DocType = Field(
        description="Document type (i.e. Gesetz, Verordnung, etc)",
        sa_column=Column(type_=ENUM(DocType, create_type=False), nullable=False),
    )
    hierarchy: Hierarchy = Field(
        description="the source of the entry (i.e. Bund, Bundesland, EU, etc)",
        sa_column=Column(type_=ENUM(Hierarchy, create_type=False), nullable=False),
    )
    archived_at: datetime = Field(default_factory=datetime.now)

    normen: list["NormHistory"] = Relationship(back_populates="document")

    __table_args__ = (PrimaryKeyConstraint("doknr", "version"),)

    @classmethod
    def from_document(cls, document: Document) -> "DocumentHistory":
        """Create a DocumentHistory instance from a Document, including relations."""
        normen = []
        for norm in document.normen:
            absaetze = []
            for absatz in norm.absaetze:
                saetze = []
                for satz in absatz.saetze:
                    saetze.append(SatzHistory(**satz.model_dump()))
                absaetze.append(AbsatzHistory(saetze=saetze, **absatz.model_dump(exclude={"saetze"})))
            normen.append(NormHistory(absaetze=absaetze, **norm.model_dump(exclude={"absaetze"})))

        version = document.content_hash
        if version is None:
            version = Document.compute_content_hash(document)

        return DocumentHistory(
            normen=normen,
            version=version,
            **document.model_dump(exclude={"normen", "standangaben", "toc", "anlagen", "content_hash"}),
        )


class NormHistory(BaseNorm, table=True):
    """archived version of a norm"""

    __tablename__ = "norm_history"

    jurabk: str = Field()
    doknr: str | None = Field(default=None, sa_column=Column(String, nullable=True))
    paragraph_nr: int = Field(description="numeric part of the paragraph nr")
    sub_paragraph_nr: str = Field(
        "", description="alphabetic part of the paragraph nr"
    )
    paragraph_typ: ParagraphTyp = Field(
        None, sa_column=Column(type_=ENUM(ParagraphTyp, create_type=False))
    )
    version: str = Field()
    archived_at: datetime = Field(default_factory=datetime.now)

    document: DocumentHistory | None = Relationship(back_populates="normen")
    absaetze: list["AbsatzHistory"] = Relationship(back_populates="source_norm")

    __table_args__ = (
        ForeignKeyConstraint(
            ["doknr", "version"], ["documents_history.doknr", "documents_history.version"]
        ),
        PrimaryKeyConstraint("jurabk", "paragraph_nr", "sub_paragraph_nr", "version"),
    )


class AbsatzHistory(BaseAbsatz, table=True):
    """archived version of an absatz"""

    __tablename__ = "absatz_history"

    absatz_nr: str = Field(description="absatz nr. (can contain alphabetic part)")
    jurabk: str = Field()
    paragraph_nr: int = Field(description="numeric part of the paragraph nr")
    sub_paragraph_nr: str = Field(
        "", description="alphabetic part of the paragraph nr"
    )
    version: str = Field()
    archived_at: datetime = Field(default_factory=datetime.now)

    source_norm: NormHistory = Relationship(back_populates="absaetze")
    saetze: list["SatzHistory"] = Relationship(back_populates="absatz")

    __table_args__ = (
        ForeignKeyConstraint(
            ["jurabk", "paragraph_nr", "sub_paragraph_nr", "version"],
            [
                "norm_history.jurabk",
                "norm_history.paragraph_nr",
                "norm_history.sub_paragraph_nr",
                "norm_history.version",
            ],
        ),
        PrimaryKeyConstraint(
            "jurabk", "paragraph_nr", "sub_paragraph_nr", "absatz_nr", "version"
        ),
    )


class SatzHistory(BaseSatz, table=True):
    """archived version of a satz"""

    __tablename__ = "satz_history"

    satz_id: int = Field(description="pure numeric ordering (used for sorting)")
    markers: list[str] = Field(default=[], sa_column=Column(ARRAY(String), nullable=False))
    jurabk: str = Field()
    paragraph_nr: int = Field(description="numeric part of the paragraph nr")
    sub_paragraph_nr: str = Field(
        "", description="alphabetic part of the paragraph nr"
    )
    absatz_nr: str = Field(description="absatz nr. (can contain alphabetic part)")
    version: str = Field()
    archived_at: datetime = Field(default_factory=datetime.now)

    absatz: AbsatzHistory = Relationship(back_populates="saetze")

    __table_args__ = (
        ForeignKeyConstraint(
            ["jurabk", "paragraph_nr", "sub_paragraph_nr", "absatz_nr", "version"],
            [
                "absatz_history.jurabk",
                "absatz_history.paragraph_nr",
                "absatz_history.sub_paragraph_nr",
                "absatz_history.absatz_nr",
                "absatz_history.version",
            ],
        ),
        PrimaryKeyConstraint(
            "jurabk",
            "paragraph_nr",
            "sub_paragraph_nr",
            "absatz_nr",
            "satz_id",
            "version",
        ),
    )


class TOC(SQLModel, table=True):
    """table of contents for the law (enbez='Inhaltsübersicht')"""

    __tablename__ = "toc_entries"

    gliederungsbezug: str = Field(
        alias="Ident", description="if nested in the form `level - level - level ..`"
    )
    gliederungstitel: str = Field(
        alias="Title", description="if nested in the form `level - level - level ..`"
    )
    paragraph_typ: ParagraphTyp | None = Field(
        None, sa_column=Column(type_=ENUM(ParagraphTyp))
    )
    paragraph_nr: str | None = None
    text: str | None = None

    id: int | None = Field(None, primary_key=True)
    jurabk: str = Field(index=True)
    doknr: str | None = Field(
        default=None,
        sa_column=Column(String, ForeignKey("documents.doknr", ondelete="CASCADE")),
    )
    document: Document | None = Relationship(back_populates="toc")


class Anlage(SQLModel, table=True):
    """Attachments (enbez='Anlage')"""

    __tablename__ = "anlagen"

    id_: UUID = Field(default_factory=uuid4, primary_key=True)
    jurabk: str = Field(index=True)
    title: str
    content: str

    doknr: str | None = Field(
        default=None,
        sa_column=Column(String, ForeignKey("documents.doknr", ondelete="CASCADE")),
    )
    document: Document | None = Relationship(back_populates="anlagen")


class Standangabe(SQLModel, table=True):
    """metadata about updates"""

    __tablename__ = "standangaben"

    id: int | None = Field(None, primary_key=True)
    standtyp: str
    standkommentar: str

    doknr: str | None = Field(
        default=None,
        sa_column=Column(String, ForeignKey("documents.doknr", ondelete="CASCADE")),
    )
    document: Document | None = Relationship(back_populates="standangaben")


class BaseTechnischeNorm(SQLModel, table=False):
    """Base fields for technische Normen entries."""

    dokument: str = Field(sa_column=Column(Text, nullable=False, index=True))
    titel_de: str = Field(sa_column=Column(Text, nullable=False))
    titel_en: str = Field(sa_column=Column(Text, nullable=False))
    kurzbeschreibung: str = Field(sa_column=Column(Text, nullable=False))


class TechnischeNorm(BaseTechnischeNorm, table=True):
    """Technische Normen keyed by dokument identifier."""

    __tablename__ = "technische_normen"
    __table_args__ = (UniqueConstraint("dokument", name="uq_technische_normen_dokument"),)

    id: int | None = Field(default=None, primary_key=True)


class BaseLegaldefinition(SQLModel, table=False):
    """Base fields for extracted legal definitions."""

    jurabk: str = Field(index=True)
    paragraph_nr: str
    titel: str = Field(sa_column=Column(Text, nullable=False))
    begriff: str = Field(sa_column=Column(Text, nullable=False))
    definition: str = Field(sa_column=Column(Text, nullable=False))


class Legaldefinition(BaseLegaldefinition, table=True):
    """Extracted legal definitions keyed by law abbreviation and term."""

    __tablename__ = "legaldefinitionen"
    __table_args__ = (
        UniqueConstraint("jurabk", "begriff", name="uq_legaldefinitionen_jurabk_begriff"),
        Index("ix_legaldefinitionen_jurabk_titel", "jurabk", "titel"),
    )

    id: int | None = Field(default=None, primary_key=True)

