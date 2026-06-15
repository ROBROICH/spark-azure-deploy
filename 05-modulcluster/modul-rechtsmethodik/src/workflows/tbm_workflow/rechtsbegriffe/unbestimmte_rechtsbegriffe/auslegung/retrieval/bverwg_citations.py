"""Shared BVerwG citation extraction used by dkr.py and ukr.py."""

import re

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    UTCitation,
)

# Core Aktenzeichen + Randnummer pattern (no court anchor).
# Used by ukr.py where the chunk's gericht field already guarantees BVerwG.
BVERWG_AZ_RN = re.compile(
    r"\b(\d{1,2})"                               # senate 1-10
    r"\s+(BN|CN|PB|AV|VR|PKH|KSt|[BCAPF])"      # BVerwG proceeding types (from live data)
    r"\s+(\d+)[/\.](\d{4}|\d{2})(?!\d)"          # case/year (4-digit tried first; (?!\d) rejects 3-digit years)
    r"[^\n]{0,80}?"                               # gap ≤80 chars, no newline crossing
    r"Rn\.?\s*(\d+)"                              # Randnummer
)

# Same pattern with a BVerwG text anchor prepended.
# Used by dkr.py where the source text may reference multiple courts.
BVERWG_AZ_RN_ANCHORED = re.compile(
    r"BVerwG[\s\S]{0,80}?"                        # BVerwG anchor, ≤80 chars to Aktenzeichen
    + BVERWG_AZ_RN.pattern
)


def citations_from_matches(matches: list[tuple[str, ...]]) -> list[UTCitation]:
    """Convert raw regex matches to deduplicated UTCitation list."""
    by_key = {
        (f"{m[0]} {m[1]} {m[2]}/{m[3]}", m[4]): UTCitation(
            aktenzeichen=f"{m[0]} {m[1]} {m[2]}/{m[3]}",
            randnummer=m[4],
        )
        for m in matches
    }
    return list(by_key.values())
