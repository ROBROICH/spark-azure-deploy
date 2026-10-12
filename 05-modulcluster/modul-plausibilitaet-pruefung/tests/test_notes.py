"""Unit tests for note building, verifier combination, consolidation and composition."""

from typing import Any

from src.activities import consolidation, evidence, note_verifier, notes
from src.activities.dms_activities import apply_project_confidence
from src.workflows.check_logic_wf.schemas.note_schemas import (
    ChunkContextLite,
    NoteScores,
    RubricLocation,
    RubricResponse,
    RubricScore,
    Verdict,
    WeightedVote,
)

from .conftest import make_inconsistency_pair

CAP_HARD_NEGATIVE = 40.0
CAP_WITHOUT_REFERENT = 75.0


def _ctx(document_id: str, text: str, name: str = "Auslegung/01_EB.pdf", page: int = 1) -> ChunkContextLite:
    return ChunkContextLite(
        document_id=document_id,
        document_name=name,
        chunk_text=text,
        preceding_text="davor",
        following_text="danach",
        page_numbers=[page],
        toc_path=["3"],
    )


def _note(excerpt_a: str, excerpt_b: str, name_b: str = "Auslegung/05_LBP.pdf") -> notes.Note:
    pair = make_inconsistency_pair(chunk_a_id="ca", chunk_b_id="cb", chunk_a_document_id="da", chunk_b_document_id="db")
    pair = pair.model_copy(update={"content_a_excerpt": excerpt_a, "content_b_excerpt": excerpt_b, "rating": 80})
    ctx = {"ca": _ctx("da", excerpt_a), "cb": _ctx("db", excerpt_b, name=name_b, page=7)}
    return notes.build_note("n1", [pair], ctx, {}, evidence.Corpus([]))


class TestBuildNote:
    def test_locations_anchor_and_signals(self) -> None:
        note = _note(
            "Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 580 m² nördlich der Bahnlinie.",
            "Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 430 m² nördlich der Bahnlinie.",
        )
        assert [f.anchor for f in note.locations] == ["exakt", "exakt"]
        assert [f.page for f in note.locations] == [1, 7]
        assert note.signals.same_id_conflict
        assert note.score_det == 70.0  # noqa: PLR2004
        assert note.gate_reason is None
        assert "Fassungsstatus aktuell" in note.evidence_block

    def test_duplicate_locations_are_collapsed(self) -> None:
        p1 = make_inconsistency_pair(chunk_a_id="ca", chunk_b_id="cb", claim_a_id="k1", claim_b_id="k2")
        p2 = make_inconsistency_pair(chunk_a_id="ca", chunk_b_id="cb", claim_a_id="k3", claim_b_id="k4")
        ctx = {"ca": _ctx("da", "Excerpt from chunk A"), "cb": _ctx("db", "Excerpt from chunk B")}
        note = notes.build_note("n", [p1, p2], ctx, {}, evidence.Corpus([]))
        assert len(note.locations) == 2  # noqa: PLR2004


class TestVerifierCombination:
    def _votes(self, *urteile: Verdict, esc: tuple[Verdict, ...] = ()) -> list[WeightedVote]:
        out = [WeightedVote(stage="basis", weight=1.0, urteil=u, kategorie="kein", grund="g") for u in urteile]
        out += [WeightedVote(stage="eskalation", weight=2.0, urteil=u, kategorie="kein", grund="g") for u in esc]
        return out

    def test_votes_move_score_symmetrically(self) -> None:
        note = _note(
            "Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 580 m² nördlich der Bahnlinie.",
            "Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 430 m² nördlich der Bahnlinie.",
        )
        assert note_verifier.score_a(note, self._votes("echt", "echt", "echt")) == 100.0  # noqa: PLR2004
        assert note_verifier.score_a(note, self._votes("falsch", "falsch", "falsch")) == 34.0  # noqa: PLR2004
        assert note_verifier.score_a(note, []) == note.score_det

    def test_escalation_rule_and_weight(self) -> None:
        assert note_verifier.needs_escalation(self._votes("echt", "unklar", "falsch"))
        assert not note_verifier.needs_escalation(self._votes("echt", "falsch", "falsch"))
        note = _note(
            "Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 580 m² nördlich der Bahnlinie.",
            "Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 430 m² nördlich der Bahnlinie.",
        )
        vetoed = note_verifier.score_a(note, self._votes("echt", "echt", "echt", esc=("falsch", "falsch")))
        assert vetoed < note.score_det

    def test_caps_without_referent_evidence_and_for_hard_negatives(self) -> None:
        no_ref = _note("Die Länge beträgt 4,2 km insgesamt.", "Die Gesamtlänge beträgt 4,6 km insgesamt.")
        assert not no_ref.signals.referent_evidence
        assert note_verifier.score_a(no_ref, self._votes("echt", "echt", "echt")) == CAP_WITHOUT_REFERENT
        hard = _note("GHU GHV XQG PLW 12", "GHU GHV XQG PLW 13")
        assert hard.signals.hard_negative
        assert note_verifier.skip_verifier(hard) is True
        assert note_verifier.score_a(hard, self._votes("echt", "echt", "echt")) <= CAP_HARD_NEGATIVE

    def test_fact_guard_neutralises_version_refutation(self) -> None:
        note = _note(
            "Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 580 m² nördlich der Bahnlinie.",
            "Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 430 m² nördlich der Bahnlinie.",
        )
        assert note.signals.within_version_pair
        v = WeightedVote(stage="basis", weight=1.0, urteil="falsch", kategorie="Fassung/Version", grund="g")
        assert note_verifier.vote_value(v, within_version_pair=True) == 0.5  # noqa: PLR2004
        assert note_verifier.vote_value(v, within_version_pair=False) == 0.0

    def test_payload_contains_locations_and_evidence(self) -> None:
        note = _note("Zitat A mit Inhalt", "Zitat B mit Inhalt")
        payload = note_verifier.verifier_payload(note)
        assert "## Fundstelle 1" in payload and "## Fundstelle 2" in payload
        assert "Deterministische Korpus-Evidenz" in payload


class TestConsolidation:
    @staticmethod
    def _rub(gegenstand: str, merkmal: str, values: tuple[str, str]) -> RubricResponse:
        return RubricResponse(
            stellen=[
                RubricLocation(rolle="sachaussage", gegenstand=gegenstand, merkmal=merkmal, wert=w, bezugsrahmen="")
                for w in values
            ],
            gleicher_gegenstand="ja",
            unvereinbar="ja",
            begruendung="",
        )

    @staticmethod
    def _bew(note_id: str, rub: RubricResponse | None) -> NoteScores:
        return NoteScores(
            note_id=note_id, score_a=50, score_b=86, rubric=rub, rubric_score=RubricScore(score=86, grund="")
        )

    def test_same_conflict_merges_across_different_locations(self) -> None:
        """Same object, attribute and value set -> one contradiction, even without a shared location."""
        n1 = _note("Neubau der Bundesstraße B 300n", "Neubau der Landesstraße L 300n")
        n2 = _note("Bundesstraße B 300n, Unterlage 9.1", "Landesstraße L 300n, Unterlage 17").model_copy(
            update={"note_id": "n2"}
        )
        bew = {
            "n1": self._bew("n1", self._rub("B 300n", "Straßenklasse", ("Bundesstraße", "Landesstraße"))),
            "n2": self._bew(
                "n2", self._rub("B 300n", "Klassifizierung der Straße", ("Bundesstraße B 300n", "Landesstraße L 300n"))
            ),
        }
        groups = consolidation.groups([n1, n2], bew)
        assert sorted(sorted(n.note_id for n in g) for g in groups) == [["n1", "n2"]]

    def test_shared_location_does_not_bridge_two_defects(self) -> None:
        """Same object, different attribute -> two contradictions although a location is shared."""
        n1 = _note("RRB 3 erhält ein Rückhaltevolumen von 1.900 m³", "Rückhaltevolumen 2.400 m³")
        n2 = _note("RRB 3 erhält ein Rückhaltevolumen von 1.900 m³", "entwässert in den Beispielbach").model_copy(
            update={"note_id": "n2"}
        )
        bew = {
            "n1": self._bew("n1", self._rub("RRB 3", "Rückhaltevolumen", ("1.900 m³", "2.400 m³"))),
            "n2": self._bew("n2", self._rub("RRB 3", "Vorfluter", ("Mustergraben", "Beispielbach"))),
        }
        groups = consolidation.groups([n1, n2], bew)
        assert sorted(sorted(n.note_id for n in g) for g in groups) == [["n1"], ["n2"]]

    def test_numeric_values_compare_by_quantity_and_same_attribute_joins_three_way_case(self) -> None:
        n1 = _note("6,2 km", "7,1 km")
        n2 = _note("6.200 m", "7,1 km").model_copy(update={"note_id": "n2"})
        n3 = _note("6,2 km", "9,6 km").model_copy(update={"note_id": "n3"})
        bew = {
            "n1": self._bew("n1", self._rub("Abschnitt 2", "Baulänge", ("6,2 km", "7,1 km"))),
            "n2": self._bew("n2", self._rub("Abschnitt 2", "Baulänge des Abschnitts", ("6.200 m", "7,1 km"))),
            "n3": self._bew("n3", self._rub("Abschnitt 2", "Baulänge", ("6,2 km", "9,6 km"))),
        }
        groups = consolidation.groups([n1, n2, n3], bew)
        assert sorted(sorted(n.note_id for n in g) for g in groups) == [["n1", "n2", "n3"]]

    def test_without_rubric_only_identical_evidence_merges(self) -> None:
        n1 = _note("Gemeinsames Zitat mit Zahl 12", "Anderes Zitat eins")
        n2 = _note("Gemeinsames Zitat mit Zahl 12", "Anderes Zitat eins").model_copy(update={"note_id": "n2"})
        n3 = _note("Gemeinsames Zitat mit Zahl 12", "Anderes Zitat zwei").model_copy(update={"note_id": "n3"})
        groups = consolidation.groups([n1, n2, n3], {})
        assert sorted(sorted(n.note_id for n in g) for g in groups) == [["n1", "n2"], ["n3"]]

    def test_project_wide_merges_same_conflict_across_documents_and_drops_conflict(self) -> None:
        """Aggregation: the same title-page defect reported from five documents becomes one entry."""

        def entry(i: int, doc: str) -> dict[str, Any]:
            return {
                "id": f"c{i}",
                "title": "Straßenklassifizierung",
                "description": "d",
                "rating": 80 + i,
                "score_a": 50.0,
                "score_b": 86.0,
                "evidence": [f"e{i}"],
                "merged_count": 1,
                "conflict": [
                    {"gegenstand": "B 300n", "merkmal": "Straßenklasse", "wert": "Bundesstraße"},
                    {"gegenstand": "B 300n", "merkmal": "Straßenklasse", "wert": "Landesstraße"},
                ],
                "status": "open",
                "occurrences": [
                    {
                        "document_id": doc,
                        "document_name": doc,
                        "content_excerpt": f"Bundesstraße {doc}",
                        "page_number": 1,
                    },
                    {"document_id": "U17", "document_name": "U17", "content_excerpt": "Landesstraße", "page_number": 1},
                ],
            }

        anderes = entry(9, "U13")
        anderes["conflict"] = [
            {"gegenstand": "RRB 3", "merkmal": "Vorfluter", "wert": "Mustergraben"},
            {"gegenstand": "RRB 3", "merkmal": "Vorfluter", "wert": "Beispielbach"},
        ]
        out = consolidation.project_wide(
            [entry(i, d) for i, d in enumerate(("U01", "U07-2", "U09-1", "U11", "U12"))] + [anderes]
        )
        assert len(out) == 2  # noqa: PLR2004
        gross = max(out, key=lambda c: c["merged_count"])
        assert gross["merged_count"] == 5  # noqa: PLR2004
        assert gross["rating"] == 84  # noqa: PLR2004
        assert len(gross["occurrences"]) == 6  # noqa: PLR2004 -- five title pages + the shared U17 location
        assert "Projektweit zusammengeführt aus 5" in gross["description"]
        assert all("conflict" not in c for c in out)

    def test_unevaluated_rubric_keeps_score_b_none(self) -> None:
        """A note B could not judge carries no B score; the confidence is A alone."""
        n1 = _note("Zitat eins mit Zahl 12", "Zitat zwei mit Zahl 14")
        bew = {
            "n1": NoteScores(
                note_id="n1",
                score_a=70,
                score_b=None,
                rubric_score=RubricScore(score=0, grund="Rubrik deaktiviert", evaluated=False),
            )
        }
        c = consolidation.compose([n1], bew, "id-1")
        assert (c.score_a, c.score_b) == (70, None)
        assert any(line.startswith("Rubrik/Bewertung: n/a") for line in c.evidence)
        out = apply_project_confidence([c.model_dump(mode="json", by_alias=True)])
        assert out[0]["confidenceScore"] == 70.0  # noqa: PLR2004

    def test_composition_inherits_maxima_and_merges_occurrences(self) -> None:
        n1 = _note("Gemeinsames Zitat mit Zahl 12", "Anderes Zitat eins")
        n2 = _note("Gemeinsames Zitat mit Zahl 12", "Anderes Zitat zwei").model_copy(
            update={"note_id": "n2", "title": "Besser"}
        )
        bew = {
            "n1": NoteScores(note_id="n1", score_a=40, score_b=20, rubric_score=RubricScore(score=20, grund="x")),
            "n2": NoteScores(
                note_id="n2",
                score_a=80,
                score_b=95,
                rubric_score=RubricScore(score=95, grund="Spitzenstufe", art="zahl"),
            ),
        }
        c = consolidation.compose([n1, n2], bew, "id-1")
        assert c.title == "Besser"
        assert (c.score_a, c.score_b, c.merged_count) == (80, 95, 2)
        assert len(c.occurrences) == 3  # noqa: PLR2004 -- shared location deduplicated
        assert "Zusammengeführt aus 2 Meldungen" in c.description
        assert any(line.startswith("Rubrik/Bewertung: 95") for line in c.evidence)
