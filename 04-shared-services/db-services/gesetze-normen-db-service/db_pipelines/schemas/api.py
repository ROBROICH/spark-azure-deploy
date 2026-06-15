"""api endpoint specific schemas"""

from sqlmodel import Field

from db_pipelines.schemas.db import (
    BaseAbsatz,
    BaseDocument,
    BaseLegaldefinition,
    BaseNorm,
    BaseSatz,
    BaseTechnischeNorm,
    Standangabe,
)


class Norm(BaseNorm):
    """basic norm object"""

    prev: str | None = Field(
        None, description="paragraph_nr for the previous norm (if available)"
    )
    next: str | None = Field(
        None, description="paragraph_nr for the next norm (if available)"
    )
    paragraph_nr: str


class AbsatzFull(BaseAbsatz):
    """full absatz object, including saetze"""

    saetze: list[BaseSatz]


class NormFull(Norm):
    """full norm object, including absaetze"""

    absaetze: list[AbsatzFull]


class NormSimple(BaseNorm):
    """simple norm object without previous and next"""

    paragraph_nr: str
    absaetze: list[AbsatzFull]


class DocumentFull(BaseDocument):
    """full document, including standangaben"""

    standangaben: list[Standangabe]


class LegaldefinitionRead(BaseLegaldefinition):
    """API payload for a legal definition lookup."""


class TechnischeNormRead(BaseTechnischeNorm):
    """API payload for a technische Norm lookup."""
