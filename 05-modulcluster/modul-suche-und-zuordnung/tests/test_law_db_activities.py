"""
Tests for src/Activities/law_db_activities.py

_query_top_k_dr and _query_k_results_ut create a fresh httpx.AsyncClient inside
the function body, so they require a real server or a request-interceptor library
(e.g. respx / pytest-httpx) to test HTTP behaviour.  Those libraries are not in
the current dev dependencies, so only the Pydantic input models and the module-
level URL constants are covered here.
"""

import pytest
from pydantic import ValidationError

import src.Activities.law_db_activities as law_db_module
from src.Activities.law_db_activities import (
    QueryKResultsUTInput,
    QueryTopKDRInput,
    UTNorm,
)

# ---------------------------------------------------------------------------
# Constants for magic-value comparisons
# ---------------------------------------------------------------------------

EXPECTED_K_MEDIUM = 5
EXPECTED_K_SMALL = 3
EXPECTED_SINGLE_NORM_COUNT = 1
EXPECTED_MULTIPLE_NORM_COUNT = 2
EXPECTED_K_LARGE = 10


# ---------------------------------------------------------------------------
# Module-level URL constants
# ---------------------------------------------------------------------------


class TestModuleConstants:
    """Tests for module-level URL constant values."""

    def test_dke_url_contains_query_top_k(self) -> None:
        """Verify that the DKE URL contains the expected query_top_k endpoint segment."""
        assert "query_top_k" in law_db_module._DKE_URL

    def test_ut_url_contains_query_k_results(self) -> None:
        """Verify that the UT URL contains the expected query_k_results endpoint segment."""
        assert "query_k_results" in law_db_module._UT_URL


# ---------------------------------------------------------------------------
# QueryTopKDRInput
# ---------------------------------------------------------------------------


class TestQueryTopKDRInput:
    """Tests for the QueryTopKDRInput Pydantic model."""

    def test_full_construction(self) -> None:
        """Verify that all fields are set correctly after full construction."""
        model = QueryTopKDRInput(
            jurabk="BauGB",
            query_text="Erschließung",
            section_substrings=["§ 123", "§ 124"],
            k=EXPECTED_K_MEDIUM,
        )
        assert model.jurabk == "BauGB"
        assert model.query_text == "Erschließung"
        assert model.section_substrings == ["§ 123", "§ 124"]
        assert model.k == EXPECTED_K_MEDIUM

    def test_optional_fields_as_none(self) -> None:
        """Verify that optional fields accept None values without validation error."""
        model = QueryTopKDRInput(
            jurabk="BauGB",
            query_text="query",
            section_substrings=None,
            k=None,
        )
        assert model.section_substrings is None
        assert model.k is None

    def test_empty_section_substrings(self) -> None:
        """Verify that an empty list is a valid value for section_substrings."""
        model = QueryTopKDRInput(
            jurabk="BauGB",
            query_text="query",
            section_substrings=[],
            k=EXPECTED_K_SMALL,
        )
        assert model.section_substrings == []


# ---------------------------------------------------------------------------
# UTNorm
# ---------------------------------------------------------------------------


class TestUTNorm:
    """Tests for the UTNorm Pydantic model."""

    def test_full_construction(self) -> None:
        """Verify that all fields are accessible after full construction."""
        norm = UTNorm(
            name="BauGB",
            name_suffix="2024",
            paragraph="123",
            absatz="1",
        )
        assert norm.name == "BauGB"
        assert norm.name_suffix == "2024"
        assert norm.paragraph == "123"
        assert norm.absatz == "1"

    def test_optional_fields_as_none(self) -> None:
        """Verify that all optional UTNorm fields accept None values."""
        norm = UTNorm(name="BauGB", name_suffix=None, paragraph=None, absatz=None)
        assert norm.name_suffix is None
        assert norm.paragraph is None
        assert norm.absatz is None

    def test_name_required(self) -> None:
        """Verify that omitting the required name field raises a validation error."""
        with pytest.raises(ValidationError):
            UTNorm(name_suffix=None, paragraph=None, absatz=None)  # type: ignore[call-arg]


# ---------------------------------------------------------------------------
# QueryKResultsUTInput
# ---------------------------------------------------------------------------


class TestQueryKResultsUTInput:
    """Tests for the QueryKResultsUTInput Pydantic model."""

    def test_full_construction(self) -> None:
        """Verify that all fields are correctly set after construction with a norm list."""
        norms = [UTNorm(name="BauGB", name_suffix=None, paragraph="123", absatz=None)]
        model = QueryKResultsUTInput(query_text="Erschließung", norms=norms, k=EXPECTED_K_LARGE)
        assert model.query_text == "Erschließung"
        assert len(model.norms) == EXPECTED_SINGLE_NORM_COUNT
        assert model.k == EXPECTED_K_LARGE

    def test_multiple_norms(self) -> None:
        """Verify that multiple UTNorm entries are all stored in the norms field."""
        norms = [
            UTNorm(name="BauGB", name_suffix=None, paragraph="123", absatz=None),
            UTNorm(name="BauNVO", name_suffix=None, paragraph="4", absatz="2"),
        ]
        model = QueryKResultsUTInput(query_text="query", norms=norms, k=EXPECTED_K_MEDIUM)
        assert len(model.norms) == EXPECTED_MULTIPLE_NORM_COUNT

    def test_k_optional(self) -> None:
        """Verify that the k field accepts None as a valid optional value."""
        model = QueryKResultsUTInput(query_text="q", norms=[], k=None)
        assert model.k is None
