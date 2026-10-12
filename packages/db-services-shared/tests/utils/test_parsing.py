"""testing parsing utils"""

from db_services_shared.utils.parsing import split_paragraph_nr_str


def test_split_paragraph_nr_both() -> None:
    """should return (int, str) for string with alphabetic part"""
    assert split_paragraph_nr_str("17b") == (17, "b")


def test_split_paragraph_nr_int_only() -> None:
    """should return (int, None) for string with no alphabetic part"""
    assert split_paragraph_nr_str("17") == (17, "")


def test_split_paragraph_nr_fail() -> None:
    """should return (inf, string) when it can't parse a number"""
    assert split_paragraph_nr_str("ab") == (float("inf"), "ab")
