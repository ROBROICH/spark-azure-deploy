"""
basic parser output validation. represents shared requirements for all parsers, so runs through all available parsers as a basic smoke test.
See `tests/data/example_doc.json` for the expected output structure and content.
`extra.json` files in the parsers's test data "cache" directory can be used to provide the equivalent of the `extra` config.
"""
import json
from pathlib import Path
from db_pipelines.constants import Bundesland
import pytest
from datetime import date
from db_pipelines.schemas.db import Document, Hierarchy
from db_pipelines.parsers.base_processor import BaseProcessor
from db_pipelines.parsers import parser_map

all_parsers: list[type[BaseProcessor]] = list(parser_map.values())

_BASE_PATH = Path("tests/data/")


def _construct_kwargs(parserClass: type[BaseProcessor]) -> dict[str, object]:
    """
    derive hierarchy (and bundesland) from the processor's cache directory in
    tests/data, which mirrors the <parser>/<HIERARCHY>/[<BUNDESLAND>/]<slug>
    layout that BaseProcessor writes to.
    """
    parser_dir = _BASE_PATH / parserClass.parser_dirname()
    extra_path = parser_dir / "extra.json"
    if extra_path.exists():
        extra = json.loads(extra_path.read_text(encoding="utf-8"))
    else:
        extra = {}
    hierarchy_dirs = [d for d in parser_dir.iterdir() if d.is_dir()]
    if not hierarchy_dirs:
        raise FileNotFoundError(f"no test data found under {parser_dir}")
    hierarchy_dir = hierarchy_dirs[0]

    hierarchy = Hierarchy[hierarchy_dir.name]
    kwargs: dict[str, object] = {"hierarchy": hierarchy}
    if hierarchy == Hierarchy.BUNDESLAND:
        bundesland_dir = next(d for d in hierarchy_dir.iterdir() if d.is_dir())
        kwargs["bundesland"] = Bundesland[bundesland_dir.name]
    kwargs.update(extra)
    return kwargs


@pytest.fixture(scope="module", params=all_parsers)
def parser(request: pytest.FixtureRequest) -> BaseProcessor:
    parserClass = request.param
    parser = parserClass(
        slug="testG",
        doctype="gesetz",
        base_path=_BASE_PATH,
        base_url="https://parser.test",
        **_construct_kwargs(parserClass),
    )
    return parser


@pytest.fixture(scope="module")
def doc(parser: BaseProcessor) -> Document:
    return parser.parse_doc()


def test_metadata_parsed(parser: BaseProcessor) -> None:
    """required metadata should be parsed correctly"""
    doc = parser.parse_doc()
    assert doc.doktyp == "gesetz"
    assert doc.kurzue == "Testgesetz"
    assert doc.langue == "Gesetz zum testen von Gesetzen"
    assert "TestG" in doc.jurabk
    assert doc.fundstelle != ""
    assert doc.standangaben != []
    # assert doc.eingangsformerl == "intro text."
    assert doc.ausfertigung_datum == date(2000, 1, 1)

    if doc.hierarchy == Hierarchy.BUNDESLAND:
        assert doc.bundesland == parser.bundesland.name


def test_sections_not_parsed_as_norms(doc: Document) -> None:
    """norms should always include at least one absatz entry"""
    for norm in doc.normen:
        assert not norm.absaetze == []
        assert not norm.absaetze[0].saetze == []


def test_absatz_text_includes_satze_text(doc: Document) -> None:
    """absatz text should include the text of its saetze"""
    absatz = doc.normen[0].absaetze[0]
    for satz in absatz.saetze:
        assert satz.satz_text in absatz.absatz_text

    absatz_text = doc.normen[1].absaetze[2].absatz_text
    assert "Dieser Satz wird aufgeteilt in:" in absatz_text
    assert "eine einzelne verschachtelte Ebene," in absatz_text
    assert "2." in absatz_text
    assert "eine tiefer verschachtelte mit," in absatz_text
    assert "b)" in absatz_text
    assert "Teil a," in absatz_text
    assert "(und gemeinsamer Endtext)" in absatz_text
    assert "Dieser Satz ist nicht enthalten" in absatz_text


def test_sentence_period_split(doc: Document) -> None:
    """
    sentence should be split at periods, and sentence numbers
    should increment accordingly (reseting for each new sentence)
    """
    assert len(doc.normen[0].absaetze[0].saetze) == 3
    assert doc.normen[0].absaetze[0].saetze[0].satz_nr == 1
    assert doc.normen[0].absaetze[0].saetze[1].satz_nr == 2
    assert doc.normen[0].absaetze[0].saetze[2].satz_nr == 3
    assert len(doc.normen[0].absaetze[1].saetze) == 1
    assert doc.normen[0].absaetze[1].saetze[0].satz_nr == 1
    assert len(doc.normen[0].absaetze[2].saetze) == 2
    assert doc.normen[0].absaetze[2].saetze[0].satz_nr == 1
    assert doc.normen[0].absaetze[2].saetze[1].satz_nr == 2


def test_absatz_nr_matches_source_marker(doc: Document) -> None:
    """
    absatz_nr should be the bare "(N)" marker from the source (e.g. "1", "2", "3a"),
    not a synthesized value derived from paragraph_nr or a positional sequence.
    """
    assert [a.absatz_nr for a in doc.normen[0].absaetze] == ["1", "2", "3"]
    assert [a.absatz_nr for a in doc.normen[1].absaetze] == ["1", "2", "3", "4"]


def test_sentence_with_markers_split(doc: Document) -> None:
    """
    markers are taken from the text, except when they are ambiguous, 
    in which case we make them unique by appending a suffix (e.g. '1. –', '2. –')
    """
    assert len(doc.normen[1].absaetze[0].saetze) == 2
    assert all(s.satz_nr == 1 for s in doc.normen[1].absaetze[0].saetze)
    assert doc.normen[1].absaetze[0].saetze[0].markers == ["1"]
    assert doc.normen[1].absaetze[0].saetze[0].satz_text == "Dieser Satz ist verschachtelt."
    assert doc.normen[1].absaetze[0].saetze[1].markers == ["2"]
    assert doc.normen[1].absaetze[0].saetze[1].satz_text == "Dieser Satz bietet eindeutige Markierungen."

    assert len(doc.normen[1].absaetze[1].saetze) == 2
    assert all(s.satz_nr == 1 for s in doc.normen[1].absaetze[1].saetze)
    assert doc.normen[1].absaetze[1].saetze[0].markers[0].startswith("1.")
    assert doc.normen[1].absaetze[1].saetze[1].markers[0].startswith("2.")


def test_sentence_with_nested_markers_split(doc: Document) -> None:
    """
    should split sentences with nested markers (e.g. 1, 2a, 2b) and 
    assign correct markers and sentence numbers
    """
    saetze = doc.normen[1].absaetze[2].saetze
    assert len(saetze) == 4
    assert all(s.satz_nr == 1 for s in saetze[:-1])
    assert saetze[0].markers == ["1"]
    assert saetze[1].markers == ["2", "a"]
    assert saetze[2].markers == ["2", "b"]


def test_sentence_with_nested_markers_and_prefix_suffix(doc: Document) -> None:
    """
    should recombine sentences with nested markers and shared prefix/suffix text
    """
    saetze = doc.normen[1].absaetze[2].saetze
    assert saetze[0].markers == ["1"]
    assert saetze[1].markers == ["2", "a"]
    assert (
        saetze[1].satz_text == 
        "Dieser Satz wird aufgeteilt in: eine tiefer verschachtelte mit Teil a (und gemeinsamer Endtext)."
    )
    assert saetze[2].markers == ["2", "b"]
    assert (
        saetze[2].satz_text == 
        "Dieser Satz wird aufgeteilt in: eine tiefer verschachtelte mit Teil b (und gemeinsamer Endtext)."
    )


def test_sentence_two_after_endtext(doc: Document) -> None:
    """
    should handle sentences that come after list endtext, without markers
    """
    saetze = doc.normen[1].absaetze[3].saetze
    assert len(saetze) == 3
    assert all(s.satz_nr == 1 for s in saetze[:-1])
    assert all("und endtext." in s.satz_text for s in saetze[:-1])


def test_complete_sentence_markers_with_continuation(doc: Document) -> None:
    """
    sentences with markers followed by a standalone sentence
    """
    saetze = doc.normen[1].absaetze[2].saetze
    assert all("Dieser Satz ist nicht enthalten" not in s.satz_text for s in saetze[:-1])
    assert saetze[3].satz_nr == 2
    assert saetze[3].markers == []
    assert saetze[3].satz_text == "Dieser Satz ist nicht enthalten."


def test_sentences_ended_cleanly(doc: Document) -> None:
    """
    sentences should always end with a period, even if the original text does not.
    existing punctuation and linking words should be cleaned up, so that complete,
    atomic sentences are created.
    """ 
    for norm in doc.normen:
        for absatz in norm.absaetze:
            assert all(s.satz_text.endswith(".") for s in absatz.saetze)
            assert all(s.satz_text[:-2] not in (",", ";", ":") for s in absatz.saetze)
            assert all("sowie" not in s.satz_text[-5:] for s in absatz.saetze)


def test_parse_lists_no_colon(doc: Document) -> None:
    """
    should not add `:` character before list values
    when rendering absatz and paragraph text
    """
    absatz_text = doc.normen[1].absaetze[2].absatz_text
    lines = absatz_text.splitlines()
    assert not any(line.strip().startswith(":") for line in lines)
