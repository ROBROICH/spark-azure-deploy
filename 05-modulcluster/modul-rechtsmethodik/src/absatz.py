from pydantic import BaseModel


class Absatz[T](BaseModel):
    absatz_nr: str
    absatz_text: str
    saetze: list[T]
