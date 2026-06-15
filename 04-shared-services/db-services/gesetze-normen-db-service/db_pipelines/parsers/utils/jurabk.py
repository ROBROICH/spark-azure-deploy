"""helpers for juristische abkuerzung (jurabk) standardisation"""
import re
from db_pipelines.constants import (
    DESTATIS_TO_LEGAL,
    BUNDESLAND_PREFIXES,
    BUNDESLAND_SUFFIXES,
    Bundesland
)

def clean_jurabk(
        jurabk: str,
        bundesland: Bundesland,
        known_prefixes: list[str] | None = None,
        known_suffixes: str | None = None
    ) -> str:
    """clean up non-standard pre-/suffixes and make jurabk unique across states.

    make ambiguous jurabks unique
    (e.g. "LNatSchG" ->"LNatSchG <Bundesland-suffix>")
    and fix some common non-standard suffixes
    (e.g. "LJagdG M-V" -> "LJagdG MV", "JagdG HA" -> "JagdG Hmb").
    Skips if the jurabk already contains the state identifier
    (e.g. "BayAbmG" contains "Bay", "LNatSchG RhPf" contains "RhPf").
    """
    _legal_suffix = DESTATIS_TO_LEGAL.get(bundesland.name, "")
    _existing_prefixes = BUNDESLAND_PREFIXES.get(bundesland.name) if known_prefixes is None else known_prefixes
    _existing_suffix = BUNDESLAND_SUFFIXES.get(bundesland.name, None) if known_suffixes is None else known_suffixes
    needs_suffix = True

    # if suffix is a number, remove it before checking for
    # existing suffix (e.g. "DSchG SL 2018" -> "DSchG SL")
    digit_suffix = re.search(r"\b\d{4}\b", jurabk)
    digit_suffix_str = ""
    if digit_suffix:
        digit_suffix_str = digit_suffix.group(0) or ""
        jurabk = jurabk[:digit_suffix.start()].strip()

    clean_jurabk = jurabk
    # destatis shortform are not valid suffixes
    if (jurabk[-len(bundesland.name):] == bundesland.name):
        clean_jurabk = jurabk[:-len(bundesland.name)].strip()
        needs_suffix = True
    # fix non-standard suffixes (e.g. "LJagdG M-V" -> "LJagdG MV", "JagdG HA" -> "JagdG Hmb")
    elif (_existing_suffix and jurabk[-len(_existing_suffix):] == _existing_suffix):
        clean_jurabk = jurabk[:-len(_existing_suffix)].strip()
        needs_suffix = True

    # check if jurabk already contains the legal identifier as prefix
    if (_existing_prefixes and any(jurabk[:len(p)] == p for p in _existing_prefixes)):
        needs_suffix = False

    # check if jurabk already contains the legal identifier as suffix
    if (_legal_suffix and jurabk[-len(_legal_suffix):] == _legal_suffix):
        needs_suffix = False

    if digit_suffix:
        clean_jurabk = clean_jurabk + " " + digit_suffix_str
    if needs_suffix:
        clean_jurabk = clean_jurabk + " " + _legal_suffix
    return clean_jurabk.strip()