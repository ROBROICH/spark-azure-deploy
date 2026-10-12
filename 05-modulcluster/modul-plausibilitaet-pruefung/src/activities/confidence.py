"""Delivered confidence value: the plain mean of the verification and the rubric score.

The mean is an absolute property of the note, unlike a percentile rank within one run.
"""

from __future__ import annotations

from collections.abc import Sequence


def confidence(scores_a: Sequence[float], scores_b: Sequence[float | None]) -> list[float]:
    """Confidence per item: mean of the verification and the rubric score, 0-100, one decimal.

    Without a rubric score the confidence is the verification score alone, not the mean with zero.
    """
    return [round((a + b) / 2 if b is not None else a, 1) for a, b in zip(scores_a, scores_b, strict=True)]
