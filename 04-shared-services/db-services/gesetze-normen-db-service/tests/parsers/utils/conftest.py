import os
import xml.etree.ElementTree as ET
from xml.etree.ElementTree import ElementTree, Element

import pytest


def load_test_xml(xml_path: str) -> ElementTree:
    """load xml from `tests/data`"""
    xml_path = os.path.join("tests/data/xml", xml_path)
    tree = ET.parse(xml_path)
    return tree


@pytest.fixture
def load_absatz():
    """load absatz helper"""

    def load_absatz(xml_path: str, paragraph_nr: str, absatz_nr: str, sub_paragraph_nr: str | None = None) -> Element:
        """loads only specific absatz-xml element"""
        tree = load_test_xml(xml_path)
        root = tree.getroot()

        if sub_paragraph_nr is not None:
            paragraph_nr = str(paragraph_nr) + sub_paragraph_nr
        # Find the norm with the correct paragraph number
        target_norm = None
        for norm in root.findall(".//norm"):
            enbez = norm.find(".//metadaten/enbez")
            if enbez is not None and enbez.text == f"§ {paragraph_nr}":
                target_norm = norm
                break

        content = target_norm.find(".//textdaten/text/Content")

        for p in content.findall("P"):
            if p.text and p.text.strip().startswith(f"({absatz_nr})"):
                return p

        raise ValueError(f"Absatz ({absatz_nr}) not found in § {paragraph_nr}")

    return load_absatz
