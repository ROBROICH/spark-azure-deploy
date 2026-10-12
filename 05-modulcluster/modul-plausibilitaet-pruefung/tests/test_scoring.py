"""Unit tests for the deterministic scoring of the rubric."""

from src.activities import scoring as b
from src.workflows.check_logic_wf.schemas.note_schemas import (
    EvidenceLocation,
    PageContext,
    RubricLocation,
    RubricResponse,
)

TOP_NUMERIC = 95
TOP_QUALITATIVE = 86
CAP_NON_TOP = 74


def _st(gegenstand: str, merkmal: str, wert: str, rolle: str = "sachaussage", rahmen: str = "") -> RubricLocation:
    return RubricLocation(rolle=rolle, gegenstand=gegenstand, merkmal=merkmal, wert=wert, bezugsrahmen=rahmen)


def _fs(n: int = 2) -> list[EvidenceLocation]:
    return [
        EvidenceLocation(
            chunk_id=f"c{i}",
            document_id=f"d{i}",
            document_name=f"Auslegung/d{i}.pdf",
            page=i,
            excerpt=f"Zitat {i} mit Inhalt",
            anchor="exakt",
        )
        for i in range(n)
    ]


class TestNumbers:
    def test_ranges_and_dates_compare_all_quantities(self) -> None:
        assert b.numeric_conflict(["06:00 - 20:00 Uhr", "6.00 - 22.00 Uhr"]) is True  # plain numbers, no time parsing
        assert b.numeric_conflict(["4.70 m", "5.10 m"]) is True  # decimal point is not a clock time
        assert b.numeric_conflict(["12.50 m", "12,50 m"]) is False
        assert b.numeric_conflict(["1.100 m", "1100 m"]) is False
        assert b.numeric_conflict(["nach dem 30. September", "nach dem 31. Oktober"]) is True
        assert b.numeric_conflict(["Baubeginn 01.03.2024", "Baubeginn 01.03.2025"]) is True
        assert b.numeric_conflict(["Stand 14.03.2025", "Stand 14.03.25"]) is False
        assert b.numeric_conflict(["2005", "2006"]) is True
        assert b.numeric_conflict(["ca. 4,5 ha", "45000 m²"]) is False
        assert b.numeric_conflict(["keine Zahl", "12"]) is None
        assert b.numeric_conflict(["sechs Nistkästen", "vier Nistkästen"]) is True

    def test_legacy_first_number_comparison(self) -> None:
        assert (
            b.numeric_conflict_legacy(["2005", "2006"]) is False
        )  # tolerance: the documented defect, kept below the top tier
        assert b.numeric_conflict_legacy(["50 km", "30 km"]) is True


class TestPairScore:
    def test_numeric_conflict_same_object_hits_top_tier(self) -> None:
        v = RubricResponse(
            stellen=[
                _st("Maßnahme A 4.3 CEF", "Fläche Gehölzsaum", "ca. 580 m²"),
                _st("Maßnahme A 4.3 CEF", "Fläche Gehölzsaum", "ca. 430 m²"),
            ],
            gleicher_gegenstand="ja",
            unvereinbar="ja",
            begruendung="",
        )
        res = b.score_note(v, _fs(), {})
        assert res.score == TOP_NUMERIC and res.art == "zahl"

    def test_qualitative_conflict(self) -> None:
        v = RubricResponse(
            stellen=[
                _st("Maßnahme A 9", "Umsetzung", "wird durchgeführt"),
                _st("Maßnahme A 9", "Umsetzung", "entfällt"),
            ],
            gleicher_gegenstand="ja",
            unvereinbar="ja",
            begruendung="",
        )
        res = b.score_note(v, _fs(), {})
        assert res.score == TOP_QUALITATIVE and res.art == "qualitativ"

    def test_different_objects_stay_low(self) -> None:
        v = RubricResponse(
            stellen=[_st("Steckbrief Hohltaube", "Brutpaare", "3"), _st("Steckbrief Star", "Brutpaare", "2")],
            gleicher_gegenstand="nein",
            unvereinbar="ja",
            begruendung="",
        )
        res = b.score_note(v, _fs(), {})
        assert res.score <= CAP_NON_TOP
        assert res.art is None

    def test_asymmetric_frame_blocks_qualitative_top(self) -> None:
        v = RubricResponse(
            stellen=[
                _st("Maßnahme A 9", "Umsetzung", "wird durchgeführt", rahmen="baubedingt"),
                _st("Maßnahme A 9", "Umsetzung", "entfällt"),
            ],
            gleicher_gegenstand="ja",
            unvereinbar="ja",
            begruendung="",
        )
        assert b.score_note(v, _fs(), {}).score < TOP_QUALITATIVE

    def test_instance_conflict_from_pages_excludes_pair(self) -> None:
        v = RubricResponse(
            stellen=[_st("Maßnahme", "Dornensträucher", "15 %"), _st("Maßnahme", "Dornensträucher", "10 %")],
            gleicher_gegenstand="ja",
            unvereinbar="ja",
            begruendung="",
        )
        fs = _fs()
        pages = {
            "d0#0": PageContext(document_id="d0", page=0, text="", identifiers={"MASSNAHME": ["6.2A ACEF"]}),
            "d1#1": PageContext(document_id="d1", page=1, text="", identifiers={"MASSNAHME": ["11.4 ACEF"]}),
        }
        assert b.score_note(v, fs, pages).grund == "keine Belegpaare"
        assert b.score_note(v, fs, {}).score == TOP_NUMERIC

    def test_failed_or_short_extraction(self) -> None:
        assert b.score_note(None, _fs(), {}).score == 50  # noqa: PLR2004
        one = RubricResponse(stellen=[_st("x", "y", "1")], gleicher_gegenstand="ja", unvereinbar="ja", begruendung="")
        assert b.score_note(one, _fs(), {}).score == 30  # noqa: PLR2004


class TestGate:
    def test_same_page_with_different_text_is_not_trivial(self) -> None:
        """Page-internal pairs are real evidence pairs ('Bewegungsjagden' on one page)."""
        fs = _fs()
        fs[1].document_id, fs[1].page = fs[0].document_id, fs[0].page
        assert b.trivial_pair(fs[0], fs[1]) is False
        fs[1].excerpt = fs[0].excerpt
        assert b.trivial_pair(fs[0], fs[1]) is True

    def test_identical_quotes(self) -> None:
        fs = _fs()
        fs[1].excerpt = fs[0].excerpt
        assert b.gate_reason(fs) == "identische-zitate"

    def test_mojibake(self) -> None:
        fs = _fs()
        fs[0].excerpt = "GHU GHV XQG Text"
        assert b.gate_reason(fs) == "zeichensalat"
        assert b.gate_reason(_fs()) is None

    def test_notation_artefact(self) -> None:
        fs = _fs()
        fs[0].excerpt = "Die Fläche beträgt 1.500 m²"
        fs[1].excerpt = "Die Fläche beträgt 1500 m²"
        assert b.gate_reason(fs) == "notationsartefakt"


class TestPairFilters:
    def test_version_duplicate_strict_vs_loose(self) -> None:
        a = EvidenceLocation(
            chunk_id="a",
            document_id="old",
            document_name="Prüfexemplar/01_EB.pdf",
            page=59,
            excerpt="x",
            anchor="exakt",
            toc_path=["3"],
        )
        c = EvidenceLocation(
            chunk_id="c",
            document_id="new",
            document_name="Auslegung/01_EB.pdf",
            page=96,
            excerpt="y",
            anchor="exakt",
            toc_path=["5"],
        )
        assert b.version_duplicate(a, c) is True
