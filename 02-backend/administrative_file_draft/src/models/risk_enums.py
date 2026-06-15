from enum import StrEnum


class RiskStatus(StrEnum):
    OPEN = "open"
    CORRECTED = "corrected"
    IGNORED = "ignored"
