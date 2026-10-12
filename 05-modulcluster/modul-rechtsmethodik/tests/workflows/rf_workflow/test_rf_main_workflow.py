# ruff: noqa: PLR2004
"""Tests for RechtsfolgenAnalyseWorkflow pure functions."""

import pytest
from fixtures.bnatschg_44 import RECHTSFOLGE, SATZ_1_NR_1_TEXT
from temporal.contracts import Rechtsfolge, SatzKategorie

from src.absatz import Absatz
from src.workflows.norm_workflow.norm_types import NormDekonstruktionWorkflowSatzOutput
from src.workflows.rf_workflow.rf_main_workflow import create_rf_absatz, create_rf_satz


def _make_satz(
    satz_nr: str = "1",
    norm_typ_lvl2: SatzKategorie | None = SatzKategorie.WENN_DANN,
    rechtsfolge: str | None = None,
    atomare: list[str] | None = None,
) -> NormDekonstruktionWorkflowSatzOutput:
    return NormDekonstruktionWorkflowSatzOutput(
        satz_nr=satz_nr,
        markers=["§ 4 Abs. 1 S. 1"],
        satz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
        norm_typ_lvl1="materiell-rechtlich",
        norm_typ_lvl2=norm_typ_lvl2,
        rechtsfolge=rechtsfolge,
        atomare_tatbestandsmerkmale=atomare,
    )


def _make_rechtsfolge() -> Rechtsfolge:
    return Rechtsfolge(
        text="Die Genehmigung ist zu erteilen.",
        sollensanordnungen="erlaubnis",
        rechtsfolgen_adressat="handlungsermächtigung",
    )


class TestCreateRfSatz:
    def test_preserves_satz_metadata(self) -> None:
        """Tests if Satz metadata (satz_nr, markers, satz_text, norm_typ) is preserved in the output."""
        satz = _make_satz(
            satz_nr="3",
            norm_typ_lvl2=SatzKategorie.SONSTIGES,
        )
        result = create_rf_satz(satz, None)
        assert result.satz_nr == "3"
        assert result.markers == satz.markers
        assert result.satz_text == satz.satz_text
        assert result.norm_typ_lvl1 == satz.norm_typ_lvl1
        assert result.norm_typ_lvl2 == "sonstiges"

    def test_rechtsfolge_none_when_not_provided(self) -> None:
        """Tests if rechtsfolge is None in the output when no Rechtsfolge is provided."""
        result = create_rf_satz(_make_satz(), None)
        assert result.rechtsfolge is None

    def test_rechtsfolge_set_when_provided(self) -> None:
        """Tests if the Rechtsfolge object is set on the output when provided."""
        rf = _make_rechtsfolge()
        result = create_rf_satz(_make_satz(), rf)
        assert result.rechtsfolge == rf

    def test_preserves_atomare_tatbestandsmerkmale(self) -> None:
        """Tests if atomare_tatbestandsmerkmale are preserved unchanged in the output."""
        satz = _make_satz(atomare=["TBM A", "TBM B"])
        result = create_rf_satz(satz, None)
        assert result.atomare_tatbestandsmerkmale == ["TBM A", "TBM B"]


class TestCreateRfAbsatz:
    def test_output_length_matches_input(self) -> None:
        """Tests if the output Absatz contains the same number of Saetze as the input."""
        saetze = [_make_satz(), _make_satz()]
        absatz: Absatz[NormDekonstruktionWorkflowSatzOutput] = Absatz(
            absatz_nr="1", absatz_text="Ein Absatz.", saetze=saetze
        )
        result = create_rf_absatz(absatz, [None, None])
        assert len(result.saetze) == 2

    def test_preserves_absatz_nr(self) -> None:
        """Tests if the absatz_nr is preserved in the output Absatz."""
        absatz: Absatz[NormDekonstruktionWorkflowSatzOutput] = Absatz(
            absatz_nr="5", absatz_text="Text.", saetze=[_make_satz()]
        )
        result = create_rf_absatz(absatz, [None])
        assert result.absatz_nr == "5"

    def test_maps_rechtsfolgen_to_correct_saetze(self) -> None:
        """Tests if Rechtsfolgen are mapped to the correct Saetze positions in the output."""
        rf = _make_rechtsfolge()
        absatz: Absatz[NormDekonstruktionWorkflowSatzOutput] = Absatz(
            absatz_nr="1", absatz_text="Text.", saetze=[_make_satz(), _make_satz()]
        )
        result = create_rf_absatz(absatz, [rf, None])
        assert result.saetze[0].rechtsfolge == rf
        assert result.saetze[1].rechtsfolge is None

    @pytest.mark.parametrize("count", [1, 3, 5])
    def test_output_count_matches_parametrized_input(self, count: int) -> None:
        """Tests if the output Satz count matches the parametrized input count."""
        saetze = [_make_satz(satz_nr=str(i)) for i in range(count)]
        absatz: Absatz[NormDekonstruktionWorkflowSatzOutput] = Absatz(absatz_nr="1", absatz_text="Text.", saetze=saetze)
        result = create_rf_absatz(absatz, [None] * count)
        assert len(result.saetze) == count


class TestCreateRfSatzWithRealData:
    """Tests using real BNatSchG § 44 production rechtsfolge."""

    def test_real_verboten_rechtsfolge_preserved(self) -> None:
        """Tests if the real BNatSchG § 44 Rechtsfolge is preserved in the create_rf_satz output."""
        satz = NormDekonstruktionWorkflowSatzOutput(
            satz_nr="1",
            markers=["§ 44 Abs. 1 S. 1"],
            satz_text=SATZ_1_NR_1_TEXT,
            norm_typ_lvl1="materiell-rechtlich",
            norm_typ_lvl2="wenn-dann",
        )
        result = create_rf_satz(satz, RECHTSFOLGE)
        assert result.rechtsfolge == RECHTSFOLGE

    def test_real_rechtsfolge_is_verbot(self) -> None:
        """Tests if the real BNatSchG § 44 Rechtsfolge has sollensanordnungen='verbot' and keine handlungsermächtigung."""
        satz = NormDekonstruktionWorkflowSatzOutput(
            satz_nr="1",
            markers=["§ 44 Abs. 1 S. 1"],
            satz_text=SATZ_1_NR_1_TEXT,
            norm_typ_lvl1="materiell-rechtlich",
            norm_typ_lvl2="wenn-dann",
        )
        result = create_rf_satz(satz, RECHTSFOLGE)
        assert result.rechtsfolge is not None
        assert result.rechtsfolge.sollensanordnungen == "verbot"
        assert result.rechtsfolge.rechtsfolgen_adressat == "keine handlungsermächtigung"
