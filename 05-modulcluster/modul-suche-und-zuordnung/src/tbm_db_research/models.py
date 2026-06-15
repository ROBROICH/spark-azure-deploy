"""Pydantic models for legal term (Rechtsbegriff) research results."""

from typing import Any, Literal

from pydantic import BaseModel


class RechtsbegriffDefinition(BaseModel):
    """A single definition text with an optional legal source reference."""

    text: str
    source: dict[str, Any] | None = None


class RechtsbegriffEintrag(BaseModel):
    """A legal term entry, either a bestimmter or unbestimmter Rechtsbegriff."""

    begriff: str
    typ: Literal["bestimmt", "unbestimmt"]
    definitionen: list[RechtsbegriffDefinition] = []
    auslegungsvorschlaege: list[str] = []
