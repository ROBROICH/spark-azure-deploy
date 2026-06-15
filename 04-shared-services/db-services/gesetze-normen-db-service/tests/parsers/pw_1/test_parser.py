"""Tests for the PwProcessor parsing logic."""

import json
from datetime import date

import pytest
from db_pipelines.constants import Bundesland
from db_pipelines.parsers.pw_1.processor import PwProcessor1, TitleEntry
from db_pipelines.schemas.db import DocType, Hierarchy, ParagraphTyp


@pytest.fixture
def mock_juris_parser() -> PwProcessor1:
    """Helper to create a mock parser instance."""
    return PwProcessor1(
        "testG",
        DocType.GESETZ,
        hierarchy=Hierarchy.BUNDESLAND,
        portal_id="bstest",
        bundesland=Bundesland.MV,
        base_url="https://test.test",
        base_path="tests/data/",
    )


@pytest.mark.parametrize(
    "bundesland, titel, jurabk, expected",
    [
        (
            Bundesland.BW, 
            "Gesetz zur Ausführung des Bundes-Bodenschutzgesetzes (Landes-Bodenschutz- und Altlastengesetz - LBodSchAG) Vom 14. Dezember 2004 *'",
            "LBodSchAG",
            TitleEntry(
                langue="Gesetz zur Ausführung des Bundes-Bodenschutzgesetzes", 
                kurzue="Landes-Bodenschutz- und Altlastengesetz",
                ausfertigung_datum=date(2004, 12, 14)
            )
        ),
        (
            Bundesland.MV, 
            "Gesetz über den Schutz des Bodens im Land Mecklenburg-Vorpommern (Landesbodenschutzgesetz - LBodSchG M-V) 4. Juli 2011 *",
            "LBodSchG",
            TitleEntry(
                langue="Gesetz über den Schutz des Bodens im Land Mecklenburg-Vorpommern", 
                kurzue="Landesbodenschutzgesetz",
                ausfertigung_datum=date(2011, 7, 4)
            )
        ),
        (
            Bundesland.BW,
            "Waldgesetz für Baden-Württemberg (Landeswaldgesetz - LWaldG) in der Fassung vom 31. August 1995",
            "LWaldG",
            TitleEntry(
                langue="Waldgesetz für Baden-Württemberg",
                kurzue="Landeswaldgesetz",
                ausfertigung_datum=date(1995, 8, 31)
            )
        ),
        (
            Bundesland.HH,
            "Hamburgisches Jagdgesetz Vom 22. Mai 1978",
            "JagdG Hmb",
            TitleEntry(
                langue="Hamburgisches Jagdgesetz",
                kurzue="Hamburgisches Jagdgesetz",
                ausfertigung_datum=date(1978, 5, 22)
            )
        ),
        (
            Bundesland.SH,
            "Gesetz zum Schutz der Denkmale (Denkmalschutzgesetz) Vom 30. Dezember 2014",
            "DSchG SH",
            TitleEntry(
                langue="Gesetz zum Schutz der Denkmale",
                kurzue="Denkmalschutzgesetz",
                ausfertigung_datum=date(2014, 12, 30)
            )
        )
    ]
)
def test_title_parsing(bundesland, titel, jurabk, expected):
    """should parse title into components correctly"""
    processor = PwProcessor1("testG", DocType.GESETZ, hierarchy=Hierarchy.BUNDESLAND, base_url="https://parser.test", base_path="tests/data/", portal_id="bstest", bundesland=bundesland)
    title_entry = processor._parse_full_title(titel, jurabk)
    assert title_entry.langue == expected.langue
    assert title_entry.kurzue == expected.kurzue
    assert title_entry.ausfertigung_datum.isoformat() == expected.ausfertigung_datum.isoformat()



def test_juris_parse_anlage_and_eingangsformel(mock_juris_parser: PwProcessor1):
    doc = mock_juris_parser._parse_doc()

    assert len(doc.anlagen) == 0
    assert doc.eingangsformel is None


def test_juris_parse_toc(mock_juris_parser: PwProcessor1):
    doc = mock_juris_parser._parse_doc()

    assert doc.toc is not None
    assert len(doc.toc) == 2

    toc_p1 = next(t for t in doc.toc if t.paragraph_nr == "1")
    assert toc_p1.gliederungstitel == "Erster Abschnitt Allgemeine Vorschriften"
    assert toc_p1.text == "Grammatikalische Sätze"
    assert toc_p1.paragraph_typ == ParagraphTyp.SINGLE


def test_juris_parse_ivz_logic():
    ivz_html = """
    <div>
        <a href="/document/jlr-TESTG1/format/xsl">Abschnitt 1</a>
        <a href="/document/jlr-TESTP1/format/xsl">§ 1 Title</a>
        <a href="/document/jlr-TESTAnlage/format/xsl">Anlage 1</a>
        <a href="/document/jlr-TESTpELS/format/xsl">Eingangsformel</a>
    </div>
    """
    entries = PwProcessor1._parse_ivz(ivz_html)
    
    kinds = [e.kind for e in entries]
    assert "section" in kinds
    assert "norm" in kinds
    assert "anlage" in kinds
    assert "eingangsformel" in kinds
    
    section = next(e for e in entries if e.kind == "section")
    assert section.doc_id == "jlr-TESTG1"
    
    norm = next(e for e in entries if e.kind == "norm")
    assert norm.section_label == "Abschnitt 1" # Check breadcrumb propagation
