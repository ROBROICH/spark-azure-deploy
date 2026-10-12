"""Unit tests for the delivered confidence value."""

from src.activities import confidence as k


class TestConfidence:
    def test_mean_of_both_scores(self) -> None:
        assert k.confidence([90, 10, 50], [95, 20, 60]) == [92.5, 15.0, 55.0]

    def test_absolute_not_relative(self) -> None:
        """The value of a note does not depend on the other notes of the run."""
        assert k.confidence([80], [70]) == [75.0]
        assert k.confidence([80, 0, 0], [70, 0, 0])[0] == 75.0  # noqa: PLR2004

    def test_empty(self) -> None:
        assert k.confidence([], []) == []

    def test_missing_b_score_falls_back_to_a(self) -> None:
        """The rubric could not judge the note: confidence is the verification score, not the mean with zero."""
        assert k.confidence([80, 60], [None, 70]) == [80.0, 65.0]
