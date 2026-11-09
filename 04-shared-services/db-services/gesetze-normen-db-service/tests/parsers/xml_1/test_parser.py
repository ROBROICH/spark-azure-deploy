"""gii_parser unit tests"""

import re
import shutil
import xml.etree.ElementTree as ET
from zipfile import BadZipFile

import pytest
from db_pipelines.parsers.xml_1.parser import XmlProcessor1
from db_pipelines.schemas.db import ParagraphTyp
from httpx import Response


def test_fetch(respx_mock, tmpdir):
    """testing gii-download implementation"""
    # create mock response including the zip
    with open("tests/data/xml_processor_1/testg.zip", "rb") as f:
        response_body = f.read()
    respx_mock.get("https://processor.test/testg/xml.zip").mock(
        return_value=Response(200, content=response_body)
    )

    parser = XmlProcessor1("testg", "gesetz", base_url="https://processor.test", base_path=tmpdir)
    # remove existing files if they exist
    if parser.norm_dir.exists():
        shutil.rmtree(parser.norm_dir)
    parser.fetch_doc()
    # cleanup
    shutil.rmtree(parser.norm_dir)


def test_parse_doc():
    """smoke tests full document parsing with an example"""
    processor = XmlProcessor1("testG", "gesetz", base_url="https://processor.test", base_path="tests/data/")
    doc = processor.parse_doc()
    assert doc.doknr == "BJNRTEST"
    assert len(doc.normen) == 9
    assert len(doc.anlagen) == 1

    # § 50a is (weggefallen) and is filtered out, leaving 12 norms
    processor = XmlProcessor1("test2G", "gesetz", base_url="https://processor.test", base_path="tests/data/")
    doc = processor.parse_doc()
    assert doc.doknr == "BJNRTEST2"
    assert len(doc.normen) == 12
    assert len(doc.anlagen) == 0


def test_parse_doc_generate_toc(tmpdir):
    """should generate a TOC from the norm entries if none is present"""
    et = ET.parse("tests/data/xml_processor_1/BUND/testG/test.xml")
    processor = XmlProcessor1("testg", "gesetz", base_url="https://processor.test", base_path=tmpdir)
    doc = processor._parse_doc(et)
    assert len(doc.toc) > 0
    # attachments sanity check


def test_parse_toc():
    """should add all paragraphs to TOC"""
    et = ET.parse("tests/data/xml_processor_1/toc.xml")
    toc_elem = et.getroot().find("textdaten").find("text").find("Content").find("TOC")
    processor = XmlProcessor1("testG", "gesetz", base_url="https://processor.test", base_path="tests/data/")
    parsed_toc = processor._parse_toc_xml(toc_elem, "test", "BTestG")
    assert len(list(filter(lambda x: x.paragraph_typ == ParagraphTyp.SINGLE, parsed_toc))) == 9


def test_parse_toc_attachments():
    """should add Anlage/Anhang elements to the TOC"""
    et = ET.parse("tests/data/xml_processor_1/toc.xml")
    toc_elem = et.getroot().find("textdaten").find("text").find("Content").find("TOC")
    processor = XmlProcessor1("testG", "gesetz", base_url="https://processor.test", base_path="tests/data/")
    parsed_toc = processor._parse_toc_xml(toc_elem, "test", "BTestG")
    assert (
        len(
            list(
                filter(
                    lambda x: x.paragraph_typ in (ParagraphTyp.ANLAGE, ParagraphTyp.ANLAGE),
                    parsed_toc,
                )
            )
        )
        == 1
    )


def test_parse_eingangsformel():
    """should parse eingangsformel if exists"""
    processor = XmlProcessor1("testG", "gesetz", base_url="https://processor.test", base_path="tests/data")
    doc = processor.parse_doc()
    assert doc.eingangsformel is not None


NORM_WITH_ABSAETZE = """
<norm>
  <metadaten>
    <jurabk>TestG</jurabk>
    <enbez>§ 1</enbez>
    <titel>Testnorm</titel>
  </metadaten>
  <textdaten><text><Content>
    <P>(1) Es ist verboten, <DL Type="arabic"><DT>1.</DT><DD><LA>zu verarbeiten</LA><LA>(Besitzverbote),</LA></DD><DT>2.</DT><DD><LA>zu verkaufen</LA></DD></DL>Artikel 9 bleibt unberührt.</P>
    <P>(2) Die Verbote gelten auch für Waren.</P>
  </Content></text></textdaten>
</norm>
"""


def _extract_single_norm():
    processor = XmlProcessor1("testG", "gesetz", base_url="https://processor.test", base_path="tests/data/")
    [norm] = processor._extract_norms([ET.fromstring(NORM_WITH_ABSAETZE)], doknr="BJNRTEST", jurabk="TestG")
    return norm


def test_paragraph_text_keeps_absatz_numbers():
    """splitting the absaetze must not strip their numbers from the paragraph text (#246)"""
    norm = _extract_single_norm()
    assert norm.paragraph_text.startswith("(1) Es ist verboten,")
    assert "(2) Die Verbote gelten auch für Waren." in norm.paragraph_text
    # the absatz rows keep the number in their own column, not in the text
    assert [a.absatz_nr for a in norm.absaetze] == ["1", "2"]
    assert norm.absaetze[0].absatz_text.startswith("Es ist verboten,")


def test_paragraph_text_separates_absaetze_with_blank_line():
    """text after a list belongs to its absatz; the next absatz starts after a blank line (#246)"""
    norm = _extract_single_norm()
    assert "Artikel 9 bleibt unberührt.\n\n(2) Die Verbote" in norm.paragraph_text


def test_adjacent_la_blocks_are_not_glued():
    """sibling <LA> blocks in one list item keep a separator (#246)"""
    norm = _extract_single_norm()
    assert "verarbeiten(Besitzverbote)" not in norm.paragraph_text
    assert re.search(r"zu verarbeiten\s+\(Besitzverbote\),", norm.paragraph_text)
    assert "verarbeiten(Besitzverbote)" not in norm.absaetze[0].absatz_text


def test_get_doc_no_xml(respx_mock, tmpdir):
    """should raise ValueError if the target directory is empty"""
    respx_mock.get("https://processor.test/test/xml.zip").mock(return_value=Response(404))
    processor = XmlProcessor1("test", "gesetz", base_url="https://processor.test", base_path=tmpdir)
    with pytest.raises(ValueError) as e:
        processor._get_doc()
        assert "no xml" in e.value


def test_get_doc_bad_zipfile(respx_mock, tmpdir):
    """should raise ValueError if the target directory is empty"""
    respx_mock.get("https://processor.test/test/xml.zip").mock(return_value=Response(200, content=b""))
    processor = XmlProcessor1("test", "gesetz", base_url="https://processor.test", base_path=tmpdir)
    with pytest.raises(BadZipFile):
        processor.fetch_doc()
