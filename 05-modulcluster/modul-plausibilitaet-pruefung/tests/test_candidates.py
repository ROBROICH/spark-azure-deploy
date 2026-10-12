"""Unit tests for the deterministic candidate sources: detector, overflow test, cross-references."""

from src.activities import candidates as k

from .conftest import make_chunk_payload, make_claim_payload

SATZ_A = "Die Baustrecke der B 101 hat eine Länge von insgesamt 884 m und wird vierstreifig ausgebaut."
SATZ_B = "Die Baustrecke der B 101 hat eine Länge von insgesamt 730 m und wird vierstreifig ausgebaut."


class TestDetector:
    def test_repeated_sentence_with_outdated_value(self) -> None:
        chunks = [
            make_chunk_payload(
                chunk_id="c1",
                document_id="d",
                chunk_content=f"Kapitel 4.3.7. {SATZ_A} Weiter im Text.",
                toc_path=["4.3.7"],
            ),
            make_chunk_payload(
                chunk_id="c2",
                document_id="d",
                chunk_content=f"Kapitel 4.3.8. {SATZ_B} Weiter im Text.",
                toc_path=["4.3.8"],
            ),
        ]
        reps = k.find_repetitions(chunks)
        assert len(reps) == 1
        assert sorted(reps[0].differences[0]) == ["730", "884"]  # order follows the sorted number signature
        assert "gegen" in reps[0].note

    def test_template_lines_and_different_identifiers_are_ignored(self) -> None:
        # three occurrences -> template line
        chunks = [
            make_chunk_payload(
                chunk_id=f"c{i}",
                document_id="d",
                chunk_content=f"Die Fläche der Maßnahme beträgt insgesamt {n} m² im Bereich.",
            )
            for i, n in enumerate((100, 200, 300))
        ]
        assert k.find_repetitions(chunks) == []
        # different structure identifiers in the window -> template instance
        chunks = [
            make_chunk_payload(
                chunk_id="a",
                document_id="d",
                chunk_content="Bauwerk BW 3-03. Die lichte Weite des Bauwerks beträgt insgesamt 12,50 m über Gelände.",
            ),
            make_chunk_payload(
                chunk_id="b",
                document_id="d",
                chunk_content="Bauwerk BW 3-11. Die lichte Weite des Bauwerks beträgt insgesamt 14,00 m über Gelände.",
            ),
        ]
        assert k.find_repetitions(chunks) == []

    def test_hits_need_a_covering_claim(self) -> None:
        chunks = [
            make_chunk_payload(chunk_id="c1", document_id="d", chunk_content=SATZ_A),
            make_chunk_payload(chunk_id="c2", document_id="d", chunk_content=SATZ_B),
        ]
        reps = k.find_repetitions(chunks)
        claims = {
            "c1": [
                make_claim_payload(claim_id="k1", chunk_id="c1", claim_text="Die Baustrecke der B 101 ist 884 m lang.")
            ],
            "c2": [
                make_claim_payload(claim_id="k2", chunk_id="c2", claim_text="Die Baustrecke der B 101 ist 730 m lang.")
            ],
        }
        hits = k.hits_from_repetitions(reps, claims)
        assert [({h.claim_id, h.reference_id}, h.rating) for h in hits] == [({"k1", "k2"}, 100)]
        assert k.hits_from_repetitions(reps, {"c1": claims["c1"]}) == []


class TestOverflow:
    def test_near_duplicates_with_different_numbers_become_hits(self) -> None:
        a = make_claim_payload(claim_id="a", claim_text="Die Gesamtfläche des Plangebiets beträgt 4,5 ha.")
        b = make_claim_payload(claim_id="b", claim_text="Die Gesamtfläche des Plangebiets beträgt 3,8 ha.")
        same = make_claim_payload(claim_id="c", claim_text="Die Gesamtfläche des Plangebiets beträgt 4,5 ha.")
        hits = k.hits_from_overflow([(a, b), (a, same)])
        assert [(h.claim_id, h.reference_id) for h in hits] == [("a", "b")]
        assert "4,5 gegen 3,8" in hits[0].note


class TestCrossReferences:
    def test_finds_references_in_sentences_with_numbers(self) -> None:
        text = "Die Belastungsklasse der B 202 beträgt Bk 3,2 (siehe Unterlage 14.1). Weitere Hinweise siehe Kap. 4.3.7 ohne Zahl."
        v = k.find_cross_references(text)
        assert [(x.kind, x.number) for x in v] == [("unterlage", "14.1")]

    def test_target_documents_by_path_segment(self) -> None:
        titles = {
            "self": "Auslegung/01_Erlaeuterungsbericht/01-01_EB.pdf",
            "t1": "Auslegung/14_Regelungsverzeichnis/14_1-01_Regelungsverzeichnis.pdf",
            "t2": "Auslegung/14_Regelungsverzeichnis/14_10-01_Anhang.pdf",
        }
        v = k.CrossReference("unterlage", "14.1", "…")
        assert k.target_document_ids(v, "self", titles) == ["t1"]
        assert k.target_document_ids(k.CrossReference("kapitel", "4.3", "…"), "self", titles) == ["self"]


class TestNumberSets:
    def test_paraphrase_with_different_quantities(self) -> None:
        a = "Die vier Untersuchungsflächen mit Lebensraumeignung haben zusammen etwa 700 Hektar."
        b = "Die sieben Untersuchungsflächen mit Lebensraumeignung haben zusammen eine Gesamtgröße von 820 Hektar."
        assert k.number_sets_differ(a, b) == [("4", "7"), ("700", "820")]

    def test_notation_and_articles_are_no_difference(self) -> None:
        assert (
            k.number_sets_differ("Mindestabstand von 1.100 m zur Anlage.", "Mindestabstand von 1 100 m zur Anlage.")
            is None
        )
        assert (
            k.number_sets_differ("Eine Anlage mit 50 Plätzen ist geplant.", "Die Anlage mit 50 Plätzen ist geplant.")
            is None
        )

    def test_unrelated_sentences_are_rejected_despite_numbers(self) -> None:
        assert (
            k.number_sets_differ(
                "Abschnitt 3 erstreckt sich von Musterdorf (L 111) bis Beispielstadt (B 77).",
                "Die Untersuchung der Greifvögel wurde im Jahr 2011 durchgeführt.",
            )
            is None
        )
