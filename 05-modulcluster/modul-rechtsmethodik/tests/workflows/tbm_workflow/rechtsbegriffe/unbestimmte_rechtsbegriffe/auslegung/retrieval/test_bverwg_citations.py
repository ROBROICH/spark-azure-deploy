"""Tests for BVerwG citation extraction.

The shared logic lives in bverwg_citations.py:
  - BVERWG_AZ_RN_ANCHORED  used by dkr.py  (requires 'BVerwG' in text)
  - BVERWG_AZ_RN            used by ukr.py  (gericht field is the guard)
  - citations_from_matches  shared dedup/reconstruction

The gericht-filter behaviour (skip non-BVerwG chunks) is tested separately
via the ukr.py static method, since that logic lives there.
"""

import pytest

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    UTChunk,
    UTCitation,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.bverwg_citations import (
    BVERWG_AZ_RN,
    BVERWG_AZ_RN_ANCHORED,
    citations_from_matches,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.retrieval.urteile.ukr import (
    UrteileKontextRetrievalAgentWorkflow,
)

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _dkr(text: str) -> list[UTCitation]:
    return citations_from_matches(BVERWG_AZ_RN_ANCHORED.findall(text))


def _ukr(text: str) -> list[UTCitation]:
    return citations_from_matches(BVERWG_AZ_RN.findall(text))


def _make_chunk(text: str, gericht: str = "BVerwG") -> UTChunk:
    return UTChunk.model_construct(
        id=1,
        doc_id="test-doc",
        section_title="Test Section",
        section_number="1",
        chunk_index=0,
        start_char=0,
        end_char=len(text),
        section_length=len(text),
        is_complete_section=True,
        section_text=text,
        gericht=gericht,
        datum="2020-01-01",
        aktenzeichen="7 A 2/15",
        dokumenttyp="Urteil",
        normen=[],
        zitierte_urteile=[],
    )


# ===========================================================================
# BVERWG_AZ_RN_ANCHORED  (dkr.py - requires 'BVerwG' in text)
# ===========================================================================


class TestAnchoredPatternPositive:
    """Text contains a 'BVerwG' anchor within 80 chars of the Aktenzeichen."""

    @pytest.mark.parametrize(
        "text, expected_az, expected_rn",
        [
            # --- proceeding types ---
            ("BVerwG 7 A 2/15, Rn. 24", "7 A 2/15", "24"),
            ("BVerwG 7 B 14/12, Rn. 6", "7 B 14/12", "6"),
            ("BVerwG 3 C 5/18, Rn. 15", "3 C 5/18", "15"),
            ("BVerwG 4 BN 3/19, Rn. 10", "4 BN 3/19", "10"),
            ("BVerwG 4 CN 1/20, Rn. 5", "4 CN 1/20", "5"),
            ("BVerwG 6 PB 2/18, Rn. 7", "6 PB 2/18", "7"),
            ("BVerwG 2 AV 1/20, Rn. 3", "2 AV 1/20", "3"),
            ("BVerwG 9 VR 2/18, Rn. 1", "9 VR 2/18", "1"),
            ("BVerwG 7 PKH 1/19, Rn. 2", "7 PKH 1/19", "2"),
            ("BVerwG 7 KSt 1/19, Rn. 2", "7 KSt 1/19", "2"),
            ("BVerwG 6 P 3/17, Rn. 4", "6 P 3/17", "4"),
            ("BVerwG 5 F 1/21, Rn. 9", "5 F 1/21", "9"),
            # --- senate variants ---
            ("BVerwG 1 A 2/15, Rn. 5", "1 A 2/15", "5"),
            ("BVerwG 10 C 5/18, Rn. 15", "10 C 5/18", "15"),
            # --- separator: dot normalised to slash ---
            ("BVerwG 7 A 2.15, Rn. 24", "7 A 2/15", "24"),
            # --- year variants ---
            ("BVerwG 7 A 2/2015, Rn. 24", "7 A 2/2015", "24"),
            ("BVerwG 7 A 2/98, Rn. 12", "7 A 2/98", "12"),
            # --- Rn. formatting ---
            ("BVerwG 7 A 2/15, Rn 24", "7 A 2/15", "24"),
            ("BVerwG 7 A 2/15, Rn.24", "7 A 2/15", "24"),
            # --- typical German legal citation patterns ---
            ("BVerwG, Urteil vom 15.03.2018 - 7 A 2/15, Rn. 24", "7 A 2/15", "24"),
            ("vgl. BVerwG, Beschluss v. 5.6.2020 - 4 BN 3/19, Rn. 10", "4 BN 3/19", "10"),
            ("Urteil des BVerwG vom 12.11.2021, Az. 7 A 2/15, Rn. 5", "7 A 2/15", "5"),
            # --- anchor gap across newline ([\s\S] allows it) ---
            ("BVerwG,\nUrteil vom 15.03.2018 - 7 A 2/15, Rn. 24", "7 A 2/15", "24"),
            # --- parenthetical secondary Aktenzeichen: only primary captured ---
            ("BVerwG 7 A 2/15 (7 A 14/12), Rn. 24", "7 A 2/15", "24"),
        ],
        ids=[
            "type-A", "type-B", "type-C",
            "type-BN", "type-CN", "type-PB", "type-AV", "type-VR",
            "type-PKH", "type-KSt", "type-P", "type-F",
            "senate-1", "senate-10",
            "dot-separator",
            "year-4digit", "year-2digit",
            "rn-no-dot", "rn-no-space",
            "full-date-citation", "beschluss-citation", "az-citation",
            "anchor-gap-newline",
            "parenthetical-secondary-az-ignored",
        ],
    )
    def test_single_citation(self, text: str, expected_az: str, expected_rn: str) -> None:
        """Tests if a single BVerwG citation with anchor is correctly extracted by the anchored pattern."""
        result = _dkr(text)
        assert len(result) == 1
        assert result[0].aktenzeichen == expected_az
        assert result[0].randnummer == expected_rn

    def test_multiple_citations(self) -> None:
        """Tests if multiple BVerwG citations in one text are all extracted by the anchored pattern."""
        text = "BVerwG 7 A 2/15, Rn. 24 sowie BVerwG 4 BN 3/19, Rn. 10"
        az_rn = {(c.aktenzeichen, c.randnummer) for c in _dkr(text)}
        assert ("7 A 2/15", "24") in az_rn
        assert ("4 BN 3/19", "10") in az_rn

    def test_deduplication(self) -> None:
        """Tests if duplicate BVerwG citations in text are deduplicated by the anchored pattern."""
        text = "BVerwG 7 A 2/15, Rn. 24. Vgl. auch BVerwG 7 A 2/15, Rn. 24."
        assert len(_dkr(text)) == 1


class TestAnchoredPatternNegative:
    """Text should yield no citations."""

    @pytest.mark.parametrize(
        "text",
        [
            "7 A 2/15, Rn. 24",               # no BVerwG anchor
            "BVerwG 5 StR 2/15, Rn. 3",       # non-BVerwG type (BGH criminal)
            "BVerwG 7 A 2/15",                 # missing Rn
            "BVerwG 7 A 2/15\nRn. 24",         # Rn separated by newline
            "BVerwG 7 A 2/123, Rn. 24",        # 3-digit year
        ],
        ids=[
            "no-bverwg-anchor",
            "type-not-in-whitelist",
            "no-rn",
            "rn-after-newline",
            "year-3-digits",
        ],
    )
    def test_no_match(self, text: str) -> None:
        """Tests if texts that should not match the anchored pattern return no citations."""
        assert _dkr(text) == []


# ===========================================================================
# BVERWG_AZ_RN  (ukr.py - no anchor; gericht field is the guard)
# ===========================================================================


class TestUnanchoredPatternPositive:
    """No BVerwG anchor needed; gericht field guards this in production."""

    @pytest.mark.parametrize(
        "text, expected_az, expected_rn",
        [
            # --- proceeding types ---
            ("7 A 2/15, Rn. 24", "7 A 2/15", "24"),
            ("7 B 14/12, Rn. 6", "7 B 14/12", "6"),
            ("3 C 5/18, Rn. 15", "3 C 5/18", "15"),
            ("4 BN 3/19, Rn. 10", "4 BN 3/19", "10"),
            ("4 CN 1/20, Rn. 5", "4 CN 1/20", "5"),
            ("6 PB 2/18, Rn. 7", "6 PB 2/18", "7"),
            ("2 AV 1/20, Rn. 3", "2 AV 1/20", "3"),
            ("9 VR 2/18, Rn. 1", "9 VR 2/18", "1"),
            ("7 PKH 1/19, Rn. 2", "7 PKH 1/19", "2"),
            ("7 KSt 1/19, Rn. 2", "7 KSt 1/19", "2"),
            ("6 P 3/17, Rn. 4", "6 P 3/17", "4"),
            ("5 F 1/21, Rn. 9", "5 F 1/21", "9"),
            # --- senate variants ---
            ("1 A 2/15, Rn. 5", "1 A 2/15", "5"),
            ("10 C 5/18, Rn. 15", "10 C 5/18", "15"),
            # --- separator: dot normalised to slash ---
            ("7 A 2.15, Rn. 24", "7 A 2/15", "24"),
            # --- year variants ---
            ("7 A 2/2015, Rn. 24", "7 A 2/2015", "24"),
            ("7 A 2/98, Rn. 12", "7 A 2/98", "12"),
            # --- Rn. formatting ---
            ("7 A 2/15, Rn 24", "7 A 2/15", "24"),
            ("7 A 2/15, Rn.24", "7 A 2/15", "24"),
            # --- embedded in sentence ---
            ("Vgl. Urteil vom 15.03.2018 - 7 A 2/15, Rn. 24.", "7 A 2/15", "24"),
            # --- parenthetical: only primary captured ---
            ("7 A 2/15 (7 A 14/12), Rn. 24", "7 A 2/15", "24"),
        ],
        ids=[
            "type-A", "type-B", "type-C",
            "type-BN", "type-CN", "type-PB", "type-AV", "type-VR",
            "type-PKH", "type-KSt", "type-P", "type-F",
            "senate-1", "senate-10",
            "dot-separator",
            "year-4digit", "year-2digit",
            "rn-no-dot", "rn-no-space",
            "embedded-in-sentence",
            "parenthetical-secondary-az-ignored",
        ],
    )
    def test_single_citation(self, text: str, expected_az: str, expected_rn: str) -> None:
        """Tests if a single BVerwG citation without anchor is correctly extracted by the unanchored pattern."""
        result = _ukr(text)
        assert len(result) == 1
        assert result[0].aktenzeichen == expected_az
        assert result[0].randnummer == expected_rn

    def test_multiple_citations(self) -> None:
        """Tests if multiple citations in one text are all extracted by the unanchored pattern."""
        az_rn = {(c.aktenzeichen, c.randnummer) for c in _ukr("7 A 2/15, Rn. 24 sowie 4 BN 3/19, Rn. 10")}
        assert ("7 A 2/15", "24") in az_rn
        assert ("4 BN 3/19", "10") in az_rn

    def test_deduplication(self) -> None:
        """Tests if duplicate citations in text are deduplicated by the unanchored pattern."""
        assert len(_ukr("7 A 2/15, Rn. 24. Vgl. auch 7 A 2/15, Rn. 24.")) == 1


class TestUnanchoredPatternNegative:
    @pytest.mark.parametrize(
        "text",
        [
            "7 A 2/15",                        # missing Rn
            "7 A 2/15\nRn. 24",                # Rn separated by newline
            "5 StR 2/15, Rn. 3",               # non-BVerwG type (BGH criminal)
            "7 A 2/123, Rn. 24",               # 3-digit year
        ],
        ids=["no-rn", "rn-after-newline", "type-not-in-whitelist", "year-3-digits"],
    )
    def test_no_match(self, text: str) -> None:
        """Tests if texts that should not match the unanchored pattern return no citations."""
        assert _ukr(text) == []


# ===========================================================================
# Gericht filter - ukr.py static method
# ===========================================================================


class TestUkrGerichtFilter:
    """The chunk.gericht field controls whether extraction runs at all."""

    _ukr_chunk = staticmethod(UrteileKontextRetrievalAgentWorkflow._extract_citations_with_rn)

    def test_bverwg_chunk_is_processed(self) -> None:
        """Tests if a chunk with gericht='BVerwG' has its citations extracted."""
        chunk = _make_chunk("7 A 2/15, Rn. 24", gericht="BVerwG")
        assert len(self._ukr_chunk(chunk).zitierte_urteile) == 1

    @pytest.mark.parametrize(
        "gericht",
        ["BGH", "BFH", "BSG", "BAG", "OVG", "VGH", "VG"],
    )
    def test_non_bverwg_chunk_skipped(self, gericht: str) -> None:
        """Tests if chunks with a non-BVerwG gericht are skipped and yield no extracted citations."""
        chunk = _make_chunk("7 A 2/15, Rn. 24", gericht=gericht)
        assert self._ukr_chunk(chunk).zitierte_urteile == []

    def test_non_bverwg_preserves_existing_citations(self) -> None:
        """Tests if pre-existing citations on a non-BVerwG chunk are preserved without modification."""
        existing = UTCitation(aktenzeichen="7 A 2/15", randnummer="24")
        chunk = _make_chunk("7 A 2/15, Rn. 24", gericht="BGH")
        chunk = chunk.model_copy(update={"zitierte_urteile": [existing]})
        assert self._ukr_chunk(chunk).zitierte_urteile == [existing]

    def test_zitierte_urteile_field_replaced_not_appended(self) -> None:
        """Tests if the zitierte_urteile field is replaced with fresh citations rather than appended to."""
        stale = UTCitation(aktenzeichen="1 A 1/00", randnummer="1")
        chunk = _make_chunk("7 A 2/15, Rn. 24")
        chunk = chunk.model_copy(update={"zitierte_urteile": [stale]})
        result = self._ukr_chunk(chunk)
        assert all(c.aktenzeichen != "1 A 1/00" for c in result.zitierte_urteile)
        assert any(c.aktenzeichen == "7 A 2/15" for c in result.zitierte_urteile)
