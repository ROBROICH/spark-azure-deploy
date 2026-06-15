"""schema defitions for begruendungen_db"""

from typing import Optional, List, Any
from sqlmodel import SQLModel as BaseSQLModel, Field, Relationship, Column, PrimaryKeyConstraint
from sqlalchemy.dialects.postgresql import ARRAY, ENUM
from sqlalchemy import ForeignKeyConstraint, Integer
from datetime import date, datetime
from sqlalchemy.types import String
from pgvector.sqlalchemy import Vector

import enum

DIMENSIONS = 1024

class SQLModel(BaseSQLModel):

    # sqlmodel doesn't validate tables by default
    # https://github.com/fastapi/sqlmodel/issues/52#issuecomment-1225746421
    class Config:
        validate_assignment = True

class Herausgeber(str, enum.Enum):
    """herausgeber of drucksachen"""

    bundestag = "BT"
    bundesrat = "BR"
    bundesversammlung = "BV"
    europakammer = "EK"


class Drucksachetyp(str, enum.Enum):
    """possible Drucksachentypen"""

    antrag = "Antrag"
    unterrichtung = "Unterrichtung"
    gesetzentwurf = "Gesetzentwurf"
    gesetzesantrag = "Gesetzesantrag"
    beschluss = "Beschluss"
    empfehlungen = "Empfehlungen"
    bericht_antrag = "Bericht und Antrag"
    änderungsantrag = "Änderungsantrag"
    gesetztesbeschluss = "Gesetzesbeschluss"
    beschlussempfehlung_bericht = "Beschlussempfehlung und Bericht"
    antwort = "Antwort"
    bericht = "Bericht"
    kleine_anfrage = "Kleine Anfrage"
    beschlussempfehlung = "Beschlussempfehlung"
    verordnung = "Verordnung"
    berichtigung = "Berichtigung"
    stellungnahme = "Stellungnahme"


class Rolle(str, enum.Enum):
    """Rollen der Herausgeber"""

    b = "B"
    u = "U"
    undefined = "undefiniert"


class UrheberDokLink(SQLModel, table=True):
    """Mapping of Urheber and Documents"""

    __tablename__ = "urheberdok"

    einbringer: bool = Field(primary_key=True)
    rolle: Rolle = Field(primary_key=True)
    bezeichnung: str = Field(primary_key=True)
    doknr: int = Field(foreign_key="documents.doknr", primary_key=True)

    __table_args__ = (
        ForeignKeyConstraint(
            ["einbringer", "rolle", "bezeichnung"],
            ["urheber.einbringer", "urheber.rolle", "urheber.bezeichnung"],
        ),
    )


class BaseDocument(SQLModel, table=False):
    """shared document metadata"""
    jurabk: str = Field(index=True)

    # Required parameter
    aktualisiert: datetime
    autoren_anzahl: int
    datum: date
    doknr: int = Field(primary_key=True)
    dokumentart: str
    dokumentnummer: str = Field(index=True)
    drucksachetyp: Drucksachetyp = Field(
        sa_column=Column(type_=ENUM(Drucksachetyp), index=True)
    )
    herausgeber: Herausgeber = Field(index=True)
    titel: str
    typ: str

    # Optional Parameter
    vorgangsbezug_anzahl: int
    wahlperiode: int


class Document(BaseDocument, table=True):
    """main documents table"""

    __tablename__ = "documents"

    # full text can be loaded optionally
    text: "FullText" = Relationship(back_populates="document")

    # References
    fundstelle: "Fundstelle" = Relationship(back_populates="document")
    vorgangsbezug: Optional[List["Vorgangsbezug"]] = Relationship(
        back_populates="document"
    )
    autoren_anzeige: Optional[List["AutorenAnzeige"]] = Relationship(
        back_populates="document"
    )
    # urheber: Optional[List["Urheber"]] = Relationship(back_populates="document")
    urheber: List["Urheber"] = Relationship(
        back_populates="documents", link_model=UrheberDokLink
    )
    chunks: List["Chunk"] = Relationship(back_populates="document")


class FullText(SQLModel, table=True):
    __tablename__ = "full_texts"
    document: Optional[Document] = Relationship(back_populates="text")
    doknr: Optional[int] = Field(default=None, primary_key=True, foreign_key="documents.doknr")
    text: str


class Urheber(SQLModel, table=True):
    """Urheber of Dokument"""

    __tablename__ = "urheber"

    einbringer: bool = Field(primary_key=True)
    rolle: Rolle = Field(primary_key=True)
    bezeichnung: str = Field(primary_key=True)
    titel: str

    # doknr: Optional[int] = Field(default=None, foreign_key="documents.doknr")
    documents: List[Document] = Relationship(
        back_populates="urheber", link_model=UrheberDokLink
    )

    __table_args__ = (
        PrimaryKeyConstraint("rolle", "bezeichnung", "einbringer", name="urheber_pk"),
    )


class Fundstelle(SQLModel, table=True):
    """table of sources of drucksachen"""

    __tablename__ = "fundstellen"

    id: str = Field(primary_key=True)
    dokumentart: str
    dokumentnummer: str
    datum: date
    herausgeber: Herausgeber = Field(None, sa_column=Column(type_=ENUM(Herausgeber)))
    urheber: Optional[List[str]] = Field(sa_type=ARRAY(String))
    pdf_url: Optional[str] = None
    drucksachetyp: Optional[Drucksachetyp] = Field(
        None, sa_column=Column(type_=ENUM(Drucksachetyp))
    )

    doknr: Optional[int] = Field(default=None, foreign_key="documents.doknr")
    document: Optional[Document] = Relationship(back_populates="fundstelle")


class Vorgangsbezug(SQLModel, table=True):
    """table of contents entries"""

    __tablename__ = "vorgangsbezuege"

    vb_id: int = Field(primary_key=True)
    titel: Optional[str] = None
    vorgangstyp: List[str] = Field(sa_type=ARRAY(String))

    doknr: Optional[int] = Field(default=None, foreign_key="documents.doknr")
    document: Optional[Document] = Relationship(back_populates="vorgangsbezug")


class AutorenAnzeige(SQLModel, table=True):
    """Autoren von Drucksachen"""

    __tablename__ = "autorenanzeige"

    autor_titel: str
    id: int = Field(primary_key=True)
    titel: str

    doknr: Optional[int] = Field(default=None, foreign_key="documents.doknr")
    document: Optional[Document] = Relationship(back_populates="autoren_anzeige")


class BaseChunk(SQLModel, table=False):
    """drucksachen-text chunks"""

    dokumentnummer: str
    section_title: str
    section_text: str
    chunk_index: int
    chunk_text: str
    start_page: int
    end_page: int


class Chunk(BaseChunk, table=True):
    """drucksachen-text chunks including embeddings"""

    __tablename__ = "chunks"

    jurabk: str = Field(index=True)
    doknr: int = Field(primary_key=True)
    # autoincrement doesn't get picked up by alembic, but is left as hint here
    id: int | None = Field(
        sa_column=Column(Integer, autoincrement=True, primary_key=True)
    )

    embedding: Any = Field(sa_column=Column(Vector(DIMENSIONS), nullable=False))

    document: Optional[Document] = Relationship(back_populates="chunks")

    __table_args__ = (
        ForeignKeyConstraint(
            ["doknr"],
            [
                "documents.doknr",
            ],
        ),
        PrimaryKeyConstraint("doknr", "id"),
    )
