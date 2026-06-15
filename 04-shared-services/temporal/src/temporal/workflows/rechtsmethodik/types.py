from typing import Literal, TypeVar
from uuid import UUID, uuid4

from pydantic import BaseModel, Field

T = TypeVar("T")

NormTyp = Literal["materiell-rechtlich", "verfahrensrechtlich"]

SatzKategorie = Literal["wenn-dann", "abwägungsdirektive", "begriffserklärung", "sonstiges"]
WENN_DANN: SatzKategorie = "wenn-dann"

Sollensanordnungen = Literal["verbot", "gebot", "erlaubnis", "freistellung"]

RechtsfolgenAdressat = Literal[
    "handlungsermächtigung",
    "keine handlungsermächtigung",
]
HANDLUNGSERMAECHTIGUNG: RechtsfolgenAdressat = "handlungsermächtigung"

Ermessensspielraum = Literal["ermessensentscheidung", "gebundene entscheidung"]
ERMESSENSENTSCHEIDUNG: Ermessensspielraum = "ermessensentscheidung"


ErmessensArt = Literal[
    "entschließungsermessen",
    "auswahlermessen",
    "beides",
]


class Absatz[T](BaseModel):
    absatz_nr: str
    absatz_text: str
    saetze: list[T]


class TechnischeNorm(BaseModel):
    id: str
    kurzbeschreibung: str


class Auslegungsvorschlag(BaseModel):
    auslegung_methode: str
    auslegungsvorschlag: str
    sources: list[str] | None = None


class UnbestimmterRechtsbegriff(BaseModel):
    begriff: str
    auslegungsvorschläge: list[Auslegungsvorschlag]
    auslegung: str | None = None


class Source(BaseModel):
    jurabk: str
    paragraph_nr: str


class Legaldefinition(BaseModel):
    begriff: str
    definition: str
    source: Source


class BestimmterRechtsbegriff(BaseModel):
    begriff: str
    definitions: list[Legaldefinition]
    selected_definition: Legaldefinition | None = None


class Rechtsbegriffe(BaseModel):
    unbestimmte_rechtsbegriffe: list[UnbestimmterRechtsbegriff]
    bestimmte_rechtsbegriffe: list[BestimmterRechtsbegriff]


class Untergliederung(BaseModel):
    typ: str
    wert: str


class ExplicitVerweiseInfo(BaseModel):
    gesetz: str | None = None
    paragraph_nr: str | None = None
    absatz_nr: str | None = None
    satz_nr: str | None = None
    untergliederung: list[Untergliederung] | None = None
    anhang: str | None = None
    artikel: str | None = None
    richtlinie: str | None = None
    verordnung: str | None = None
    technische_norm: TechnischeNorm | None = None
    verweis_typ: Literal["intern", "extern"] | None
    kontext: list[str] | None = None


class Verweise(BaseModel):
    explizit: list[ExplicitVerweiseInfo]
    implizit: list[str]


class AtomaresTBM(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    text: str
    verweise: Verweise
    prueffrage: str
    pruefgegenstand: str
    rechtsbegriffe: Rechtsbegriffe


class Rechtsfolge(BaseModel):
    text: str
    sollensanordnungen: Sollensanordnungen
    rechtsfolgen_adressat: RechtsfolgenAdressat
    ermessensspielraum: Ermessensspielraum | None = None
    ermessensart: ErmessensArt | None = None
    verweise: Verweise | None = None


class RechtsmethodikWorkflowInput(BaseModel):
    jurabk: str
    paragraph_nr: str


class RechtsmethodikWorkflowSatzOutput(BaseModel):
    id: UUID = Field(default_factory=uuid4)
    satz_nr: str
    markers: list[str]
    satz_text: str
    norm_typ_lvl_1: NormTyp
    norm_typ_lvl_2: SatzKategorie | None = None
    tatbestandsmerkmale: list[str] | None = None
    rechtsfolge: Rechtsfolge | None = None
    atomare_tatbestandsmerkmale: list[AtomaresTBM] | None = None
    formel: str | None = None


class RechtsmethodikWorkflowOutput(BaseModel):
    gesetz: str
    jurabk: str
    standangaben: list[dict]
    paragraph_nr: str
    paragraph_titel: str
    paragraph_text: str
    absaetze: list[Absatz[RechtsmethodikWorkflowSatzOutput]]
    regelungsgegenstand: str | None = None


class LMAtomareTBMsWorkflowInput(BaseModel):
    gesetz: str
    jurabk: str
    paragraph_nr: str
    paragraph_text: str
    absatz_nr: str
    satz_nr: str
    markers: list[str]
    satz_text: str
    ex_atomare_tatbestandsmerkmale: list[str]
    new_atomare_tatbestandsmerkmale: list[str]
    rechtsfolge: str


class LMAtomareTBMsWorkflowOutput(BaseModel):
    atomare_tatbestandsmerkmale: list[AtomaresTBM] | None = None
    formel: str | None = None


class LMJuristischerSatzWorkflowInput(BaseModel):
    gesetz: str
    jurabk: str
    paragraph_nr: str
    paragraph_text: str
    absatz_nr: str
    satz_nr: str
    markers: list[str]
    satz_text: str


class LMJuristischerSatzWorkflowOutput(BaseModel):
    norm_typ_lvl_1: NormTyp
    norm_typ_lvl_2: SatzKategorie | None = None
    tatbestandsmerkmale: list[str] | None = None
    atomare_tatbestandsmerkmale: list[AtomaresTBM] | None = None
    rechtsfolge: Rechtsfolge | None = None
    formel: str | None = None


class LMMateriellRechtlichWorkflowOutput(BaseModel):
    norm_typ_lvl_2: SatzKategorie
    tatbestandsmerkmale: list[str] | None = None
    atomare_tatbestandsmerkmale: list[AtomaresTBM] | None = None
    rechtsfolge: Rechtsfolge | None = None
    formel: str | None = None


class LMRfWorkflowInput(BaseModel):
    gesetz: str
    paragraph_nr: str
    absatz_nr: str
    satz_nr: str
    satz_text: str
    rechtsfolge: str


class LMWennDannWorkflowOutput(BaseModel):
    tatbestandsmerkmale: list[str] | None = None
    atomare_tatbestandsmerkmale: list[AtomaresTBM] | None = None
    rechtsfolge: Rechtsfolge | None = None
    formel: str | None = None


class LMHandlungsermaechtigungWorkflowInput(BaseModel):
    rechtsfolge: str
