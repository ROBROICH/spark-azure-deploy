"""Data models for Pruefformulierung generation."""

from pydantic import BaseModel, ConfigDict, Field


class Pruefformulierung(BaseModel):
    """A single Prüfformulierung entry for one Tatbestandsmerkmal."""

    id: str = Field(description="Die ID des Tatbestandsmerkmals, das die Prüffrage und den Prüfgegenstand betrifft.")
    prueffrage: str = Field(description="Die als Entscheidungsfrage formulierte Prüffrage zum Tatbestandsmerkmal.")
    pruefgegenstand: str = Field(description="Der zu prüfende Sachverhalt als Anweisung.")

    model_config = ConfigDict(extra="forbid")


class PruefFormulierungsAgentOutput(BaseModel):
    """Output of the Prüfformulierungs agent with one entry per Tatbestandsmerkmal."""

    pruefungen: list[Pruefformulierung] = Field(
        description=(
            "Liste mit einem Eintrag pro Tatbestandsmerkmal, "
            "der jeweils eine Prüffrage und einen "
            "Prüfgegenstand enthält."
        )
    )

    model_config = ConfigDict(extra="forbid")

    @staticmethod
    def with_expected_length(expected_length: int) -> type["PruefFormulierungsAgentOutput"]:
        """Create a validator enforcing the expected output list length."""

        class ValidatedOutput(PruefFormulierungsAgentOutput):
            """Length-validated Prüfformulierung output."""

            pruefungen: list[Pruefformulierung] = Field(
                min_length=expected_length,
                max_length=expected_length,
                description=(
                    "Liste mit einem Eintrag pro Tatbestandsmerkmal, "
                    "der jeweils eine Prüffrage und einen "
                    "Prüfgegenstand enthält."
                ),
            )

        ValidatedOutput.__name__ = f"ValidatedOutput_{expected_length}"
        ValidatedOutput.__qualname__ = (
            f"PruefFormulierungsAgentOutput.with_expected_length.<locals>.ValidatedOutput_{expected_length}"
        )

        return ValidatedOutput
