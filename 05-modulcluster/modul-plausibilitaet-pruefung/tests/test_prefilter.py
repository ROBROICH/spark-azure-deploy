"""Unit tests for the LLM-free pre-filter in front of the context checker."""

from src.activities import prefilter
from src.workflows.check_logic_wf.schemas.note_schemas import PageContext
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import ScreeningHit

from .conftest import make_chunk_payload, make_chunk_with_context


def _hit(claim: str, ref: str, chunk_a: str, chunk_b: str, note: str = "Prüfen, ob …") -> ScreeningHit:
    return ScreeningHit(
        claim_id=claim,
        reference_id=ref,
        claim_chunk_id=chunk_a,
        reference_chunk_id=chunk_b,
        rating=80,
        note=note,
        reasoning="r",
    )


class TestPageIdentifiers:
    def test_extracts_measure_numbers_and_species(self) -> None:
        text = "Maßnahmen-Nr. 11.4 ACEF Durch das Vorhaben betroffene Art Hohltaube (Columba oenas)"
        ids = prefilter.page_identifiers(text)
        assert ids["MASSNAHME"] == ["11.4 ACEF"]
        assert ids["STECKBRIEF"] == ["HOHLTAUBE"]

    def test_build_page_contexts_groups_by_document_and_page(self) -> None:
        chunks = [
            make_chunk_payload(
                chunk_id="c1", document_id="d1", page_numbers=[3], chunk_content="Maßnahmen-Nr. 6.2a ACEF"
            ),
            make_chunk_payload(chunk_id="c2", document_id="d1", page_numbers=[3], chunk_content="Dornensträucher 15 %"),
            make_chunk_payload(
                chunk_id="c3", document_id="d1", page_numbers=[4], chunk_content="Maßnahmen-Nr. 11.4 ACEF"
            ),
        ]
        pages = prefilter.build_page_contexts(chunks)
        assert set(pages) == {"d1#3", "d1#4"}
        assert "Dornensträucher" in pages["d1#3"].text
        assert pages["d1#3"].identifiers["MASSNAHME"] == ["6.2A ACEF"]


class TestRules:
    def test_trivial_only_on_text_identity(self) -> None:
        a = make_chunk_with_context(document_id="d", chunk_text="Netzfänge (N1 bis N12)", page_numbers=[1])
        b = make_chunk_with_context(document_id="d", chunk_text="Netzfang N13 am Waldrand", page_numbers=[1])
        # same page, different text -> NOT trivial (corrected rule)
        assert prefilter.trivial(a, b, "Netzfänge N1 bis N12", "Netzfang N13") is False
        assert prefilter.trivial(a, b, "Die Länge beträgt 5 km.", "Die Länge beträgt 5 km.") is True
        # two claims from the same chunk: identical chunk text is no reason to drop them
        same = make_chunk_with_context(document_id="d", chunk_text="Radius 900 m. Radius 1.100 m.", page_numbers=[2])
        assert prefilter.trivial(same, same, "Radius 900 m", "Radius 1.100 m", same_chunk=True) is False
        assert prefilter.trivial(same, same.model_copy(), "Radius 900 m", "Radius 1.100 m", same_chunk=False) is True

    def test_instance_conflict_needs_disjoint_values_in_same_class(self) -> None:
        a = make_chunk_with_context(document_id="d", page_numbers=[10])
        b = make_chunk_with_context(document_id="d", page_numbers=[12])
        pages = {
            "d#10": PageContext(document_id="d", page=10, text="", identifiers={"MASSNAHME": ["6.2A ACEF"]}),
            "d#12": PageContext(document_id="d", page=12, text="", identifiers={"MASSNAHME": ["11.4 ACEF"]}),
        }
        assert prefilter.instance_conflict(a, b, pages) == "MASSNAHME"
        pages["d#12"].identifiers = {"MASSNAHME": ["11.4 ACEF", "6.2A ACEF"]}
        assert prefilter.instance_conflict(a, b, pages) is None
        pages["d#12"].identifiers = {"STECKBRIEF": ["STAR"]}
        assert prefilter.instance_conflict(a, b, pages) is None

    def test_version_duplicate_requires_same_section(self) -> None:
        a = make_chunk_with_context(document_id="old", document_name="Prüfexemplar/01_EB.pdf", toc_path=["3", "3.1"])
        b = make_chunk_with_context(document_id="new", document_name="Auslegung/01_EB.pdf", toc_path=["3", "3.1"])
        assert prefilter.version_duplicate(a, b) is True
        b_other_section = b.model_copy(update={"toc_path": ["5"]})
        assert prefilter.version_duplicate(a, b_other_section) is False
        same_doc = b.model_copy(update={"document_id": "old"})
        assert prefilter.version_duplicate(a, same_doc) is False


class TestFilterAndMerge:
    def test_filter_hits_reports_reasons(self) -> None:
        ctx = {
            "ca": make_chunk_with_context(document_id="d", chunk_text="gleich", page_numbers=[1]),
            "cb": make_chunk_with_context(document_id="d", chunk_text="gleich", page_numbers=[2]),
            "cc": make_chunk_with_context(document_id="d", chunk_text="anders", page_numbers=[3]),
        }
        hits = [_hit("k1", "k2", "ca", "cb"), _hit("k1", "k3", "ca", "cc")]
        claim_to_chunk = {"k1": "ca", "k2": "cb", "k3": "cc"}
        result = prefilter.filter_hits(hits, claim_to_chunk, ctx, {"k1": "x", "k2": "y", "k3": "z"}, {})
        assert result.rejected == {"trivial": 1}
        assert [h.reference_id for h in result.kept] == ["k3"]

    def test_page_keys_for_hits_are_distinct(self) -> None:
        ctx = {
            "ca": make_chunk_with_context(document_id="d", page_numbers=[1]),
            "cb": make_chunk_with_context(document_id="d", page_numbers=[1]),
        }
        keys = prefilter.page_keys_for_hits([_hit("k1", "k2", "ca", "cb")], {"k1": "ca", "k2": "cb"}, ctx)
        assert [(k.document_id, k.page) for k in keys] == [("d", 1)]
