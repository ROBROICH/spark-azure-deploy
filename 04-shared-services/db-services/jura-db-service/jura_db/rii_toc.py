"""Utilities to read and parse a TOC XML for court decisions.

This module parses a TOC XML used in `jura_db` and returns one entry by its
zero-based index.
"""

import logging
from pathlib import Path
import defusedxml.ElementTree as ET  # type: ignore[import-untyped]
from defusedxml import DefusedXmlException  # type: ignore[import-untyped]

import httpx

logger = logging.getLogger("rii_toc")


def download_toc(cache_dir: Path, overwrite: bool = False) -> Path:
    """Download the TOC XML to the cached folder.

    Downloads from the standard RII TOC URL and saves to cached/rii-toc.xml

    Returns:
        The saved file path
    """
    url = "https://www.rechtsprechung-im-internet.de/rii-toc.xml"
    out_path = Path(cache_dir) / "rii-toc.xml"

    # Create directory and download file
    out_path.parent.mkdir(parents=True, exist_ok=True)

    if out_path.exists() and not overwrite:
        logger.info(f"Using cached RII TOC at {out_path}")
        return out_path

    logger.info(f"Fetching RII TOC from {url} ...")
    response = httpx.get(url, timeout=60)
    response.raise_for_status()

    with open(out_path, "wb") as fp:
        fp.write(response.content)

    logger.info(f"Saved RII TOC to {out_path}")
    return out_path


def list_toc_items(toc_file: Path) -> list[dict[str, str]]:
    """Return all BVerwG TOC entries (excluding Wehrdienst) with required fields."""
    try:
        tree = ET.parse(toc_file)
        root = tree.getroot()
        if root is None:
            raise ValueError("Invalid XML: no root element found")

        items: list[dict[str, str]] = []
        for item in root.findall("item"):
            gericht = item.find("gericht")
            if gericht is not None and gericht.text is not None and "BVerwG" not in gericht.text:
                continue
            if gericht is not None and gericht.text is not None and "Wehrdienst" in gericht.text:
                continue
            entsch_datum = item.find("entsch-datum")
            aktenzeichen = item.find("aktenzeichen")
            link = item.find("link")
            modified = item.find("modified")

            if (
                gericht is not None
                and gericht.text
                and entsch_datum is not None
                and entsch_datum.text
                and aktenzeichen is not None
                and aktenzeichen.text
                and link is not None
                and link.text
                and modified is not None
                and modified.text
            ):
                items.append(
                    {
                        "gericht": gericht.text.strip(),
                        "entsch_datum": entsch_datum.text.strip(),
                        "aktenzeichen": aktenzeichen.text.strip(),
                        "link": link.text.strip(),
                        "modified": modified.text.strip(),
                    }
                )

        return items
    except DefusedXmlException:
        logger.error(f"Blocked unsafe XML", exc_info=True)
        raise ValueError("Unsafe XML input detected")
    except Exception as e:
        logger.error(f"Failed to read TOC file: {e}")
        raise


def get_toc_item(toc_file: Path, document_index: int) -> dict[str, str]:
    """Filter the TOC file and get document info by index"""
    items = list_toc_items(toc_file)
    if document_index >= len(items):
        raise IndexError(
            f"Document number {document_index} is out of range. "
            f"TOC contains {len(items)} items."
        )
    return items[document_index]
