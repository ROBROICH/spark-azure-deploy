# ruff: noqa: PLR2004
"""Tests for AuslegungWorkflow static methods."""

from temporal.workflows.rechtsmethodik.types import Auslegungsvorschlag, UnbestimmterRechtsbegriff

from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    UnbestimmterRechtsbegriffWithContext,
    UTChunk,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_workflow import (
    AuslegungWorkflow,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.urteil_klassifikation.uk_data_format import (
    AuslegungsMethode,
)

_ATTRIBUTION = "Zur Analyse von Wortbedeutungen greift SPARK Workflow über die Wikimedia-API auf Wiktionary zu. Die darüber bereitgestellten Inhalte stehen unter folgender Lizenz: CC-BY-SA 3.0.\n\n"


def _make_ur(
    begriff: str = "öffentliches Interesse",
    methode: str = "wortlaut",
    auslegung: str = "Eine Auslegung.",
) -> UnbestimmterRechtsbegriff:
    return UnbestimmterRechtsbegriff(
        begriff=begriff,
        auslegungsvorschläge=[Auslegungsvorschlag(auslegung_methode=methode, auslegungsvorschlag=auslegung)],
    )


def _make_ur_with_context(
    begriff: str = "öffentliches Interesse",
    u_context: list[UTChunk] | None = None,
) -> UnbestimmterRechtsbegriffWithContext:
    return UnbestimmterRechtsbegriffWithContext(
        begriff=begriff,
        auslegungsvorschläge=[],
        u_context=u_context or [],
        d_context=[],  # type: ignore[arg-type]
    )


def _make_chunk() -> UTChunk:
    return UTChunk.model_construct(
        id=1,
        doc_id="test-doc",
        section_title="Leitsatz",
        section_number="1",
        chunk_index=0,
        start_char=0,
        end_char=50,
        section_length=50,
        is_complete_section=True,
        section_text="Ein Urteilstext.",
        gericht="BVerwG",
        datum="2020-01-01",
        aktenzeichen="7 C 1/22",
        dokumenttyp="Urteil",
        normen=[],
        zitierte_urteile=[],
    )


class TestPrependWortlautAttribution:
    def test_adds_attribution_to_wortlaut_auslegung(self) -> None:
        """Tests if the Wikidata attribution is prepended to wortlaut auslegungen."""
        ur = _make_ur(methode="wortlaut", auslegung="Die Bedeutung des Begriffs.")
        result = AuslegungWorkflow._prepend_wortlaut_attribution([ur])
        assert result[0].auslegungsvorschläge[0].auslegungsvorschlag.startswith(_ATTRIBUTION)

    def test_does_not_modify_other_methoden(self) -> None:
        """Tests if non-wortlaut methoden are not modified."""
        for methode in ("systematik", "historie", "telos"):
            ur = _make_ur(methode=methode, auslegung="Eine Auslegung.")
            result = AuslegungWorkflow._prepend_wortlaut_attribution([ur])
            assert result[0].auslegungsvorschläge[0].auslegungsvorschlag == "Eine Auslegung."

    def test_attribution_prepended_not_appended(self) -> None:
        """Tests if the attribution is prepended, not appended, to the auslegung text."""
        original = "Die Bedeutung."
        ur = _make_ur(methode="wortlaut", auslegung=original)
        result = AuslegungWorkflow._prepend_wortlaut_attribution([ur])
        modified = result[0].auslegungsvorschläge[0].auslegungsvorschlag
        assert modified == _ATTRIBUTION + original

    def test_returns_same_list(self) -> None:
        """Tests if the same list object is returned after modification."""
        ur_list = [_make_ur(methode="wortlaut", auslegung="Text.")]
        result = AuslegungWorkflow._prepend_wortlaut_attribution(ur_list)
        assert result is ur_list


class TestBuildMethodSpecificUrp:
    def test_returns_four_lists(self) -> None:
        """Tests if _build_method_specific_urp returns exactly four lists."""
        enriched = [_make_ur_with_context()]
        classifications: list[dict[AuslegungsMethode, list[UTChunk]]] = [
            {
                "wortlaut": [],
                "systematik": [],
                "historie": [],
                "telos": [],
            }
        ]
        wa, sa, ha, ta = AuslegungWorkflow._build_method_specific_urp(enriched, classifications)
        assert len(wa) == 1
        assert len(sa) == 1
        assert len(ha) == 1
        assert len(ta) == 1

    def test_assigns_chunks_to_correct_method(self) -> None:
        """Tests if chunks are assigned to the correct auslegungs method."""
        chunk = _make_chunk()
        enriched = [_make_ur_with_context()]
        classifications: list[dict[AuslegungsMethode, list[UTChunk]]] = [
            {"wortlaut": [], "systematik": [], "historie": [], "telos": [chunk]}
        ]
        wa, _sa, ha, ta = AuslegungWorkflow._build_method_specific_urp(enriched, classifications)
        assert ta[0].u_context == [chunk]
        assert wa[0].u_context == []
        assert ha[0].u_context == []

    def test_missing_method_in_classification_gives_empty_context(self) -> None:
        """Tests if a missing method key in the classification results in an empty context."""
        enriched = [_make_ur_with_context()]
        classifications: list[dict[AuslegungsMethode, list[UTChunk]]] = [{}]
        wa, _sa, _ha, ta = AuslegungWorkflow._build_method_specific_urp(enriched, classifications)
        assert wa[0].u_context == []
        assert ta[0].u_context == []

    def test_preserves_begriff(self) -> None:
        """Tests if the Begriff is preserved after building method-specific URPs."""
        enriched = [_make_ur_with_context(begriff="Ermessen")]
        classifications = [{}]  # type: ignore[arg-type]
        wa, _, _, _ = AuslegungWorkflow._build_method_specific_urp(enriched, classifications)
        assert wa[0].begriff == "Ermessen"


class TestMergeAuslegungen:
    def test_output_length_matches_input(self) -> None:
        """Tests if the output length matches the number of input Rechtsbegriffe."""
        urs = [_make_ur(), _make_ur()]
        result = AuslegungWorkflow._merge_auslegungen(urs, urs, urs, urs)
        assert len(result) == 2

    def test_begriff_preserved_from_wa(self) -> None:
        """Tests if the Begriff is taken from the wortlaut auslegung."""
        wa = _make_ur(begriff="Ermessen", methode="wortlaut")
        sa = _make_ur(begriff="Ermessen", methode="systematik")
        ha = _make_ur(begriff="Ermessen", methode="historie")
        ta = _make_ur(begriff="Ermessen", methode="telos")
        result = AuslegungWorkflow._merge_auslegungen([wa], [sa], [ha], [ta])
        assert result[0].begriff == "Ermessen"

    def test_auslegungsvorschlaege_concatenated_from_all_four(self) -> None:
        """Tests if auslegungsvorschläge from all four methods are concatenated in order."""
        wa = _make_ur(methode="wortlaut")
        sa = _make_ur(methode="systematik")
        ha = _make_ur(methode="historie")
        ta = _make_ur(methode="telos")
        result = AuslegungWorkflow._merge_auslegungen([wa], [sa], [ha], [ta])
        methoden = [av.auslegung_methode for av in result[0].auslegungsvorschläge]
        assert methoden == ["wortlaut", "systematik", "historie", "telos"]

    def test_empty_lists_produce_empty_result(self) -> None:
        """Tests if empty input lists produce an empty result."""
        result = AuslegungWorkflow._merge_auslegungen([], [], [], [])
        assert result == []
