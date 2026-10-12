"""Unit tests for the deterministic evidence of the verification."""

from src.activities import evidence
from src.workflows.check_logic_wf.schemas.note_schemas import EvidenceLocation

HIGH_ANCHOR_FAIL = 0.99
SCORE_SAME_ID = 70.0  # base 50 + 20 for a copied sentence with shared identifier


def _f(
    excerpt: str,
    chunk_text: str | None = None,
    document_name: str = "Auslegung/01_EB.pdf",
    anchor: str | None = None,
    prev_text: str = "",
) -> EvidenceLocation:
    chunk = chunk_text if chunk_text is not None else excerpt
    return EvidenceLocation(
        chunk_id="c",
        document_id=document_name,
        document_name=document_name,
        page=1,
        excerpt=excerpt,
        anchor=anchor or evidence.anchor_kind(excerpt, chunk),  # pyrefly: ignore[bad-argument-type]
        chunk_text=chunk,
        chunk_is_ai_text=evidence.is_ai_text(chunk),
        prev_text=prev_text,
    )


class TestAnchoring:
    def test_anchor_kinds(self) -> None:
        chunk = "Die lichte Weite des Brückenbauwerks BW 3-03 beträgt 12,50 m über der Gradiente."
        assert evidence.anchor_kind("lichte Weite des Brückenbauwerks BW 3-03 beträgt 12,50 m", chunk) == "exakt"
        assert (
            evidence.anchor_kind("Die lichte Weite des Brückenbauwerks BW 3-03 beträgt 12,50 m und mehr", chunk)
            == "teilweise"
        )
        assert evidence.anchor_kind("völlig anderer Text ohne Bezug zum Chunk", chunk) == "fehlt"
        assert evidence.anchor_kind("", chunk) == "fehlt"

    def test_ids_and_skeleton(self) -> None:
        assert evidence.ids("Bauwerk BW 3-03 mit RQ 31") == {"BW 3-03"}  # RQ is a type, not an identity
        assert evidence.skeleton("Länge 12,5 m und 300 Stück") == evidence.skeleton("Länge 13,0 m und 299 Stück")


class TestSignals:
    def test_copied_sentence_with_same_id_is_positive_evidence(self) -> None:
        fs = [
            _f("Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 580 m² nördlich der Bahnlinie."),
            _f(
                "Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 430 m² nördlich der Bahnlinie.",
                document_name="Auslegung/19_ASB.pdf",
            ),
        ]
        s = evidence.signals_for_note(fs)
        assert s.id_shared and s.same_id_conflict and s.numeric_conflict_same_id
        assert not s.hard_negative
        assert s.referent_evidence
        assert evidence.deterministic_score(s) == SCORE_SAME_ID

    def test_template_instances_with_different_ids_are_capped(self) -> None:
        fs = [
            _f("Für das Bauwerk BW 3-03 ergibt sich eine Auftriebskraft von 558,60 kN im Lastfall."),
            _f("Für das Bauwerk BW 3-11 ergibt sich eine Auftriebskraft von 642,39 kN im Lastfall."),
        ]
        s = evidence.signals_for_note(fs)
        assert s.id_mismatch and s.template_serial and s.hard_negative
        assert evidence.deterministic_score(s) <= 25.0  # noqa: PLR2004

    def test_mojibake_is_measured_on_the_excerpt(self) -> None:
        clean = "Die Rodung erfolgt im Zeitraum vom 1. Oktober bis 28. Februar für Maßnahme V 11."
        fs = [_f(clean, chunk_text=clean + " GHU GHV XQG"), _f(clean.replace("Oktober", "November"))]
        assert evidence.signals_for_note(fs).mojibake is False
        fs_bad = [_f("GHU GHV XQG PLW 12"), _f("GHU GHV XQG PLW 13")]
        assert evidence.signals_for_note(fs_bad).mojibake is True

    def test_version_artefact_cap_and_rescue(self) -> None:
        alt = "2 E.A._Prüfexemplar/01_EB.pdf"
        neu = "Auslegung/01_EB.pdf"
        fs = [
            _f("Die Baustrecke der B 101 hat eine Länge von 4,2 km.", document_name=alt),
            _f("Die Baustrecke der B 101 hat eine Länge von 4,6 km.", document_name=neu),
        ]
        s = evidence.signals_for_note(fs)
        assert s.version_pair and not s.within_version_pair and s.version_artefact
        assert evidence.deterministic_score(s) <= 20.0  # noqa: PLR2004
        rescued = evidence.signals_for_note(fs, wording_also_current=True)
        assert not rescued.version_artefact and not rescued.hard_negative

    def test_status_conflict_with_shared_id(self) -> None:
        fs = [
            _f("Die Maßnahme A 9 wird wie geplant umgesetzt und dient dem Artenschutz."),
            _f("Die Maßnahme A 9 entfällt, da die Fläche nicht mehr zur Verfügung steht."),
        ]
        s = evidence.signals_for_note(fs)
        assert s.status_conflict and s.status_exception

    def test_anchor_failure_penalises(self) -> None:
        fs = [
            _f("a b c d e f g", chunk_text="völlig anders", anchor="fehlt"),
            _f("x y z 1 2 3", chunk_text="anders", anchor="fehlt"),
        ]
        s = evidence.signals_for_note(fs)
        assert s.anchor_fail_share >= HIGH_ANCHOR_FAIL
        assert evidence.deterministic_score(s) == 30.0  # noqa: PLR2004


class TestCorpus:
    def _corpus(self) -> evidence.Corpus:
        return evidence.Corpus(
            [
                evidence.CorpusChunk(
                    "Auslegung/01_EB.pdf", (12,), "Die Baustrecke der B 101 hat eine Länge von 4,2 km."
                ),
                evidence.CorpusChunk(
                    "Auslegung/05_LBP.pdf", (3,), "Die Baustrecke der B 101 hat eine Länge von 4,6 km."
                ),
                evidence.CorpusChunk(
                    "Prüfexemplar/01_EB.pdf", (12,), "Die Baustrecke der B 101 hat eine Länge von 4,2 km."
                ),
            ]
        )

    def test_wording_in_current_edition(self) -> None:
        k = self._corpus()
        ja, beleg = k.wording_in_current_edition("Die Baustrecke der B 101 hat eine Länge von 4,2 km.")
        assert ja is True and beleg == "01_EB.pdf"
        nein, _ = k.wording_in_current_edition("Die Baustrecke der B 101 hat eine Länge von 9,9 km.")
        assert nein is False

    def test_third_party_source_in_small_project(self) -> None:
        k = evidence.Corpus(
            [
                evidence.CorpusChunk("a.pdf", (1,), "Das RRB 3 erhält ein Rückhaltevolumen von 1.900 m³."),
                evidence.CorpusChunk("b.pdf", (1,), "Das RRB 3 erhält ein Rückhaltevolumen von 2.400 m³."),
                evidence.CorpusChunk("c.pdf", (1,), "Im Lageplan ist das RRB 3 mit 1.900 m³ eingetragen."),
            ]
        )
        fs = [
            _f("Das RRB 3 erhält ein Rückhaltevolumen von 1.900 m³.", document_name="a.pdf"),
            _f("Das RRB 3 erhält ein Rückhaltevolumen von 2.400 m³.", document_name="b.pdf"),
        ]
        assert "Drittquelle zu geteilter Kennung: [c.pdf" in evidence.evidence_block_for(fs, k)

    def test_evidence_block_mentions_version_status_and_value_support(self) -> None:
        k = self._corpus()
        fs = [_f("Die Baustrecke der B 101 hat eine Länge von 4,2 km.", document_name="Prüfexemplar/01_EB.pdf")]
        block = evidence.evidence_block_for(fs, k)
        assert "ÜBERHOLT" in block
        assert "AUCH in aktueller Quelle" in block
        assert "Wert-Support" in block
