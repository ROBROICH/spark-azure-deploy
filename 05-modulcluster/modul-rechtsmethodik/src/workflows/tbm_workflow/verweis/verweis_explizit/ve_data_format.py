"""Data models for explicit Verweise."""

from pydantic import BaseModel, ConfigDict, Field


class Untergliederung(BaseModel):
    """A hierarchical subdivision of a legal reference (e.g. Nummer, Buchstabe)."""

    typ: str = Field(
        description="Art der Untergliederung (z. B. 'Nummer', 'Buchstabe', 'Doppelbuchstabe', 'Variante', 'Halbsatz', 'Spiegelstrich' usw.)"
    )
    wert: str = Field(description="Der konkrete Wert der Untergliederung (z. B. '5', 'b', 'dd', '2')")

    model_config = ConfigDict(extra="forbid")


class Verweis(BaseModel):
    """A structured explicit legal reference with optional law, paragraph, and subdivision fields."""

    gesetz: str | None = Field(
        default=None,
        description="Name des Gesetzes oder der Rechtsquelle (z. B. 'Bundesnaturschutzgesetz')",
    )
    paragraph_nr: str | None = Field(
        default=None,
        description="Paragraph (z. B. '7', '16b', '32b')",
    )
    absatz_nr: str | None = Field(
        default=None,
        description="Absatz (z. B. '2')",
    )
    satz_nr: str | None = Field(
        default=None,
        description="Satz (z. B. '1')",
    )

    untergliederung: list[Untergliederung] | None = Field(
        default=None,
        description=(
            "Untergliederungen von Absatz oder Satz in hierarchischer Reihenfolge "
            "(z. B. Nummer, Buchstabe, Doppelbuchstabe, Variante, Halbsatz usw.)"
        ),
    )

    anhang: str | None = Field(
        default=None,
        description="Anhang (z. B. 'Anhang IV', 'Anhang der Verordnung (EU) Nr. 1143/2014')",
    )
    artikel: str | None = Field(
        default=None,
        description="Artikel (z. B. '20a', '3')",
    )
    richtlinie: str | None = Field(
        default=None,
        description="Bezeichnung der Richtlinie (z. B. '92/43/EWG')",
    )
    verordnung: str | None = Field(
        default=None,
        description="Bezeichnung der Verordnung (z. B. 'Verordnung (EU) Nr. 1143/2014')",
    )
    technische_norm: str | None = Field(
        default=None,
        description=("Referenz auf eine technische Norm (z. B. 'IEC/ISO/IEEE 80005-1, Edition 1.0, Juli 2012')"),
    )

    model_config = ConfigDict(extra="forbid")


class VerweisBlockExplizit(BaseModel):
    """One explicit Verweis block associated with a specific TBM or Rechtsfolge element."""

    id: str = Field(description="ID des Elements (Tatbestandsmerkmal oder Rechtsfolge)")
    explizit: Verweis = Field(
        description="Explizit genannter Verweis mit strukturierter Angabe",
    )

    model_config = ConfigDict(extra="forbid")


class VerweisAgentOutputExplizit(BaseModel):
    """Output of the explicit Verweis agent with all identified reference blocks."""

    verweise: list[VerweisBlockExplizit] = Field(
        default=[],
        description=(
            "Liste der Verweisblöcke für alle Tatbestandsmerkmale und Rechtsfolgen "
            "mit expliziten Verweisen. Ein VerweisBlock pro Verweis."
        ),
    )

    model_config = ConfigDict(extra="forbid")
