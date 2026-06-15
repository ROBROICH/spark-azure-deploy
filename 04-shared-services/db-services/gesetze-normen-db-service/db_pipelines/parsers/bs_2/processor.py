"""Process class for HTML laws"""

import logging
import re
from typing import Any

import httpx
from bs4 import BeautifulSoup

from db_pipelines.parsers.base_processor import BaseProcessor
from db_pipelines.parsers.utils.absatz_blocks import parse_absatz_blocks
from db_pipelines.parsers.utils.time import get_current_time
from db_pipelines.parsers.utils.xml import xml_html_elem_to_md
from db_pipelines.schemas.db import (
    TOC,
    Absatz,
    Document,
    Hierarchy,
    Norm,
    ParagraphTyp,
    Standangabe,
)

logger = logging.getLogger(__name__)


class BsProcessor2(BaseProcessor):
    """Class for processing laws from HTML detail pages.


    Slug is the numeric document ID, e.g. '157828'.
    You can find it in the `SENDEN` url as part of the `gsid` parameter

    The detail page URL is discovered from the overview page at
    {base_url}/{slug}.
    """
    doknr: str = ""

    def _get_doc(self) -> BeautifulSoup:
        with open(self.norm_dir / f"{self.slug}.html", "r") as f:
            return BeautifulSoup(f.read(), "html.parser")

    def _fetch_doc(self):
        """Fetch the law detail page.

        1. Load overview page at /{slug} to discover the detail link.
        2. Follow the detail link and save as HTML fixture.
        """
        overview_url = f"{self.base_url}/{self.slug}"
        resp = httpx.get(overview_url, follow_redirects=True)
        resp.raise_for_status()

        overview_soup = BeautifulSoup(resp.text, "html.parser")
        download_div = overview_soup.find("div", class_="project_download_banner")
        if not download_div:
            raise ValueError(
                f"No download banner found for slug {self.slug} ({overview_url})"
            )
        detail_link = download_div.find("a")["href"]

        detail_resp = httpx.get(detail_link, follow_redirects=True)
        detail_resp.raise_for_status()

        with open(self.norm_dir / f"{self.slug}.html", "w") as f:
            f.write(detail_resp.text)

    # ------------------------------------------------------------------ #
    #  Top-level parse
    # ------------------------------------------------------------------ #

    def _parse_doc(self, doc: Any = None) -> Document:
        if doc is None:
            doc = self._get_doc()

        outer_doc = doc.find("div", class_="docLayoutText")
        inner_doc = outer_doc.find("div", class_="docLayoutText")

        # Metadata from header table
        jurabk, dokumenttyp, gliederungs_nr, fundstelle = self._extract_metadata(outer_doc)

        # Fundstelle from Standangabe header
        if fundstelle is None:
            fundstelle = self._extract_fundstelle(outer_doc)

        if gliederungs_nr != "":
            self.doknr = gliederungs_nr
        else:
            self.doknr = f"bs2_{jurabk or self.slug}"

        if dokumenttyp and dokumenttyp.lower() != self.doctype.value:
            logger.warning(
                f"Dokumenttyp mismatch for slug {self.slug}: "
                f"expected {self.doctype.value}, got {dokumenttyp}"
            )

        # Title: langue, kurzue, ausfertigung_datum
        langue, kurzue, ausfertigung_datum = self._extract_title(outer_doc)

        # Standangaben
        standangaben = self._extract_standangaben(inner_doc)

        # TOC
        toc = self._extract_toc(inner_doc, jurabk)

        # Norms
        normen = self._extract_norms(inner_doc, jurabk)

        document = Document(
            doknr=self.doknr,
            doktyp=self.doctype,
            hierarchy=self.hierarchy,
            bundesland=self.bundesland.name if self.bundesland else None,
            builddate=get_current_time(),
            jurabk=jurabk,
            kurzue=kurzue,
            langue=langue,
            ausfertigung_datum=ausfertigung_datum,
            fundstelle=fundstelle,
            standangaben=standangaben,
            toc=toc,
            normen=normen,
            anlagen=[],
        )
        return document

    # ------------------------------------------------------------------ #
    #  Metadata extraction helpers
    # ------------------------------------------------------------------ #

    def _extract_metadata(
        self, outer_doc: BeautifulSoup
    ) -> tuple[str, str, str, str | None]:
        """Extract jurabk, dokumenttyp, gliederungs_nr, and fundstelle from the header table."""
        head_div = outer_doc.find("div", class_="jgwsHead")
        table = head_div.find("table", class_="TableRahmenkpl")
        cells = table.find_all("td")

        metadata: dict[str, str] = {}
        i = 0
        while i < len(cells):
            strong = cells[i].find("strong")
            if strong and i + 1 < len(cells):
                key = strong.get_text().strip().replace("\xa0", " ").rstrip(":")
                next_cell = cells[i + 1]
                if not next_cell.find("strong"):
                    metadata[key] = next_cell.get_text().strip()
                    i += 2
                    continue
            i += 1

        jurabk = metadata.get("Amtliche Abkürzung", self.slug)
        dokumenttyp = metadata.get("Dokumenttyp", "")
        gliederungs_nr = metadata.get("Gliederungs-Nr", "")
        fundstelle = metadata.get("Fundstelle", None)
        return jurabk, dokumenttyp, gliederungs_nr, fundstelle

    def _extract_title(
        self, outer_doc: BeautifulSoup
    ) -> tuple[str, str | None, str | None]:
        """Extract langue (full title), kurzue (abbreviation) and ausfertigung_datum."""
        title_div = outer_doc.find("div", class_="jgwsTitle")
        doc_div = title_div.find("div", class_="doc")

        # Split on <br/> to get individual lines
        parts = []
        for child in doc_div.children:
            if child.name == "br":
                continue
            if child.name == "a":
                continue
            if child.name == "sup":
                continue
            text = child.get_text().strip() if hasattr(child, "get_text") else str(child).strip()
            if text:
                parts.append(text)

        # Reconstruct: "Bremisches Gesetz ... (Bremisches Bodenschutzgesetz - BremBodSchG)"
        # and "Vom 27. August 2002"
        full_text = " ".join(parts).strip()
        # Remove trailing footnote markers like " *"
        full_text = re.sub(r"\s*\*\s*$", "", full_text)

        # Extract ausfertigung_datum: "Vom DD. Monat YYYY" or "in der Fassung vom DD. Monat YYYY"
        date_match = re.search(
            r"(?:Vom|vom)\s+(\d{1,2})\.\s+"
            r"(Januar|Februar|März|April|Mai|Juni|Juli|August|"
            r"September|Oktober|November|Dezember)\s+(\d{4})",
            full_text,
        )
        ausfertigung_datum = None
        if date_match:
            month_map = {
                "Januar": "01", "Februar": "02", "März": "03", "April": "04",
                "Mai": "05", "Juni": "06", "Juli": "07", "August": "08",
                "September": "09", "Oktober": "10", "November": "11", "Dezember": "12",
            }
            day = date_match.group(1).zfill(2)
            month = month_map[date_match.group(2)]
            year = date_match.group(3)
            ausfertigung_datum = f"{year}-{month}-{day}"

        # Split title into langue and kurzue
        # Pattern: "Long title (Short title - Abbreviation)"
        kurzue = None
        langue = full_text

        # Remove the date part for the title
        date_part_match = re.search(r"\s*(?:Vom|vom|in der Fassung vom)\s+\d{1,2}\.", full_text)
        if date_part_match:
            langue = full_text[: date_part_match.start()].strip()

        # Pattern: "Long title (Short title - Abbreviation)"
        # kurzue is the long form (before " - "); the abbreviation is jurabk.
        paren_match = re.search(r"\s*\(([^)]+)\)\s*$", langue)
        if paren_match:
            paren_content = paren_match.group(1)
            if " - " in paren_content:
                kurzue = paren_content.split(" - ")[0].strip()
            else:
                kurzue = paren_content.strip()
            langue = langue[: paren_match.start()].strip()

        return langue, kurzue, ausfertigung_datum

    def _extract_fundstelle(self, outer_doc: BeautifulSoup) -> str:
        """Extract Fundstelle from the title div date info.

        This source doesn't have a separate fundstelle field in the detail page.
        We construct it from Gliederungs-Nr and the title date.
        """
        # Try to get from Gesamtausgabe text
        inner_doc = outer_doc.find("div", class_="docLayoutText")
        margin_div = inner_doc.find("div", class_="docLayoutMarginTopMore")
        if margin_div:
            text = margin_div.get_text().strip()
            if text:
                return text

        return ""

    def _extract_standangaben(self, inner_doc: BeautifulSoup) -> list[Standangabe]:
        """Extract Standangaben from the standangaben table."""
        standangaben = []
        stand_table = inner_doc.find("table", class_="standangaben")
        if stand_table:
            rows = stand_table.find_all("tr")
            for row in rows:
                tds = row.find_all("td")
                if len(tds) >= 2:
                    typ = tds[0].get_text().strip().rstrip(":")
                    kommentar = tds[1].get_text().strip()
                    if kommentar:
                        standangaben.append(
                            Standangabe(standtyp=typ, standkommentar=kommentar)
                        )
        return standangaben

    # ------------------------------------------------------------------ #
    #  TOC extraction
    # ------------------------------------------------------------------ #

    def _extract_toc(self, inner_doc: BeautifulSoup, jurabk: str) -> list[TOC]:
        """Extract TOC from the CONTENTS table in the IVZ div."""
        toc_entries = []
        ivz_div = inner_doc.find(
            "div", id=lambda x: x and "IVZ" in str(x)
        )
        if not ivz_div:
            return toc_entries

        contents_table = ivz_div.find("table", class_="CONTENTS")
        if not contents_table:
            return toc_entries

        current_gliederung = jurabk
        rows = contents_table.find_all("tr")
        for row in rows:
            tds = row.find_all("td")
            if not tds:
                continue

            # Section headers (colspan=2, centered): "Teil 1: ..."
            if len(tds) == 1 or (
                len(tds) >= 1 and tds[0].get("colspan")
            ):
                text = tds[0].get_text().strip()
                if text and text != "Inhaltsübersicht":
                    current_gliederung = text
                continue

            # Paragraph entries: first td has "§ X", second td has title
            if len(tds) >= 2:
                par_text = tds[0].get_text().strip()
                title_text = tds[1].get_text().strip()

                par_match = re.match(r"§{1,2}\s*(\d+\w*)", par_text)
                if par_match:
                    paragraph_nr = par_match.group(1)
                    p_type = (
                        ParagraphTyp.DOUBLE
                        if par_text.startswith("§§")
                        else ParagraphTyp.SINGLE
                    )
                    toc_entries.append(
                        TOC(
                            text=title_text,
                            paragraph_nr=paragraph_nr,
                            paragraph_typ=p_type,
                            jurabk=jurabk,
                            gliederungsbezug=current_gliederung,
                            gliederungstitel=current_gliederung,
                        )
                    )

        return toc_entries

    # ------------------------------------------------------------------ #
    #  Norms extraction
    # ------------------------------------------------------------------ #

    def _extract_norms(
        self, inner_doc: BeautifulSoup, jurabk: str
    ) -> list[Norm]:
        """Extract all norms (§§) from the law body."""
        norms = []
        norm_divs = inner_doc.find_all("div", class_="jgwsAiZDoc")

        for div in norm_divs:
            # Find the paragraph heading (h4 or h5)
            heading = div.find(["h4", "h5"])
            if not heading:
                continue

            heading_text = heading.get_text().strip()

            # Only process § paragraphs, skip "Fußnoten", section headings, etc.
            par_match = re.match(
                r"(§{1,2})\s*(\d+\w*)\s*(.*)", heading_text, re.DOTALL
            )
            if not par_match:
                continue

            p_symbol = par_match.group(1)
            paragraph_nr_str = par_match.group(2)
            titel = par_match.group(3).strip()

            paragraph_typ = (
                ParagraphTyp.DOUBLE if p_symbol == "§§" else ParagraphTyp.SINGLE
            )

            # Split paragraph_nr into numeric and sub parts
            nr_match = re.match(r"(\d+)([a-z]*)", paragraph_nr_str)
            paragraph_nr = int(nr_match.group(1))
            sub_paragraph_nr = nr_match.group(2)

            # Extract Absätze from <p> tags following the heading
            absaetze = self._extract_absaetze(
                heading, jurabk, paragraph_nr, sub_paragraph_nr
            )

            paragraph_text = " ".join(ab.absatz_text for ab in absaetze)

            norms.append(
                Norm(
                    titel=titel,
                    doknr=self.doknr,
                    jurabk=jurabk,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub_paragraph_nr,
                    paragraph_text=paragraph_text,
                    paragraph_typ=paragraph_typ,
                    absaetze=absaetze,
                )
            )

        return norms

    def _extract_absaetze(
        self,
        heading: BeautifulSoup,
        jurabk: str,
        paragraph_nr: int,
        sub_paragraph_nr: str,
    ) -> list[Absatz]:
        """Extract Absätze (paragraphs) from elements after a heading.

        Groups <p>/<dl> blocks into Absätze keyed on the leading "(N)" marker
        and delegates sentence parsing to ``parse_absatz_blocks``, which
        handles nested lists, shared endtext, and trailing standalone
        sentences uniformly across portals.
        """
        absatz_nr_re = re.compile(r"^\((\d+\w?)\)\s*(.*)$", re.DOTALL)
        norm_container = heading.find_parent("div", class_="jgwsAiZDoc")

        elements = []
        for sibling in heading.find_next_siblings():
            if sibling.find_parent("div", class_="jgwsAiZDoc") != norm_container:
                break
            if sibling.name in ("p", "dl"):
                elements.append(sibling)

        # Chunk into (absatz_nr, prefix_text, blocks). A new chunk opens at
        # each "(N)" <p>; everything else attaches to the preceding chunk.
        chunks: list[tuple[str | None, str, list[Any]]] = []
        current_nr: str | None = None
        current_prefix = ""
        current_blocks: list[Any] = []

        for elem in elements:
            if elem.name == "p":
                text = elem.get_text(" ", strip=True).replace("\xa0", " ")
                m = absatz_nr_re.match(text)
                if m:
                    if current_nr is not None or current_prefix or current_blocks:
                        chunks.append((current_nr, current_prefix, current_blocks))
                    current_nr = m.group(1)
                    current_prefix = m.group(2).strip()
                    current_blocks = []
                    continue
            current_blocks.append(elem)

        if current_nr is not None or current_prefix or current_blocks:
            chunks.append((current_nr, current_prefix, current_blocks))

        # Norms with no "(N)" markers at all become a single Absatz numbered "1".
        if chunks and chunks[0][0] is None:
            if len(chunks) == 1:
                chunks = [("1", chunks[0][1], chunks[0][2])]
            else:
                _, pre, pre_blocks = chunks[0]
                nr1, pref1, blocks1 = chunks[1]
                merged_prefix = (pre + " " + pref1).strip() if pre else pref1
                chunks = [(nr1, merged_prefix, pre_blocks + blocks1)] + chunks[2:]

        absaetze: list[Absatz] = []
        seq = 1
        for nr, prefix, block_list in chunks:
            text_parts: list[str] = [prefix] if prefix else []
            for b in block_list:
                t = xml_html_elem_to_md(b)
                if t:
                    text_parts.append(t)
            absatz_text = "\n\n".join(text_parts)
            if not absatz_text:
                continue

            saetze = parse_absatz_blocks(prefix, block_list)
            absaetze.append(
                Absatz(
                    jurabk=jurabk,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub_paragraph_nr,
                    absatz_nr=nr or str(seq),
                    absatz_text=absatz_text,
                    saetze=saetze,
                )
            )
            seq += 1

        return absaetze
