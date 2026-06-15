import uuid
from typing import Any, ClassVar, Optional

from alembic_utils import VersionedMixin
from node_crud import common_table_args, create_node_base, parent_fk
from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    Float,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import text as sa_text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.dialects.postgresql import UUID as PG_UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

Base, ModelBase = create_node_base()


class Project(ModelBase, VersionedMixin):
    """Root project — no project_id FK, IS the project."""

    __tablename__ = "project"

    # Override: Project IS the project, so project_id is nullable (self-ref).
    project_id: Mapped[uuid.UUID] = mapped_column(  # pyrefly: ignore[missing-override-decorator]
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )

    __table_args__ = (
        parent_fk("project_id", "project", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )


class Gesetz(ModelBase, VersionedMixin):
    __tablename__ = "gesetz"

    name: Mapped[str] = mapped_column(Text, nullable=False)
    jurabk: Mapped[str] = mapped_column(String, nullable=False)

    __table_args__ = (
        UniqueConstraint("project_id", "project_version", "jurabk", name="uq_gesetz_project_id_jurabk"),
        *common_table_args(__tablename__),
    )


class Standangabe(ModelBase, VersionedMixin):
    """Stand metadata entries for a Gesetz."""

    __tablename__ = "standangabe"

    __table_args__ = (
        parent_fk("gesetz_id", "gesetz", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    gesetz_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    standtyp: Mapped[str] = mapped_column(String, nullable=False)
    standkommentar: Mapped[str] = mapped_column(Text, nullable=False)
    doknr: Mapped[str] = mapped_column(String, nullable=True)
    external_id: Mapped[int] = mapped_column(Integer, nullable=True)

    gesetz: Mapped["Gesetz"] = relationship()


class Norm(ModelBase, VersionedMixin):
    __tablename__ = "norm"

    gesetz_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    paragraph_nr: Mapped[str] = mapped_column(String, nullable=False)
    paragraph_titel: Mapped[str] = mapped_column(Text, nullable=True)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    regelungsgegenstand: Mapped[str] = mapped_column(Text, nullable=True)

    gesetz: Mapped["Gesetz"] = relationship()

    __table_args__ = (
        parent_fk("gesetz_id", "gesetz", ondelete="CASCADE"),
        UniqueConstraint(
            "project_id",
            "project_version",
            "gesetz_id",
            "paragraph_nr",
            name="uq_norm_project_id_gesetz_id_paragraph_nr",
        ),
        *common_table_args(__tablename__),
    )


class Absatz(ModelBase, VersionedMixin):
    __tablename__ = "absatz"

    __table_args__ = (
        parent_fk("norm_id", "norm", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    norm_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    absatz_nr: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    norm: Mapped["Norm"] = relationship()


class Satz(ModelBase, VersionedMixin):
    __tablename__ = "satz"

    __table_args__ = (
        parent_fk("absatz_id", "absatz", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    absatz_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    satz_nr: Mapped[str] = mapped_column(String, nullable=False)
    position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    markers: Mapped[list[str]] = mapped_column(
        ARRAY(Text()),
        nullable=False,
        default=list,
        server_default=sa_text("'{}'::text[]"),
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    norm_typ_lvl_1: Mapped[str] = mapped_column(String, nullable=True)
    norm_typ_lvl_2: Mapped[str] = mapped_column(String, nullable=True)
    tatbestandsmerkmale: Mapped[list[Any]] = mapped_column(JSON, nullable=True)
    formel: Mapped[str] = mapped_column(Text, nullable=True)
    wenn_dann: Mapped[str] = mapped_column(Text, nullable=True)

    absatz: Mapped["Absatz"] = relationship()


# ── TBM subtree ─────────────────────────────────────────────────────────────


class AtomaresTbm(ModelBase, VersionedMixin):
    __tablename__ = "atomares_tbm"

    __table_args__ = (
        parent_fk("satz_id", "satz", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    satz_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    prueffrage: Mapped[str] = mapped_column(Text, nullable=True)
    pruefgegenstand: Mapped[str] = mapped_column(Text, nullable=True)

    satz: Mapped["Satz"] = relationship()


class TechnischeNorm(ModelBase, VersionedMixin):
    __tablename__ = "technische_norm"

    __table_args__ = (
        parent_fk("atomares_tbm_id", "atomares_tbm", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    atomares_tbm_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    atomares_tbm: Mapped["AtomaresTbm"] = relationship()


class TechnischeNormEntry(ModelBase, VersionedMixin):  # NOTUSED
    __tablename__ = "technische_norm_entry"

    __table_args__ = (
        parent_fk("technische_norm_id", "technische_norm", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    technische_norm_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    entry_id: Mapped[str] = mapped_column(String, nullable=False)
    kurzbeschreibung: Mapped[str] = mapped_column(Text, nullable=False)

    technische_norm: Mapped["TechnischeNorm"] = relationship()


class BestimmterRechtsbegriff(ModelBase, VersionedMixin):
    __tablename__ = "bestimmter_rechtsbegriff"

    __table_args__ = (
        parent_fk("atomares_tbm_id", "atomares_tbm", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    atomares_tbm_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    begriff: Mapped[str] = mapped_column(String, nullable=False)

    atomares_tbm: Mapped["AtomaresTbm"] = relationship()


class Legaldefinition(ModelBase, VersionedMixin):
    __tablename__ = "legaldefinition"

    __table_args__ = (
        parent_fk("bestimmter_rechtsbegriff_id", "bestimmter_rechtsbegriff", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    bestimmter_rechtsbegriff_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    begriff: Mapped[str] = mapped_column(String, nullable=False)
    definition: Mapped[str] = mapped_column(Text, nullable=False)
    source_jurabk: Mapped[str] = mapped_column(String, nullable=True)
    source_paragraph_nr: Mapped[str] = mapped_column(String, nullable=True)

    bestimmter_rechtsbegriff: Mapped["BestimmterRechtsbegriff"] = relationship()


class UnbestimmterRechtsbegriff(ModelBase, VersionedMixin):
    __tablename__ = "unbestimmter_rechtsbegriff"

    __table_args__ = (
        parent_fk("atomares_tbm_id", "atomares_tbm", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    atomares_tbm_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    begriff: Mapped[str] = mapped_column(String, nullable=False)
    auslegung: Mapped[str] = mapped_column(Text, nullable=False)

    atomares_tbm: Mapped["AtomaresTbm"] = relationship()


class Auslegungsvorschlag(ModelBase, VersionedMixin):
    __tablename__ = "auslegungsvorschlag"

    __table_args__ = (
        parent_fk("unbestimmter_rechtsbegriff_id", "unbestimmter_rechtsbegriff", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    unbestimmter_rechtsbegriff_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    methode: Mapped[str] = mapped_column(String, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    unbestimmter_rechtsbegriff: Mapped["UnbestimmterRechtsbegriff"] = relationship()


# ── Rechtsfolge subtree ─────────────────────────────────────────────────────


class Rechtsfolge(ModelBase, VersionedMixin):
    __tablename__ = "rechtsfolge"

    __table_args__ = (
        parent_fk("satz_id", "satz", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    satz_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)

    satz: Mapped["Satz"] = relationship()


class Sollensanordnungen(ModelBase, VersionedMixin):
    __tablename__ = "sollensanordnungen"

    __table_args__ = (
        parent_fk("rechtsfolge_id", "rechtsfolge", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    rechtsfolge_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    kategorie: Mapped[str] = mapped_column(String, nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=True)

    rechtsfolge: Mapped["Rechtsfolge"] = relationship()


class Adressat(ModelBase, VersionedMixin):
    __tablename__ = "adressat"

    __table_args__ = (
        parent_fk("rechtsfolge_id", "rechtsfolge", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    rechtsfolge_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    entscheidung: Mapped[str] = mapped_column(String, nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=True)

    rechtsfolge: Mapped["Rechtsfolge"] = relationship()


class Ermessensspielraum(ModelBase, VersionedMixin):  # NOTUSED
    __tablename__ = "ermessensspielraum"

    __table_args__ = (
        parent_fk("rechtsfolge_id", "rechtsfolge", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    rechtsfolge_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    entscheidung: Mapped[str] = mapped_column(String, nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=True)

    rechtsfolge: Mapped["Rechtsfolge"] = relationship()


class Ermessensart(ModelBase, VersionedMixin):  # NOTUSED
    __tablename__ = "ermessensart"

    __table_args__ = (
        parent_fk("rechtsfolge_id", "rechtsfolge", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    rechtsfolge_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    art: Mapped[str] = mapped_column(String, nullable=False)
    reasoning: Mapped[str] = mapped_column(Text, nullable=True)

    rechtsfolge: Mapped["Rechtsfolge"] = relationship()


class ExpliziterVerweis(ModelBase, VersionedMixin):
    """Multi-parent: rechtsfolge OR atomares_tbm."""

    __tablename__ = "expliziter_verweis"

    rechtsfolge_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    atomares_tbm_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    gesetz: Mapped[str] = mapped_column(String, nullable=True)
    paragraph_nr: Mapped[str] = mapped_column(String, nullable=True)
    absatz_nr: Mapped[str] = mapped_column(String, nullable=True)
    satz_nr: Mapped[str] = mapped_column(String, nullable=True)
    untergliederung: Mapped[list[Any]] = mapped_column(JSON, nullable=True)
    verweis_typ: Mapped[str] = mapped_column(String, nullable=True)
    kontext: Mapped[list[Any]] = mapped_column(JSON, nullable=True)

    rechtsfolge: Mapped[Optional["Rechtsfolge"]] = relationship()
    atomares_tbm: Mapped[Optional["AtomaresTbm"]] = relationship()

    __table_args__ = (
        parent_fk("rechtsfolge_id", "rechtsfolge", ondelete="CASCADE"),
        parent_fk("atomares_tbm_id", "atomares_tbm", ondelete="CASCADE"),
        CheckConstraint(
            "(CASE WHEN rechtsfolge_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN atomares_tbm_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="chk_expliziter_verweis_one_parent",
        ),
        *common_table_args(__tablename__),
    )


class ImpliziterVerweis(ModelBase, VersionedMixin):
    """Multi-parent: rechtsfolge OR atomares_tbm."""

    __tablename__ = "impliziter_verweis"

    rechtsfolge_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    atomares_tbm_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    target_ref: Mapped[str] = mapped_column(String, nullable=True)
    rationale: Mapped[str] = mapped_column(Text, nullable=False)

    rechtsfolge: Mapped[Optional["Rechtsfolge"]] = relationship()
    atomares_tbm: Mapped[Optional["AtomaresTbm"]] = relationship()

    __table_args__ = (
        parent_fk("rechtsfolge_id", "rechtsfolge", ondelete="CASCADE"),
        parent_fk("atomares_tbm_id", "atomares_tbm", ondelete="CASCADE"),
        CheckConstraint(
            "(CASE WHEN rechtsfolge_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN atomares_tbm_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="chk_impliziter_verweis_one_parent",
        ),
        *common_table_args(__tablename__),
    )


# ── Document hierarchy ──────────────────────────────────────────────────────


class MarkdownText(ModelBase, VersionedMixin):
    __tablename__ = "markdown_text"

    __table_args__ = common_table_args(__tablename__)

    text: Mapped[str] = mapped_column(Text, nullable=False)


class Dokument(ModelBase, VersionedMixin):
    __tablename__ = "dokument"
    __external_parent_cols__: ClassVar[dict[str, str | tuple[str, str]]] = {  # pyrefly: ignore[bad-override]
        "dms_file_id": ("document_management_service", "file")
    }

    __table_args__ = (
        parent_fk("markdown_text_id", "markdown_text", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    dms_file_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    document_id: Mapped[str | None] = mapped_column(String, nullable=True)
    filename: Mapped[str] = mapped_column(String, nullable=False)
    mime_type: Mapped[str] = mapped_column(String, nullable=False)
    page_count: Mapped[int] = mapped_column(Integer, nullable=False)
    document_type: Mapped[str | None] = mapped_column(String, nullable=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    markdown_text_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    is_toc_document: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default=sa_text("false"),
    )

    markdown_text: Mapped["MarkdownText"] = relationship()


class Chunk(ModelBase, VersionedMixin):
    __tablename__ = "chunk"

    __table_args__ = (
        parent_fk("dokument_id", "dokument", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    dokument_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    header: Mapped[str] = mapped_column(Text, nullable=False)
    page_content: Mapped[str] = mapped_column(Text, nullable=False, server_default="")
    page_numbers: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)
    toc_path: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)
    all_subchapters: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)
    hypothetical_questions: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    next_chunk_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    previous_chunk_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    page_index_node_id: Mapped[str | None] = mapped_column(String, nullable=True)
    page_index_position: Mapped[int | None] = mapped_column(Integer, nullable=True)
    page_index_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    dokument: Mapped["Dokument"] = relationship()


# ── SubChunk hierarchy ─────────────────────────────────────────────────────


class SubChunk(ModelBase, VersionedMixin):
    __tablename__ = "sub_chunk"

    __table_args__ = (
        parent_fk("chunk_id", "chunk", ondelete="CASCADE"),
        parent_fk("markdown_text_id", "markdown_text", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    chunk_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    header: Mapped[str] = mapped_column(Text, nullable=False)
    chunk_type: Mapped[str] = mapped_column(String, nullable=False)
    focus_topic: Mapped[str] = mapped_column(Text, nullable=False)
    hypothetical_questions: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)
    order: Mapped[int] = mapped_column(Integer, nullable=False)
    next_sub_chunk_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    previous_sub_chunk_id: Mapped[uuid.UUID | None] = mapped_column(PG_UUID(as_uuid=True), nullable=True)
    markdown_text_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    # Fields needed for Qdrant re-indexing via ensure_qdrant
    page_numbers: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False, server_default="{}")
    header_1: Mapped[str | None] = mapped_column(Text, nullable=True)
    header_2: Mapped[str | None] = mapped_column(Text, nullable=True)
    header_3: Mapped[str | None] = mapped_column(Text, nullable=True)
    wildlife_mentioned: Mapped[bool | None] = mapped_column(nullable=True)
    plant_species_mentioned: Mapped[bool | None] = mapped_column(nullable=True)
    wildlife_species: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    plant_species: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False, server_default="{}")
    map_scale: Mapped[str | None] = mapped_column(String, nullable=True)

    chunk: Mapped["Chunk"] = relationship()
    markdown_text: Mapped["MarkdownText"] = relationship()


class SubChunkText(ModelBase, VersionedMixin):
    __tablename__ = "sub_chunk_text"

    __table_args__ = (
        parent_fk("sub_chunk_id", "sub_chunk", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    sub_chunk_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )

    sub_chunk: Mapped["SubChunk"] = relationship()


class SubChunkTable(ModelBase, VersionedMixin):
    __tablename__ = "sub_chunk_table"

    __table_args__ = (
        parent_fk("sub_chunk_id", "sub_chunk", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    sub_chunk_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    asset_path: Mapped[str] = mapped_column(String, nullable=False)
    caption: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    footnote: Mapped[str] = mapped_column(Text, nullable=False)

    sub_chunk: Mapped["SubChunk"] = relationship()


class SubChunkImage(ModelBase, VersionedMixin):
    __tablename__ = "sub_chunk_image"

    __table_args__ = (
        parent_fk("sub_chunk_id", "sub_chunk", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    sub_chunk_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    asset_path: Mapped[str] = mapped_column(String, nullable=False)
    caption: Mapped[str] = mapped_column(Text, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    footnote: Mapped[str] = mapped_column(Text, nullable=False)

    sub_chunk: Mapped["SubChunk"] = relationship()


class SubChunkRelation(ModelBase, VersionedMixin):
    __tablename__ = "sub_chunk_relation"

    from_sub_chunk_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    to_sub_chunk_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    relation_type: Mapped[str] = mapped_column(String, nullable=False)

    from_sub_chunk: Mapped["SubChunk"] = relationship(foreign_keys=[from_sub_chunk_id])
    to_sub_chunk: Mapped["SubChunk"] = relationship(foreign_keys=[to_sub_chunk_id])

    __table_args__ = (
        parent_fk("from_sub_chunk_id", "sub_chunk", ondelete="CASCADE"),
        parent_fk("to_sub_chunk_id", "sub_chunk", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )


class Widerspruch(ModelBase, VersionedMixin):  # NOTUSED
    __tablename__ = "widerspruch"

    __table_args__ = (
        parent_fk("dokument_id", "dokument", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    dokument_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)
    severity: Mapped[str] = mapped_column(String, nullable=False)

    dokument: Mapped["Dokument"] = relationship()


# ── Search / Evaluation ─────────────────────────────────────────────────────


class Fundstelle(ModelBase, VersionedMixin):
    """Links a document to a satz via gesetz + norm."""

    __tablename__ = "fundstelle"

    __table_args__ = (
        parent_fk("satz_id", "satz", ondelete="CASCADE"),
        parent_fk("dokument_id", "dokument", ondelete="CASCADE"),
        parent_fk("gesetz_id", "gesetz", ondelete="CASCADE"),
        parent_fk("norm_id", "norm", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    satz_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    dokument_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    gesetz_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    norm_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False, index=True)

    title: Mapped[str] = mapped_column(Text, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)
    page_numbers: Mapped[list[int]] = mapped_column(
        ARRAY(Integer),
        default=list,
        server_default=sa_text("ARRAY[]::integer[]"),
        nullable=False,
    )
    chunk_ids: Mapped[list[uuid.UUID]] = mapped_column(
        ARRAY(PG_UUID(as_uuid=True)),
        default=list,
        server_default=sa_text("ARRAY[]::uuid[]"),
        nullable=False,
    )
    dokument: Mapped["Dokument"] = relationship()
    gesetz: Mapped["Gesetz"] = relationship()
    norm: Mapped["Norm"] = relationship()


class Bewertung(ModelBase, VersionedMixin):
    """Assessment result for a single Satz (from BewertungsWorkflow)."""

    __tablename__ = "bewertung"

    __table_args__ = (
        parent_fk("satz_id", "satz", ondelete="CASCADE"),
        parent_fk("markdown_text_id", "markdown_text", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    satz_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    result: Mapped[str] = mapped_column(String, nullable=False)
    kurzform: Mapped[str | None] = mapped_column(Text, nullable=True)
    norm: Mapped[str] = mapped_column(Text, nullable=False)
    markdown_text_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    satz: Mapped["Satz"] = relationship()
    markdown_text: Mapped["MarkdownText"] = relationship()


class BewertungKapitel(ModelBase, VersionedMixin):
    """Single chapter within a Bewertung."""

    __tablename__ = "bewertung_kapitel"

    __table_args__ = (
        parent_fk("bewertung_id", "bewertung", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    bewertung_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    titel: Mapped[str] = mapped_column(Text, nullable=False)
    markdown: Mapped[str] = mapped_column(Text, nullable=False)
    kurzform: Mapped[str | None] = mapped_column(Text, nullable=True)
    order: Mapped[int] = mapped_column(Integer, nullable=False)

    bewertung: Mapped["Bewertung"] = relationship()


class BewertungQuelle(ModelBase, VersionedMixin):
    """Source reference (SVM-Chunk) used in a Bewertung."""

    __tablename__ = "bewertung_quelle"

    __table_args__ = (
        parent_fk("bewertung_id", "bewertung", ondelete="CASCADE"),
        parent_fk("dokument_id", "dokument", ondelete="CASCADE"),
        parent_fk("fundstelle_id", "fundstelle", ondelete="SET NULL"),
        *common_table_args(__tablename__),
    )

    bewertung_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    dokument_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    fundstelle_id: Mapped[uuid.UUID | None] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    title: Mapped[str] = mapped_column(Text, nullable=False)
    cited_svm_id: Mapped[str | None] = mapped_column(String(10), nullable=True)
    chunk_ids: Mapped[list[str]] = mapped_column(ARRAY(String), nullable=False)
    page_numbers: Mapped[list[int]] = mapped_column(ARRAY(Integer), nullable=False)

    bewertung: Mapped["Bewertung"] = relationship()
    dokument: Mapped["Dokument"] = relationship()
    fundstelle: Mapped[Optional["Fundstelle"]] = relationship()


# ── Normvorschlag ───────────────────────────────────────────────────────────


class Normvorschlag(ModelBase, VersionedMixin):  # NOTUSED
    """Multi-parent: project + norm."""

    __tablename__ = "normvorschlag"

    __table_args__ = (
        parent_fk("norm_id", "norm", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    norm_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    confidence: Mapped[float] = mapped_column(Float, nullable=False)

    norm: Mapped["Norm"] = relationship()


# ── Verwaltungsaktentwurf ───────────────────────────────────────────────────


class VerwaltungsaktentwurfTeil(ModelBase, VersionedMixin):  # NOTUSED
    """Multi-parent: project + bewertung."""

    __tablename__ = "verwaltungsaktentwurf_teil"

    __table_args__ = (
        parent_fk("bewertung_id", "bewertung", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    bewertung_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)

    bewertung: Mapped["Bewertung"] = relationship()


# ── Completeness checks ────────────────────────────────────────────────────


class GsPruefung(ModelBase, VersionedMixin):  # NOTUSED
    __tablename__ = "gs_pruefung"

    __table_args__ = common_table_args(__tablename__)

    topic: Mapped[str] = mapped_column(String, nullable=False)


class RequiredDoc(ModelBase, VersionedMixin):  # NOTUSED
    __tablename__ = "required_doc"

    __table_args__ = (
        parent_fk("gs_pruefung_id", "gs_pruefung", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    gs_pruefung_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(String, nullable=False)

    gs_pruefung: Mapped["GsPruefung"] = relationship()


class IvPruefung(ModelBase, VersionedMixin):  # NOTUSED
    __tablename__ = "iv_pruefung"

    __table_args__ = common_table_args(__tablename__)

    topic: Mapped[str] = mapped_column(String, nullable=False)


class SollDokument(ModelBase, VersionedMixin):  # NOTUSED
    __tablename__ = "soll_dokument"

    __table_args__ = (
        parent_fk("iv_pruefung_id", "iv_pruefung", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    iv_pruefung_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    doc_type: Mapped[str] = mapped_column(String, nullable=False)

    iv_pruefung: Mapped["IvPruefung"] = relationship()


class ZugeordnetesDokument(ModelBase, VersionedMixin):  # NOTUSED
    """Multi-parent: (required_doc OR soll_dokument) + dokument."""

    __tablename__ = "zugeordnetes_dokument"

    dokument_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    required_doc_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    soll_dokument_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    source_document_id: Mapped[uuid.UUID] = mapped_column(PG_UUID(as_uuid=True), nullable=False)
    match_score: Mapped[float] = mapped_column(Float, nullable=False)

    dokument: Mapped["Dokument"] = relationship()
    required_doc: Mapped[Optional["RequiredDoc"]] = relationship()
    soll_dokument: Mapped[Optional["SollDokument"]] = relationship()

    __table_args__ = (
        parent_fk("dokument_id", "dokument", ondelete="CASCADE"),
        parent_fk("required_doc_id", "required_doc", ondelete="CASCADE"),
        parent_fk("soll_dokument_id", "soll_dokument", ondelete="CASCADE"),
        CheckConstraint(
            "(CASE WHEN required_doc_id IS NOT NULL THEN 1 ELSE 0 END + "
            "CASE WHEN soll_dokument_id IS NOT NULL THEN 1 ELSE 0 END) = 1",
            name="chk_zugeordnetes_one_parent",
        ),
        *common_table_args(__tablename__),
    )


class Zusammenfassung(ModelBase, VersionedMixin):  # NOTUSED
    """Multi-parent: dokument + optional required_doc + optional soll_dokument."""

    __tablename__ = "zusammenfassung"

    __table_args__ = (
        parent_fk("dokument_id", "dokument", ondelete="CASCADE"),
        parent_fk("required_doc_id", "required_doc", ondelete="CASCADE"),
        parent_fk("soll_dokument_id", "soll_dokument", ondelete="CASCADE"),
        *common_table_args(__tablename__),
    )

    dokument_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    required_doc_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    soll_dokument_id: Mapped[uuid.UUID] = mapped_column(
        PG_UUID(as_uuid=True),
        nullable=True,
        index=True,
    )
    text: Mapped[str] = mapped_column(Text, nullable=False)

    dokument: Mapped["Dokument"] = relationship()
    required_doc: Mapped[Optional["RequiredDoc"]] = relationship()
    soll_dokument: Mapped[Optional["SollDokument"]] = relationship()
