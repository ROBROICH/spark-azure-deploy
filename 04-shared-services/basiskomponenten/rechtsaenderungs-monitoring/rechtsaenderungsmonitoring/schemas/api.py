from datetime import date, timedelta

from pydantic import BaseModel
from temporal.contracts import MonitorRechtsaenderungenInput

from rechtsaenderungsmonitoring.schemas.db import BaseNorm


class UpdateResponse(BaseModel):
    """
    basic response schema for `/pending-updates`
    endpoint
    """

    jurabk: str
    affected_norms: list[str]
    valid_from: date


class UpdateResponseFull(BaseModel):
    """
    full response schema for `/pending-updates`
    endpoint, including change_text for Affected Norms
    """

    jurabk: str
    affected_norms: list[BaseNorm]
    valid_from: date


# temporal
class CreateScheduleRequest(BaseModel):
    input: list[MonitorRechtsaenderungenInput]
    intervals: list[timedelta]
    note: str | None = None


class UpdateScheduleRequest(BaseModel):
    input: list[MonitorRechtsaenderungenInput] | None = None
    intervals: list[timedelta] | None = None
    note: str | None = None


class PauseScheduleRequest(BaseModel):
    note: str | None = None
