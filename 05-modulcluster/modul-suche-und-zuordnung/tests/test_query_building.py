"""
Tests for src/tbm_matching/query_building.py — build_queries and extract_definition.
"""

from typing import Any

from src.tbm_matching.query_building import build_queries, extract_definition

EXPECTED_QUERY_COUNT = 3

# ---------------------------------------------------------------------------
# extract_definition
# ---------------------------------------------------------------------------


class TestExtractDefinition:
    """Tests for extract_definition extracting a definition from TBM Rechtsbegriffe."""

    def test_no_rechtsbegriffe_key(self) -> None:
        assert extract_definition({}) is None

    def test_empty_rechtsbegriffe(self) -> None:
        assert extract_definition({"rechtsbegriffe": {}}) is None

    def test_empty_bestimmte_list(self) -> None:
        assert extract_definition({"rechtsbegriffe": {"bestimmte_rechtsbegriffe": []}}) is None

    def test_first_definition_no_selection(self) -> None:
        """Without selected_definition, the first definition text is returned."""
        tbm: dict[str, Any] = {
            "rechtsbegriffe": {
                "bestimmte_rechtsbegriffe": [
                    {
                        "definitions": [
                            {"uuid": "d1", "definition": "Def A"},
                            {"uuid": "d2", "definition": "Def B"},
                        ],
                        "selected_definition": None,
                    }
                ]
            }
        }
        assert extract_definition(tbm) == "Def A"

    def test_selected_definition_used(self) -> None:
        """When selected_definition matches a uuid, that definition is returned."""
        tbm: dict[str, Any] = {
            "rechtsbegriffe": {
                "bestimmte_rechtsbegriffe": [
                    {
                        "definitions": [
                            {"uuid": "d1", "definition": "Def A"},
                            {"uuid": "d2", "definition": "Def B"},
                        ],
                        "selected_definition": "d2",
                    }
                ]
            }
        }
        assert extract_definition(tbm) == "Def B"

    def test_selected_definition_not_found_fallback(self) -> None:
        """When selected_definition doesn't match, first definition is used."""
        tbm: dict[str, Any] = {
            "rechtsbegriffe": {
                "bestimmte_rechtsbegriffe": [
                    {
                        "definitions": [
                            {"uuid": "d1", "definition": "Def A"},
                        ],
                        "selected_definition": "nonexistent",
                    }
                ]
            }
        }
        assert extract_definition(tbm) == "Def A"

    def test_empty_definitions_list(self) -> None:
        """Empty definitions list returns None."""
        tbm: dict[str, Any] = {
            "rechtsbegriffe": {"bestimmte_rechtsbegriffe": [{"definitions": [], "selected_definition": None}]}
        }
        assert extract_definition(tbm) is None

    def test_none_rechtsbegriffe(self) -> None:
        """None value for rechtsbegriffe returns None."""
        assert extract_definition({"rechtsbegriffe": None}) is None


# ---------------------------------------------------------------------------
# build_queries
# ---------------------------------------------------------------------------


class TestBuildQueries:
    """Tests for build_queries composing enriched query strings from TBM dicts."""

    def test_empty_list(self) -> None:
        assert build_queries([]) == []

    def test_prueffrage_only(self) -> None:
        """TBM with only prueffrage produces that text as query."""
        tbms = [{"prueffrage": "Ist das Vorhaben zulässig?"}]
        queries = build_queries(tbms)
        assert len(queries) == 1
        assert queries[0] == "Ist das Vorhaben zulässig?"

    def test_prueffrage_with_definition(self) -> None:
        """Definition is appended to prueffrage when available."""
        tbms = [
            {
                "prueffrage": "Question?",
                "rechtsbegriffe": {
                    "bestimmte_rechtsbegriffe": [
                        {
                            "definitions": [{"uuid": "d1", "definition": "The def"}],
                            "selected_definition": "d1",
                        }
                    ]
                },
            }
        ]
        queries = build_queries(tbms)
        assert "Question?" in queries[0]
        assert "The def" in queries[0]

    def test_prueffrage_with_absatz_text(self) -> None:
        """Absatz text is appended to prueffrage."""
        tbms = [{"prueffrage": "Q?", "_absatz_text": "Absatz context."}]
        queries = build_queries(tbms)
        assert "Q?" in queries[0]
        assert "Absatz context." in queries[0]

    def test_prueffrage_with_definition_and_absatz(self) -> None:
        """Both definition and absatz are appended."""
        tbms = [
            {
                "prueffrage": "Q?",
                "_absatz_text": "Ctx",
                "rechtsbegriffe": {
                    "bestimmte_rechtsbegriffe": [
                        {
                            "definitions": [{"uuid": "d1", "definition": "def"}],
                            "selected_definition": "d1",
                        }
                    ]
                },
            }
        ]
        queries = build_queries(tbms)
        assert "Q?" in queries[0]
        assert "def" in queries[0]
        assert "Ctx" in queries[0]

    def test_missing_prueffrage_defaults_empty(self) -> None:
        """Missing prueffrage key defaults to empty string base."""
        tbms: list[dict[str, Any]] = [{}]
        queries = build_queries(tbms)
        assert queries == [""]

    def test_multiple_tbms(self) -> None:
        """Multiple TBMs produce one query each."""
        tbms = [
            {"prueffrage": "Q1"},
            {"prueffrage": "Q2"},
            {"prueffrage": "Q3"},
        ]
        queries = build_queries(tbms)
        assert len(queries) == EXPECTED_QUERY_COUNT
        assert queries == ["Q1", "Q2", "Q3"]
