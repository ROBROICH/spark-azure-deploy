from datetime import date, timedelta

from pydantic import BaseModel, ConfigDict
from temporal.contracts import UpdateBegruendungenInput

from begruendungen_db.schemas.db import BaseChunk, BaseDocument, Drucksachetyp, Herausgeber


class ResponseChunk(BaseChunk):
    """chunk data with similarity"""

    similarity: float
    # more meta from source doc
    datum: date
    dokumentart: str
    drucksachetyp: Drucksachetyp
    herausgeber: Herausgeber
    titel: str

    model_config = ConfigDict(extra="ignore")


class SimilarityRequest(BaseModel):
    """"""

    jurabk: str
    query_text: str
    section_substrings: list[str] | None = None
    k: int = 10


class FullDocument(BaseDocument, table=False):
    """document including full text"""

    text: str


class CreateScheduleRequest(BaseModel):
    input: UpdateBegruendungenInput
    intervals: list[timedelta]
    note: str | None = None


class UpdateScheduleRequest(BaseModel):
    input: UpdateBegruendungenInput | None = None
    intervals: list[timedelta] | None = None
    note: str | None = None


class PauseScheduleRequest(BaseModel):
    note: str | None = None
