"""Tests for the generic JSON parser."""

import json

from db_pipelines.constants import Bundesland
from db_pipelines.parsers.json_1 import JsonProcessor1
from db_pipelines.schemas.db import DocType, Hierarchy
from httpx import Response

OVERVIEW_DATA = {
    "type": "data",
    "nodes": [
        {"type": "data", "data": [], "uses": {}},
        {
            "type": "data",
            "data": [
                {"views": 1},
                [2],
                {"buch": 3},
                {"id": 4, "abkuerzung": 5},
                "buch-1",
                "HWaldG",
            ],
            "uses": {},
        },
    ],
}


BOOK_PAYLOAD = {
    "buch": {
        "id": "buch-1",
        "abkuerzung": "HWaldG",
        "kurztitel": "Hessisches Waldgesetz",
        "titel": "Hessisches Waldgesetz (HWaldG) Vom 27. Juni 2013",
        "content": "zuletzt geändert durch Gesetz vom 22. Februar 2022",
        "source_url": "https://example.invalid/hwaldg",
        "land": "HE",
        "update_time": "2026-01-08T14:12:37.681994+00:00",
    },
    "abschnitte": [
        {
            "id": "teil-1",
            "bezeichnung": "ERSTER TEIL",
            "titel": "Allgemeines",
            "parent_id": None,
            "order_index": 0,
            "land": "HE",
            "buch_id": "buch-1",
        }
    ],
    "normen": [
        {
            "id": "norm-1",
            "bezeichnung": "§ 1",
            "titel": "Ziele",
            "content": (
                "(1) Ziel des Gesetzes ist es:\n\n"
                "1. den Wald zu schützen.\n\n"
                "2. den Wald zu erhalten.\n\n"
                "(2) Die Ziele sind zu verwirklichen.\n\n"
                "Dabei gilt:\n\n"
                "1. nachhaltig."
            ),
            "content_json": [
                {
                    "id": "0",
                    "type": "Abschnitt",
                    "abschnittNr": "(1)",
                    "abschnittType": "Absatz",
                    "children": [
                        {
                            "id": "1",
                            "type": "Satz",
                            "satzNr": 1,
                            "children": [
                                {
                                    "id": "2",
                                    "type": "Text",
                                    "parts": [
                                        {
                                            "type": "Text",
                                            "content": "Ziel des Gesetzes ist es:",
                                        }
                                    ],
                                    "children": [],
                                },
                                {
                                    "id": "3",
                                    "type": "Abschnitt",
                                    "abschnittNr": "1.",
                                    "abschnittType": "Nummer",
                                    "children": [
                                        {
                                            "id": "4",
                                            "type": "Text",
                                            "parts": [
                                                {
                                                    "type": "Text",
                                                    "content": " den Wald zu schützen.",
                                                }
                                            ],
                                            "children": [],
                                        }
                                    ],
                                },
                                {
                                    "id": "5",
                                    "type": "Abschnitt",
                                    "abschnittNr": "2.",
                                    "abschnittType": "Nummer",
                                    "children": [
                                        {
                                            "id": "6",
                                            "type": "Text",
                                            "parts": [
                                                {
                                                    "type": "Text",
                                                    "content": " den Wald zu erhalten.",
                                                }
                                            ],
                                            "children": [],
                                        }
                                    ],
                                },
                            ],
                        }
                    ],
                    "buch_id": "buch-1",
                    "land": "HE",
                },
                {
                    "id": "7",
                    "type": "Abschnitt",
                    "abschnittNr": "(2)",
                    "abschnittType": "Absatz",
                    "children": [
                        {
                            "id": "8",
                            "type": "Satz",
                            "satzNr": 1,
                            "children": [
                                {
                                    "id": "9",
                                    "type": "Text",
                                    "parts": [
                                        {
                                            "type": "Text",
                                            "content": "Die Ziele sind zu verwirklichen.",
                                        }
                                    ],
                                    "children": [],
                                }
                            ],
                        },
                        {
                            "id": "10",
                            "type": "Satz",
                            "satzNr": 2,
                            "children": [
                                {
                                    "id": "11",
                                    "type": "Text",
                                    "parts": [
                                        {"type": "Text", "content": "Dabei gilt:"}
                                    ],
                                    "children": [],
                                },
                                {
                                    "id": "12",
                                    "type": "Abschnitt",
                                    "abschnittNr": "1.",
                                    "abschnittType": "Nummer",
                                    "children": [
                                        {
                                            "id": "13",
                                            "type": "Text",
                                            "parts": [
                                                {
                                                    "type": "Text",
                                                    "content": " nachhaltig.",
                                                }
                                            ],
                                            "children": [],
                                        }
                                    ],
                                },
                            ],
                        },
                    ],
                    "buch_id": "buch-1",
                    "land": "HE",
                },
            ],
            "order_index": 1,
            "buch_id": "buch-1",
            "abschnitt_id": "teil-1",
            "land": "HE",
        },
        {
            "id": "norm-2",
            "bezeichnung": "§ 12a",
            "titel": "Ergänzung",
            "content": "Eine ergänzende Regel.",
            "content_json": [
                {
                    "id": "0",
                    "type": "Satz",
                    "satzNr": 1,
                    "children": [
                        {
                            "id": "1",
                            "type": "Text",
                            "parts": [
                                {
                                    "type": "Text",
                                    "content": "Eine ergänzende Regel.",
                                }
                            ],
                            "children": [],
                        }
                    ],
                }
            ],
            "order_index": 2,
            "buch_id": "buch-1",
            "abschnitt_id": "teil-1",
            "land": "HE",
        },
        {
            "id": "anlage-1",
            "bezeichnung": "Anlage",
            "titel": "Verzeichnis",
            "content": "1. Eintrag A\n2. Eintrag B",
            "content_json": [],
            "order_index": 3,
            "buch_id": "buch-1",
            "abschnitt_id": None,
            "land": "HE",
        },
    ],
}


def test_fetch_doc_reads_buch_id_from_overview_and_stores_book_payload(
    tmp_path, respx_mock
):
    respx_mock.get("https://parser.test/HE/HWaldG/data.json").mock(
        return_value=Response(200, json=OVERVIEW_DATA)
    )
    respx_mock.get("https://parser.test/api/book?id=buch-1&t=0").mock(
        return_value=Response(200, json=BOOK_PAYLOAD)
    )

    parser = JsonProcessor1(
        "HWaldG",
        DocType.GESETZ,
        hierarchy=Hierarchy.BUNDESLAND,
        bundesland=Bundesland.HE,
        base_url="https://parser.test",
        base_path=tmp_path,
        headers={"User-Agent": "test-agent"},
        book_endpoint="/api/book",
        overview_data_suffix="data.json",
    )

    parser.fetch_doc()

    stored_payload = json.loads(
        (parser.norm_dir / "HWaldG.json").read_text(encoding="utf-8")
    )
    assert stored_payload == BOOK_PAYLOAD


def test_parse_doc_maps_norms_absaetze_and_anlage():
    parser = JsonProcessor1(
        "HWaldG",
        DocType.GESETZ,
        hierarchy=Hierarchy.BUNDESLAND,
        bundesland=Bundesland.HE,
        base_url="https://parser.test",
        headers={"User-Agent": "test-agent"},
        base_path="downloads",
    )

    document = parser._parse_doc(BOOK_PAYLOAD)

    assert document.jurabk == "HWaldG"
    assert document.langue == "Hessisches Waldgesetz (HWaldG) Vom 27. Juni 2013"
    assert len(document.normen) == 2
    assert len(document.anlagen) == 1

    first_norm = document.normen[0]
    assert first_norm.paragraph_nr == 1
    assert first_norm.sub_paragraph_nr == ""
    assert [absatz.absatz_nr for absatz in first_norm.absaetze] == ["1", "2"]
    assert "1. den Wald zu schützen." in first_norm.absaetze[0].absatz_text
    assert "Dabei gilt:" in first_norm.absaetze[1].absatz_text

    second_norm = document.normen[1]
    assert second_norm.paragraph_nr == 12
    assert second_norm.sub_paragraph_nr == "a"
    assert second_norm.absaetze[0].absatz_text == "Eine ergänzende Regel."

    assert document.anlagen[0].title == "Anlage – Verzeichnis"
    assert any(entry.paragraph_nr == "12a" for entry in document.toc)


def _footnote_node(text):
    return {
        "type": "Paratext",
        "titel": "Fußnote",
        "children": [{"type": "Text", "parts": [{"content": text}]}],
    }


def test_fussnoten_ids_globally_unique():
    """Footnote.id_ is the table primary key. the source provides no source id,
    so it must be namespaced per norm — a bare per-norm sequence collides across
    norms and laws and cannot be written to the DB."""
    parser = JsonProcessor1(
        slug="HWaldG",
        doctype=DocType.GESETZ,
        hierarchy=Hierarchy.BUNDESLAND,
        bundesland=Bundesland.HE,
        base_url="https://parser.test",
        base_path="downloads",
        headers={"User-Agent": "test-agent"},
    )

    # two footnotes in one norm + a footnote in another norm, all of which would
    # otherwise be id_ "1" (and "2")
    fns_p1 = parser._extract_fussnoten(
        [_footnote_node("erste Fußnote"), _footnote_node("zweite Fußnote")],
        jurabk="HWaldG",
        paragraph_nr=1,
        sub_paragraph_nr="",
    )
    fns_p12a = parser._extract_fussnoten(
        [_footnote_node("dritte Fußnote")],
        jurabk="HWaldG",
        paragraph_nr=12,
        sub_paragraph_nr="a",
    )

    ids = [fn.id_ for fn in fns_p1 + fns_p12a]
    assert ids == ["HWaldG_1_1", "HWaldG_1_2", "HWaldG_12a_1"]
    # every primary key is unique
    assert len(ids) == len(set(ids))
