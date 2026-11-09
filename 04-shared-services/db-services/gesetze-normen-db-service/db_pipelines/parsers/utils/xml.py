"""common xml utilities"""

from xml.etree.ElementTree import Element
from typing import Union

import copy
import re
import defusedxml.ElementTree as ET
from bs4 import Tag as BS4Tag
from markdownify import markdownify as md


def xml_elem_to_str(elem: Element, **kwargs) -> str:
    """decodes an ElementTree Element back into a string"""
    return ET.tostring(elem, encoding="utf-8", **kwargs).decode("utf-8")


def separate_la_blocks(elem: Element) -> Element:
    """returns a copy of `elem` with a line break between sibling gii `<LA>` blocks

    markdownify treats the unknown `<LA>` tag as inline, so two text blocks of
    one list item (`<LA>verarbeiten</LA><LA>(Besitzverbote),</LA>`) would
    otherwise be glued together.
    """
    elem = copy.deepcopy(elem)
    for parent in elem.iter():
        la_blocks = [child for child in parent if child.tag == "LA"]
        for la in la_blocks[:-1]:
            la.tail = "\n" + (la.tail or "")
    return elem


def xml_html_elem_to_md(elem: Union[Element, BS4Tag]) -> str:
    """converts an xml.etree `Element` or html BeautifulSoup `Tag` to markdown"""
    if isinstance(elem, BS4Tag):
        html_str = str(elem)
    else:
        html_str = xml_elem_to_str(separate_la_blocks(elem), method="html")
    markdown = md(html_str)
    cleaned = re.sub(r"(.{1,3}?[\.\)])(\s*)?:\s*", r"\1 ", markdown).strip()
    cleaned = re.sub(r"([–-])(\s*)?:\s*", r"\1 ", cleaned).strip()
    # markdownify renders <dd>s without a preceding <dt> (i.e. continuation
    # dd siblings under the same dt) as orphan ":  " lines. Strip the prefix.
    cleaned = re.sub(r"^(\s*):\s{2,}", r"\1", cleaned, flags=re.MULTILINE)
    return cleaned