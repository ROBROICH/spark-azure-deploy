"""unit tests for the neighbour assembly in create_norm_result"""

from db_pipelines.routes.db import create_norm_result
from db_pipelines.schemas.api import Norm


def _norm(paragraph_nr: str) -> Norm:
    """Minimal API norm carrying just the fields the neighbour logic reads."""
    return Norm(
        jurabk="NachbarG",
        doknr="BJNRNACHBAR",
        titel=f"§ {paragraph_nr} Titel",
        paragraph_text=f"Text von § {paragraph_nr}",
        paragraph_nr=paragraph_nr,
    )


def test_picks_the_requested_norm_not_the_middle_row():
    """the requested norm is selected by value, whatever its position"""
    result = create_norm_result([_norm("4"), _norm("4a"), _norm("5")], "5")

    assert [norm.paragraph_nr for norm in result] == ["5"]
    assert result[0].prev == "4a"
    assert result[0].next is None


def test_requested_norm_first_has_no_prev():
    """a requested norm at the start of the row set reports no predecessor"""
    result = create_norm_result([_norm("4"), _norm("4a")], "4")

    assert result[0].paragraph_nr == "4"
    assert result[0].prev is None
    assert result[0].next == "4a"


def test_normalises_whitespace_in_the_request():
    """callers may pass "1 a" for "1a" """
    result = create_norm_result([_norm("1"), _norm("1a"), _norm("2")], "1 a")

    assert result[0].paragraph_nr == "1a"
    assert result[0].prev == "1"
    assert result[0].next == "2"


def test_missing_match_returns_empty_instead_of_raising():
    """a row set without the requested norm is a controlled miss

    This used to escape as StopIteration (two-row and >=four-row branches) or
    IndexError (requested norm last), surfacing as a 500.
    """
    assert create_norm_result([_norm("4"), _norm("4a")], "9") == []


def test_requested_norm_last_has_no_next():
    """a requested norm in the last position is found and has no next"""
    result = create_norm_result([_norm("3"), _norm("4"), _norm("4a")], "4a")

    assert result[0].paragraph_nr == "4a"
    assert result[0].prev == "4"
    assert result[0].next is None


def test_without_paragraph_nr_every_norm_gets_neighbours():
    """listing mode is unchanged: each norm links to its siblings"""
    result = create_norm_result([_norm("1"), _norm("2"), _norm("3")], None)

    assert [(n.prev, n.paragraph_nr, n.next) for n in result] == [
        (None, "1", "2"),
        ("1", "2", "3"),
        ("2", "3", None),
    ]
