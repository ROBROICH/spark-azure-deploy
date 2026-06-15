import pytest 

from db_pipelines.constants import Bundesland, DESTATIS_TO_LEGAL
from db_pipelines.parsers.utils.jurabk import clean_jurabk

@pytest.mark.parametrize(
    "bundesland, given, expected",
    [
        # ambiguous cases get a suffix
        (Bundesland.RP, "LJG", "LJG RhPf"),
        (Bundesland.BW, "DSchG", "DSchG BW"),
        # valid jurabks stay unchanged
        (Bundesland.BY, "BayAbmG", "BayAbmG"),
        (Bundesland.TH, "ThürDSchG", "ThürDSchG"),
        (Bundesland.BE, "Bln BodSchG", "Bln BodSchG"),
        (Bundesland.HH, "HmbBodSchG", "HmbBodSchG"),
        (Bundesland.HB, "BremAGROG", "BremAGROG"),
        (Bundesland.SN, "SächsJagdG", "SächsJagdG"),
        (Bundesland.SL, "SJG", "SJG"),
        (Bundesland.TH, "ThJG", "ThJG"),
        (Bundesland.HE, "HJagdG", "HJagdG"),
        # disallowed suffixes get replaced
        (Bundesland.HH, "JagdG HA", "JagdG Hmb"),
        (Bundesland.MV, "LJagdG M-V", "LJagdG MV"),
        (Bundesland.SL, "DSchG SL 2018", "DSchG 2018 Saarl"),
        (Bundesland.SH, "DSchG SH 2015", "DSchG 2015 SchlH")
    ]
)
def test_jurabk_resolution(bundesland: Bundesland, given: str, expected: str) -> None:
    """should resolve clean jurabk from given input"""
    assert clean_jurabk(given, bundesland) == expected


def test_suffix_for_all_bundeslaender() -> None:
    """Suffix works for all Bundesland enum values without error."""
    for bl in Bundesland:
        result = clean_jurabk("TestGesetz", bl)
        expected_suffix = DESTATIS_TO_LEGAL[bl.name]
        assert result == f"TestGesetz {expected_suffix}"