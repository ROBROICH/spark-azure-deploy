"""Tests for the Presidio-based PII detector service.

The unit tests use a stubbed analyzer to keep the suite fast and free
from the spaCy model load (~5-10s + 540 MB on disk). One opt-in
integration test exercises the real analyzer and is skipped when the
model is not installed.
"""

from __future__ import annotations

from dataclasses import dataclass

import pytest

from src.config import PresidioConfig
from src.services import presidio_detector


@dataclass
class _StubResult:
    """Minimal stand-in for ``presidio_analyzer.RecognizerResult``."""

    start: int
    end: int
    score: float = 0.99
    entity_type: str = "PERSON"


class _StubAnalyzer:
    """Returns a fixed set of results regardless of input."""

    def __init__(self, results: list[_StubResult]) -> None:
        self._results = results
        self.calls: list[dict] = []

    def analyze(self, **kwargs):  # noqa: ANN003 - mirrors Presidio API
        self.calls.append(kwargs)
        return self._results


@pytest.fixture(autouse=True)
def _reset_analyzer_singleton() -> None:
    """Ensure each test starts with a fresh singleton slot."""
    presidio_detector._analyzer = None
    yield
    presidio_detector._analyzer = None


@pytest.fixture
def cfg() -> PresidioConfig:
    return PresidioConfig()


class TestDetectPiiInLines:
    """Unit tests for :func:`detect_pii_in_lines` with a stubbed analyzer."""

    def test_empty_input_returns_empty(self, cfg: PresidioConfig) -> None:
        presidio_detector._analyzer = _StubAnalyzer([])
        assert presidio_detector.detect_pii_in_lines([], cfg) == []
        assert presidio_detector.detect_pii_in_lines(["", "   "], cfg) == []

    def test_returns_surface_forms(self, cfg: PresidioConfig) -> None:
        text_lines = ["Max Mustermann wohnt in Berlin."]
        # "Max Mustermann" spans positions 0..14 in the joined text
        presidio_detector._analyzer = _StubAnalyzer([_StubResult(start=0, end=14, entity_type="PERSON")])

        result = presidio_detector.detect_pii_in_lines(text_lines, cfg)

        # Full compound name + split parts that pass MIN_TERM_LENGTH (2)
        assert result == ["Max Mustermann", "Max", "Mustermann"]

    def test_filters_short_terms(self, cfg: PresidioConfig) -> None:
        # MIN_TERM_LENGTH defaults to 2; single char "X" (1 char) must be dropped.
        presidio_detector._analyzer = _StubAnalyzer([_StubResult(start=0, end=1, entity_type="PERSON")])

        result = presidio_detector.detect_pii_in_lines(["X wohnt hier."], cfg)

        assert result == []

    def test_deduplicates_repeated_matches(self, cfg: PresidioConfig) -> None:
        text_lines = ["Berlin Berlin Berlin"]
        presidio_detector._analyzer = _StubAnalyzer(
            [
                _StubResult(start=0, end=6, entity_type="LOCATION"),
                _StubResult(start=7, end=13, entity_type="LOCATION"),
                _StubResult(start=14, end=20, entity_type="LOCATION"),
            ]
        )

        result = presidio_detector.detect_pii_in_lines(text_lines, cfg)

        assert result == ["Berlin"]

    def test_passes_threshold_and_entities_to_analyzer(self, cfg: PresidioConfig) -> None:
        stub = _StubAnalyzer([])
        presidio_detector._analyzer = stub

        presidio_detector.detect_pii_in_lines(["Some text."], cfg)

        assert len(stub.calls) == 1
        call = stub.calls[0]
        assert call["language"] == cfg.LANGUAGE
        assert call["score_threshold"] == cfg.SCORE_THRESHOLD
        assert call["entities"] == cfg.ENTITIES

    def test_empty_entities_passes_none(self, cfg: PresidioConfig) -> None:
        cfg = cfg.model_copy(update={"ENTITIES": []})
        stub = _StubAnalyzer([])
        presidio_detector._analyzer = stub

        presidio_detector.detect_pii_in_lines(["Some text."], cfg)

        assert stub.calls[0]["entities"] is None


@pytest.mark.slow
class TestRealAnalyzer:
    """Opt-in integration test exercising the real spaCy + Presidio pipeline."""

    def test_detects_email_and_name(self) -> None:
        spacy = pytest.importorskip("spacy")
        if not spacy.util.is_package("de_core_news_lg"):
            pytest.skip("de_core_news_lg model not installed")

        cfg = PresidioConfig()
        text = [
            "Bitte überweisen Sie an Herrn Klaus Müller.",
            "Kontakt: max.mustermann@example.de",
        ]

        result = presidio_detector.detect_pii_in_lines(text, cfg)

        assert "max.mustermann@example.de" in result
        assert "Klaus Müller" in result
        assert "Klaus" in result
        assert "Müller" in result
