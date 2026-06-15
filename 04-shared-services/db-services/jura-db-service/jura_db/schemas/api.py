"""api specific schemas"""

from datetime import date

from sqlmodel import SQLModel
from pydantic import ConfigDict

from jura_db.schemas.db import BaseChunk


class ResponseNorm(SQLModel, table=False):
    """Norm model for API responses"""

    name: str
    name_suffix: str | None
    paragraph: str | None
    absatz: str | None


class ChunkRequest(SQLModel, table=False):
    """request filtered chunks"""

    aktenzeichen: str
    section_number: int


class SimilarityRequest(SQLModel, table=False):
    """request model for the query_top_k endpoint"""

    query_text: str
    k: int = 10
    similarity_threshold: float = 0.3

    norms: list[ResponseNorm] = []


class ResponseChunk(BaseChunk, table=False):
    """chunk model for API responses"""

    id: int
    doc_id: str
    gericht: str
    datum: date
    aktenzeichen: str
    dokumenttyp: str
    normen: list[ResponseNorm]
    similarity: float | None = None

    model_config = ConfigDict(extra="ignore")
