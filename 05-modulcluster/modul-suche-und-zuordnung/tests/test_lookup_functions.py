"""
Tests for src/workflows/tbm_matching/rule_based_matching/lookup_functions.py

All functions are pure — tested directly.
"""

import pytest

from src.tbm_matching.rule_based_matching.lookup_data import MatchingRule
from src.tbm_matching.rule_based_matching.lookup_functions import (
    find_lookup_documents_for_tbms,
    get_documents_by_type,
    get_required_document_types_for_position,
    normalize_number,
    number_in_range,
    rule_matches,
)

EXPECTED_TBM_COUNT = 2

# ---------------------------------------------------------------------------
# normalize_number
# ---------------------------------------------------------------------------


class TestNormalizeNumber:
    """Tests for the normalize_number helper that splits a paragraph string into numeric and suffix parts."""

    def test_plain_integer(self) -> None:
        """Verify that a plain integer string returns the number and an empty suffix."""
        assert normalize_number("30") == (30, "")

    def test_integer_with_letter_suffix(self) -> None:
        """Verify that a number with a lowercase letter suffix is split correctly."""
        assert normalize_number("30a") == (30, "a")

    def test_large_number(self) -> None:
        """Verify that a multi-digit integer with no suffix is parsed correctly."""
        assert normalize_number("123") == (123, "")

    def test_letter_suffix_uppercase(self) -> None:
        """Verify that an uppercase letter suffix is preserved as-is."""
        assert normalize_number("15B") == (15, "B")

    def test_invalid_format_raises(self) -> None:
        """Verify that a non-numeric string raises a ValueError."""
        with pytest.raises(ValueError):
            normalize_number("abc")


# ---------------------------------------------------------------------------
# number_in_range
# ---------------------------------------------------------------------------


class TestNumberInRange:
    """Tests for the number_in_range helper that checks whether a paragraph number falls within bounds."""

    def test_value_within_range(self) -> None:
        """Verify that a value strictly between the bounds returns True."""
        assert number_in_range("20", "15", "28") is True

    def test_value_at_lower_bound(self) -> None:
        """Verify that a value equal to the lower bound is included (inclusive)."""
        assert number_in_range("15", "15", "28") is True

    def test_value_at_upper_bound(self) -> None:
        """Verify that a value equal to the upper bound is included (inclusive)."""
        assert number_in_range("28", "15", "28") is True

    def test_value_below_range(self) -> None:
        """Verify that a value below the lower bound returns False."""
        assert number_in_range("10", "15", "28") is False

    def test_value_above_range(self) -> None:
        """Verify that a value above the upper bound returns False."""
        assert number_in_range("35", "15", "28") is False

    def test_suffix_comparison(self) -> None:
        """Verify that letter suffixes are compared lexicographically for boundary checking."""
        assert number_in_range("30a", "30", "30a") is True
        assert number_in_range("30b", "30", "30a") is False

    def test_same_start_end(self) -> None:
        """Verify that a single-value range only matches that exact value."""
        assert number_in_range("20", "20", "20") is True
        assert number_in_range("21", "20", "20") is False


# ---------------------------------------------------------------------------
# rule_matches
# ---------------------------------------------------------------------------


class TestRuleMatches:
    """Tests for the rule_matches predicate that checks whether a MatchingRule applies to a norm position."""

    def _rule(
        self,
        number: str | tuple[str, str] | None = None,
        law: str | None = None,
        absatz: str | None = None,
        satz: str | None = None,
        documents: tuple[str, ...] = ("DocType",),
    ) -> MatchingRule:
        """Build a MatchingRule with sensible defaults for use in test assertions."""
        return MatchingRule(number=number, law=law, absatz=absatz, satz=satz, documents=documents)

    def test_wildcard_rule_matches_anything(self) -> None:
        """Verify that a rule with all-None fields matches any paragraph and law."""
        rule = self._rule()
        assert rule_matches(rule, paragraph="34", law="BauGB") is True

    def test_law_mismatch_returns_false(self) -> None:
        """Verify that a rule for a different law does not match."""
        rule = self._rule(law="BauGB")
        assert rule_matches(rule, paragraph="34", law="BNatSchG") is False

    def test_law_match_returns_true(self) -> None:
        """Verify that a rule matches when the law field matches the input."""
        rule = self._rule(law="BauGB")
        assert rule_matches(rule, paragraph="1", law="BauGB") is True

    def test_single_paragraph_match(self) -> None:
        """Verify that a single-number rule matches the exact paragraph."""
        rule = self._rule(number="34")
        assert rule_matches(rule, paragraph="34", law="X") is True

    def test_single_paragraph_mismatch(self) -> None:
        """Verify that a single-number rule does not match a different paragraph."""
        rule = self._rule(number="34")
        assert rule_matches(rule, paragraph="35", law="X") is False

    def test_range_paragraph_match(self) -> None:
        """Verify that a range rule matches a paragraph within the range."""
        rule = self._rule(number=("15", "28"))
        assert rule_matches(rule, paragraph="20", law="X") is True

    def test_range_paragraph_mismatch(self) -> None:
        """Verify that a range rule does not match a paragraph outside the range."""
        rule = self._rule(number=("15", "28"))
        assert rule_matches(rule, paragraph="30", law="X") is False

    def test_absatz_match(self) -> None:
        """Verify that a rule with an absatz constraint matches the correct absatz."""
        rule = self._rule(absatz="1")
        assert rule_matches(rule, paragraph="1", law="X", absatz="1") is True

    def test_absatz_mismatch(self) -> None:
        """Verify that a rule with an absatz constraint does not match a different absatz."""
        rule = self._rule(absatz="1")
        assert rule_matches(rule, paragraph="1", law="X", absatz="2") is False

    def test_absatz_none_in_rule_is_wildcard(self) -> None:
        """Verify that absatz=None in a rule acts as a wildcard and matches any absatz."""
        rule = self._rule(absatz=None)
        assert rule_matches(rule, paragraph="1", law="X", absatz="3") is True

    def test_satz_match(self) -> None:
        """Verify that a rule with a satz constraint matches the correct satz."""
        rule = self._rule(satz="2")
        assert rule_matches(rule, paragraph="1", law="X", satz="2") is True

    def test_satz_mismatch(self) -> None:
        """Verify that a rule with a satz constraint does not match a different satz."""
        rule = self._rule(satz="2")
        assert rule_matches(rule, paragraph="1", law="X", satz="1") is False

    def test_all_fields_must_match(self) -> None:
        """Verify that a rule only matches when all specified fields agree with the input."""
        rule = self._rule(number="34", law="BauGB", absatz="1", satz="1")
        assert rule_matches(rule, paragraph="34", law="BauGB", absatz="1", satz="1") is True
        assert rule_matches(rule, paragraph="34", law="BauGB", absatz="1", satz="2") is False

    def test_absatz_specified_in_rule_but_none_in_tbm_still_matches(self) -> None:
        rule = self._rule(absatz="1")
        assert rule_matches(rule, paragraph="1", law="X", absatz=None) is True

    def test_satz_specified_in_rule_but_none_in_tbm_still_matches(self) -> None:
        rule = self._rule(satz="2")
        assert rule_matches(rule, paragraph="1", law="X", satz=None) is True

    def test_absatz_in_tbm_but_none_in_rule_matches(self) -> None:
        rule = self._rule(absatz=None)
        assert rule_matches(rule, paragraph="1", law="X", absatz="3") is True


# ---------------------------------------------------------------------------
# get_documents_by_type
# ---------------------------------------------------------------------------


class TestGetDocumentsByType:
    """Tests for get_documents_by_type that resolves assigned documents by document type name."""

    def test_empty_result_json_returns_empty(self) -> None:
        """Verify that an empty result_json yields an empty document list."""
        result = get_documents_by_type({}, ["DocType"])
        assert result == []

    def test_matching_doc_type_returns_document(self) -> None:
        """Verify that a matching document type returns the assigned document with correct fields."""
        result_json = {
            "matched_document_types": [
                {
                    "required_document_type": {"document_type_name": "Erläuterungsbericht"},
                    "assigned_documents": [
                        {
                            "document_name": "Erläuterungsbericht.pdf",
                            "document_id": "doc-1",
                            "project_id": "proj-1",
                        }
                    ],
                }
            ]
        }
        result = get_documents_by_type(result_json, ["Erläuterungsbericht"])
        assert len(result) == 1
        assert result[0]["title"] == "Erläuterungsbericht.pdf"
        assert result[0]["document_id"] == "doc-1"

    def test_non_matching_doc_type_excluded(self) -> None:
        """Verify that documents belonging to a non-requested type are not returned."""
        result_json = {
            "matched_document_types": [
                {
                    "required_document_type": {"document_type_name": "OtherType"},
                    "assigned_documents": [{"document_name": "doc.pdf", "document_id": "d1"}],
                }
            ]
        }
        result = get_documents_by_type(result_json, ["Erläuterungsbericht"])
        assert result == []

    def test_deduplicates_by_document_id(self) -> None:
        """Verify that the same document appearing in multiple type entries is returned only once."""
        result_json = {
            "matched_document_types": [
                {
                    "required_document_type": {"document_type_name": "TypeA"},
                    "assigned_documents": [
                        {"document_name": "doc.pdf", "document_id": "doc-1"},
                    ],
                },
                {
                    "required_document_type": {"document_type_name": "TypeB"},
                    "assigned_documents": [
                        {"document_name": "doc.pdf", "document_id": "doc-1"},
                    ],
                },
            ]
        }
        result = get_documents_by_type(result_json, ["TypeA", "TypeB"])
        assert len(result) == 1

    def test_skips_documents_without_name(self) -> None:
        """Verify that assigned documents missing a document_name field are skipped."""
        result_json = {
            "matched_document_types": [
                {
                    "required_document_type": {"document_type_name": "TypeA"},
                    "assigned_documents": [{"document_id": "d1"}],  # no document_name
                }
            ]
        }
        result = get_documents_by_type(result_json, ["TypeA"])
        assert result == []


# ---------------------------------------------------------------------------
# get_required_document_types_for_position
# ---------------------------------------------------------------------------


class TestGetRequiredDocumentTypesForPosition:
    """Tests for get_required_document_types_for_position that collects applicable document types from rules."""

    def test_no_matching_rules_returns_empty(self) -> None:
        """Verify that an empty list is returned when no rules match the given position."""
        rules = [MatchingRule(number="99", law="FakeLaw", absatz=None, satz=None, documents=("Doc",))]
        result = get_required_document_types_for_position("BauGB", "34", None, None, rules)
        assert result == []

    def test_matching_rule_returns_documents(self) -> None:
        """Verify that the document types from a matching rule are included in the result."""
        rules = [MatchingRule(number="34", law="BauGB", absatz=None, satz=None, documents=("DocA", "DocB"))]
        result = get_required_document_types_for_position("BauGB", "34", None, None, rules)
        assert "DocA" in result
        assert "DocB" in result

    def test_multiple_matching_rules_merged(self) -> None:
        """Verify that document types from all matching rules are combined into a single list."""
        rules = [
            MatchingRule(number="34", law="BauGB", absatz=None, satz=None, documents=("DocA",)),
            MatchingRule(number=None, law="BauGB", absatz=None, satz=None, documents=("DocB",)),
        ]
        result = get_required_document_types_for_position("BauGB", "34", None, None, rules)
        assert "DocA" in result
        assert "DocB" in result

    def test_deduplicates_document_types(self) -> None:
        """Verify that duplicate document types from multiple matching rules are deduplicated."""
        rules = [
            MatchingRule(number=None, law=None, absatz=None, satz=None, documents=("SharedDoc",)),
            MatchingRule(number=None, law=None, absatz=None, satz=None, documents=("SharedDoc",)),
        ]
        result = get_required_document_types_for_position("X", "1", None, None, rules)
        assert result.count("SharedDoc") == 1


# ---------------------------------------------------------------------------
# find_lookup_documents_for_tbms
# ---------------------------------------------------------------------------


class TestFindLookupDocumentsForTbms:
    """Tests for find_lookup_documents_for_tbms that resolves documents for a list of TBM norm positions."""

    def test_empty_tbm_list_returns_empty(self) -> None:
        """Verify that an empty TBM list returns an empty result."""
        result = find_lookup_documents_for_tbms([], {}, [])
        assert result == []

    def test_returns_one_list_per_tbm(self) -> None:
        """Verify that the result contains exactly one document list entry per TBM."""
        tbms = [
            {"_jurabk": "BauGB", "_paragraph_nr": "34", "_absatz_nr": "1", "_satz_nr": "1"},
            {"_jurabk": "BauGB", "_paragraph_nr": "35", "_absatz_nr": "1", "_satz_nr": "1"},
        ]
        result = find_lookup_documents_for_tbms(tbms, {}, [])
        assert len(result) == EXPECTED_TBM_COUNT

    def test_resolved_documents_for_matching_rule(self) -> None:
        """Verify that matched documents are correctly resolved and returned for a matching rule."""
        rules = [MatchingRule(number="34", law="BauGB", absatz=None, satz=None, documents=("Erläuterungsbericht",))]
        result_json = {
            "matched_document_types": [
                {
                    "required_document_type": {"document_type_name": "Erläuterungsbericht"},
                    "assigned_documents": [{"document_name": "Bericht.pdf", "document_id": "d1", "project_id": "p1"}],
                }
            ]
        }
        tbms = [{"_jurabk": "BauGB", "_paragraph_nr": "34", "_absatz_nr": "1", "_satz_nr": "1"}]
        result = find_lookup_documents_for_tbms(tbms, result_json, rules)
        assert len(result[0]) == 1
        assert result[0][0]["title"] == "Bericht.pdf"
