"""Data models for unbestimmte Rechtsbegriffe verification."""

from pydantic import BaseModel, ConfigDict, Field


class PruefungEintrag(BaseModel):
    """A single check entry for one unbestimmter Rechtsbegriff."""

    id: str = Field(description="Die ID des ursprünglich unbestimmten Rechtsbegriffes.")
    begriff: str = Field(description="Der wörtlich übernommene unbestimmte Rechtsbegriff.")
    bestimmt: bool = Field(
        description=(
            "Ein Hinweis, ob der Begriff in der Liste der bestimmten Rechtsbegriffe "
            "gefunden wurde (True) oder nicht (False)."
        )
    )
    b_ids: list[str] = Field(
        description=(
            "Liste der IDs der bestimmten Rechtsbegriffe,\n"
            "in denen der unbestimmte Begriff gefunden wurde.\n"
            "Falls der Begriff nicht in der Liste vorhanden ist,\n"
            "ist diese Liste leer."
        )
    )

    model_config = ConfigDict(extra="forbid")


class UnbestimmteRechtsbegriffePrueferAgentOutput(BaseModel):
    """Output of the unbestimmte Rechtsbegriffe Prüfer agent with one entry per term."""

    pruefung: list[PruefungEintrag] = Field(
        description=(
            "Liste aller überprüften unbestimmten Rechtsbegriffe. "
            "Jeder Eintrag enthält die ID, den Begriff selbst "
            "und den Status, ob er als bestimmt oder unbestimmt eingestuft wurde."
        )
    )

    model_config = ConfigDict(extra="forbid")
