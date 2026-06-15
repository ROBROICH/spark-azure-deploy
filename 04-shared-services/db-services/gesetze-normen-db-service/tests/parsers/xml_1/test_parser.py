"""gii_parser unit tests"""

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
