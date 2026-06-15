from enum import StrEnum


class TopicNormType(StrEnum):
    PRUEFUNG = "pruefung"
    VERFAHREN = "verfahren"


class TopicNormStatus(StrEnum):
    UNCHECKED = "unchecked"
    CHECKED = "checked"
    NEEDS_REVISION = "needs_revision"
