"""Data models for Wortlaut-Auslegung."""

from pydantic import BaseModel, ConfigDict, Field


class WortlautAuslegerUnbestimmterRechtsbegriff(BaseModel):
    """Wortlaut interpretation for a single term."""

    id: str = Field(description=("Die ID des unbestimmten Rechtsbegriffs."))
    u_begriff: str = Field(description=("Der unbestimmte Rechtsbegriff."))
    auslegung: str = Field(
        description=(
            "Die detaillierte Auslegung des unbestimmten Rechtsbegriffs "
            "unter Berücksichtigung des juristischen Kontexts und "
            "des allgemeinen Sprachgebrauchs."
        )
    )

    model_config = ConfigDict(extra="forbid")


class WortlautAuslegerAgentOutput(BaseModel):
    """Collection of Wortlaut interpretations."""

    wortlaut_auslegung: list[WortlautAuslegerUnbestimmterRechtsbegriff] = Field(
        description=(
            "Liste aller identifizierten unbestimmten Rechtsbegriffe mit "
            "ausführlicher Auslegung. "
            "Jeder Eintrag enthält die ID, den Begriff selbst sowie "
            "die entsprechende Auslegung."
        )
    )

    model_config = ConfigDict(extra="forbid")

    @staticmethod
    def with_expected_length(expected_length: int) -> type["WortlautAuslegerAgentOutput"]:
        """Create a validator enforcing the expected output list length."""

        class ValidatedOutput(WortlautAuslegerAgentOutput):
            """Length-validated Wortlaut output."""

            wortlaut_auslegung: list[WortlautAuslegerUnbestimmterRechtsbegriff] = Field(
                min_length=expected_length,
                max_length=expected_length,
                description=(
                    "Liste aller identifizierten unbestimmten Rechtsbegriffe mit "
                    "ausführlicher Auslegung. "
                    "Jeder Eintrag enthält die ID, den Begriff selbst sowie "
                    "die entsprechende Auslegung."
                ),
            )

        ValidatedOutput.__name__ = f"ValidatedOutput_{expected_length}"
        ValidatedOutput.__qualname__ = (
            f"WortlautAuslegerAgentOutput.with_expected_length.<locals>.ValidatedOutput_{expected_length}"
        )

        return ValidatedOutput
