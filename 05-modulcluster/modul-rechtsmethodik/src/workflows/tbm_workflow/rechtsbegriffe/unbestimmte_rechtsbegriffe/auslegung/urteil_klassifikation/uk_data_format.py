"""Data models for Urteil classification."""

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

AuslegungsMethode = Literal["wortlaut", "systematik", "historie", "telos", "sonstiges"]

AUSLEGUNGS_METHODEN: list[AuslegungsMethode] = ["wortlaut", "systematik", "historie", "telos", "sonstiges"]


class UrteilKlassifikation(BaseModel):
    """Classification result for a single Urteil."""

    aktenzeichen: str = Field(description="Aktenzeichen des Urteils.")
    randnummer: str = Field(description="Randnummer des Chunks.")
    methoden: list[AuslegungsMethode] = Field(
        description="Liste der Auslegungsmethoden, für die dieser Chunk relevant ist.",
        min_length=1,
    )

    model_config = ConfigDict(extra="forbid")


class UrteilKlassifikationOutput(BaseModel):
    """Collection of Urteil classifications."""

    klassifikationen: list[UrteilKlassifikation] = Field(
        description="Liste der klassifizierten Urteils-Chunks mit zugewiesenen Auslegungsmethoden.",
    )

    model_config = ConfigDict(extra="forbid")

    @staticmethod
    def with_expected_length(expected_length: int) -> type["UrteilKlassifikationOutput"]:
        """Create a validator enforcing the expected output list length."""

        class ValidatedOutput(UrteilKlassifikationOutput):
            """Length-validated Urteil classification output."""

            klassifikationen: list[UrteilKlassifikation] = Field(
                min_length=expected_length,
                max_length=expected_length,
                description="Liste der klassifizierten Urteils-Chunks mit zugewiesenen Auslegungsmethoden.",
            )

        ValidatedOutput.__name__ = f"ValidatedOutput_{expected_length}"
        ValidatedOutput.__qualname__ = (
            f"UrteilKlassifikationOutput.with_expected_length.<locals>.ValidatedOutput_{expected_length}"
        )

        return ValidatedOutput
