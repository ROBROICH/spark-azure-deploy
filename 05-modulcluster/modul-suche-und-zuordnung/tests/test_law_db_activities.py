"""
Tests for src/Activities/law_db_activities.py
"""

from datetime import timedelta
from unittest.mock import AsyncMock, patch

import pytest
from pydantic import ValidationError
from temporal.activities.law_db import QueryKResultsUTInput, QueryTopKDRInput, UTNorm
from temporalio import activity

import src.Activities.law_db_activities as law_db_module

# ---------------------------------------------------------------------------
# Constants for magic-value comparisons
# ---------------------------------------------------------------------------

EXPECTED_K_MEDIUM = 5
EXPECTED_K_SMALL = 3
EXPECTED_SINGLE_NORM_COUNT = 1
EXPECTED_MULTIPLE_NORM_COUNT = 2
EXPECTED_K_LARGE = 10
EXPECTED_MAX_ATTEMPTS = 30


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

    def test_activity_names_are_stable(self) -> None:
        assert activity._Definition.must_from_callable(law_db_module._query_top_k_dr).name == "law_db_query_top_k_dr"
        assert (
            activity._Definition.must_from_callable(law_db_module._query_k_results_ut).name
            == "law_db_query_k_results_ut"
        )


@pytest.mark.asyncio
class TestWorkflowWrappers:
    async def test_query_top_k_dr_options(self) -> None:
        inp = QueryTopKDRInput(jurabk="BauGB", query_text="q", section_substrings=None, k=EXPECTED_K_MEDIUM)
        with patch("src.Activities.law_db_activities.workflow.execute_activity", AsyncMock(return_value=[])) as mock:
            await law_db_module.query_top_k_dr(inp)
        args, kwargs = mock.call_args
        assert args == (law_db_module._query_top_k_dr, inp)
        assert kwargs["start_to_close_timeout"] == timedelta(seconds=60)
        assert kwargs["retry_policy"].maximum_attempts == EXPECTED_MAX_ATTEMPTS
        assert kwargs["retry_policy"].initial_interval == timedelta(seconds=5)
        assert kwargs["retry_policy"].maximum_interval is None

    async def test_query_k_results_ut_options(self) -> None:
        inp = QueryKResultsUTInput(query_text="q", norms=[], k=EXPECTED_K_MEDIUM)
        with patch("src.Activities.law_db_activities.workflow.execute_activity", AsyncMock(return_value=[])) as mock:
            await law_db_module.query_k_results_ut(inp)
        args, kwargs = mock.call_args
        assert args == (law_db_module._query_k_results_ut, inp)
        assert kwargs["start_to_close_timeout"] == timedelta(seconds=60)
        assert kwargs["retry_policy"].maximum_attempts == EXPECTED_MAX_ATTEMPTS


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
