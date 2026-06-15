"""Pydantic schemas and enums for the feedback service."""

from enum import Enum


class FeedbackRating(str, Enum):
    """Allowed rating values for a feedback entry."""

    POSITIVE = "positive"
    NEGATIVE = "negative"
