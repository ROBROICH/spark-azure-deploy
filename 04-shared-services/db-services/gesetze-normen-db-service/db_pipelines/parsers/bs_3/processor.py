"""Process class for HTML laws"""

import copy
import logging
import re
from datetime import date
from pathlib import Path

import httpx
from bs4 import BeautifulSoup, Tag

from db_pipelines.parsers.base_processor import BaseProcessor
from db_pipelines.parsers.utils.absatz_blocks import parse_absatz_blocks, tag_to_text
from db_pipelines.parsers.utils.time import get_current_time
from db_pipelines.schemas.db import (
    Absatz,
    Document,
    Footnote,
    Hierarchy,
    Norm,
    Standangabe,
    TOC,
)

GERMAN_MONTHS = {
    "Januar": 1, "Februar": 2, "März": 3, "April": 4,
    "Mai": 5, "Juni": 6, "Juli": 7, "August": 8,
    "September": 9, "Oktober": 10, "November": 11, "Dezember": 12,
}

DATE_PATTERN = re.compile(r"[Vv]om\s+(\d{1,2})\.\s+(\w+)\s+(\d{4})")
ABSATZ_NR_PATTERN = re.compile(r"^\((\d+\w?)\)")
PARAGRAPH_LINK_PATTERN = re.compile(r"^p(\d+)([a-z]*)")

logger = logging.getLogger(__name__)


class BsProcessor3(BaseProcessor):
    """Class for processing laws from HTML sources"""

    jurabk: str

    @property
    def doknr(self) -> str:
        return f"{self.jurabk or self.slug}"

    def _fetch_doc(self):
        """Download the law HTML detail page."""
        url = f"{self.base_url}/vorschrift/{self.slug}"
        response = httpx.get(url)
        response.raise_for_status()
        self._get_doc().write_text(response.text, encoding="utf-8")

    def _get_doc(self) -> Path:
        return self.norm_dir / f"{self.slug}.html"

    # -- main parse entry point --

    def _parse_doc(self, doc=None) -> Document:
        """Parse the HTML into a Document object."""
        soup = BeautifulSoup(
            self._get_doc().read_text(encoding="utf-8"), "html.parser"
        )

        jurabk, langue, kurzue = self._extract_metadata(soup)
        self.jurabk = jurabk

        normen = self._extract_norms(soup)
        self._attach_footnotes(soup, normen)

        return Document(
            doknr=self.doknr,
            doktyp=self.doctype,
            hierarchy=self.hierarchy,
            bundesland=self.bundesland.name if self.bundesland else None,
            builddate=get_current_time(),
            jurabk=jurabk,
            langue=langue,
            kurzue=kurzue,
            fundstelle=self._extract_fundstelle(soup),
            ausfertigung_datum=self._extract_ausfertigung_datum(soup),
            eingangsformel=self._extract_eingangsformel(soup),
            toc=self._extract_toc(soup),
            normen=normen,
            standangaben=self._extract_standangaben(soup),
            anlagen=[],
        )

    # -- metadata extraction --

    def _extract_metadata(self, soup: BeautifulSoup) -> tuple[str, str, str]:
        """Extract jurabk, langue (full title), kurzue (short title).

        The source pages carry three distinct pieces of metadata:
          * ``<h1 class="mbottom_s_i">`` -> short title (kurzue).
          * the header ``<h3>`` -> full descriptive title (langue).
            The parenthetical short title / abbreviation is stripped off.
          * the ``<title>`` trailing token -> abbreviation. This becomes
            the jurabk (passed through ``suffixed_jurabk`` so it is unique
            across states; these abbreviations already carry a state prefix
            so no suffix is appended).
        """
        h1 = soup.select_one("h1.mbottom_s_i")
        kurzue = h1.get_text(strip=True) if h1 else ""

        langue = ""
        header_h3 = soup.select_one("header[data-link='ef'] h3")
        if header_h3:
            full = header_h3.get_text(" ", strip=True)
            # drop the trailing "(Short title – Abkürzung)" parenthetical
            langue = re.sub(r"\s*\([^)]*\)\s*$", "", full).strip()

        abbreviation = ""
        title_tag = soup.find("title")
        if title_tag:
            match = re.search(r"[–\-]\s*(\S+)\s*$", title_tag.get_text().strip())
            if match:
                abbreviation = match.group(1)

        if abbreviation:
            jurabk = self.suffixed_jurabk(abbreviation)
        else:
            raise ValueError("cannot parse jurabk")
        return jurabk, langue, kurzue

    def _extract_fundstelle(self, soup: BeautifulSoup) -> str:
        """Extract Fundstelle from sidebar box."""
        return self._extract_sidebar_text(soup, "Fundstelle")

    def _extract_ausfertigung_datum(self, soup: BeautifulSoup) -> date | None:
        """Extract the Ausfertigung date from the header."""
        match = self._find_date_in_header(soup)
        if not match:
            match = self._find_date_in_vollzitat(soup)
        if not match:
            return None

        month = GERMAN_MONTHS.get(match.group(2))
        if not month:
            return None
        return date(int(match.group(3)), month, int(match.group(1)))

    def _find_date_in_header(self, soup: BeautifulSoup) -> re.Match | None:
        header = soup.select_one("header[data-link='ef']")
        if not header:
            return None
        for p in header.find_all("p"):
            match = DATE_PATTERN.search(p.get_text(strip=True))
            if match:
                return match
        return None

    def _find_date_in_vollzitat(self, soup: BeautifulSoup) -> re.Match | None:
        h1 = soup.select_one("h1.mbottom_s_i")
        if not h1:
            return None
        next_p = h1.find_next_sibling("p")
        if next_p:
            return DATE_PATTERN.search(next_p.get_text())
        return None

    def _extract_eingangsformel(self, soup: BeautifulSoup) -> str:
        """Extract the Eingangsformel (preamble) from the header."""
        header = soup.select_one("header[data-link='ef']")
        if not header:
            return ""
        parts = [
            p.get_text(strip=True)
            for p in header.find_all("p")
            if p.get_text(strip=True)
            and not re.match(r"^(Vom\s+\d|Rechtsbereinigt)", p.get_text(strip=True))
        ]
        return " ".join(parts)

    def _extract_standangaben(self, soup: BeautifulSoup) -> list[Standangabe]:
        """Extract Gültigkeitszeitraum from sidebar."""
        text = self._extract_sidebar_text(soup, "Gültigkeitszeitraum")
        if not text:
            return []
        return [
            Standangabe(
                standtyp="Gültigkeitszeitraum",
                standkommentar=text,
                doknr=self.doknr,
            )
        ]

    def _extract_sidebar_text(self, soup: BeautifulSoup, heading: str) -> str:
        """Extract text from a sidebar box identified by heading."""
        for box in soup.select("div.box"):
            h3 = box.find("h3")
            if h3 and heading in h3.get_text():
                p = box.find("p")
                if p:
                    return p.get_text(separator="\n", strip=True)
        return ""

    # -- TOC extraction --

    def _extract_toc(self, soup: BeautifulSoup) -> list[TOC]:
        """Extract table of contents from <nav data-link='iu'> element."""
        nav = soup.select_one("nav[data-link='iu']")
        if not nav:
            return []

        toc_entries = []
        current_gliederung = ""

        for child in nav.children:
            if not isinstance(child, Tag):
                continue

            if child.name == "p" and child.find("strong"):
                current_gliederung = child.get_text(strip=True)
                toc_entries.append(
                    TOC(
                        gliederungsbezug=current_gliederung,
                        gliederungstitel=current_gliederung,
                        paragraph_typ=None,
                        paragraph_nr=None,
                        text=current_gliederung,
                        jurabk=self.jurabk,
                        doknr=self.doknr,
                    )
                )
            elif child.name == "dl":
                for dt, dd in zip(child.find_all("dt"), child.find_all("dd")):
                    par_text = dt.get_text(strip=True)
                    title_text = dd.get_text(strip=True)
                    par_match = re.match(r"§\s*(\d+\w*)", par_text)
                    par_nr = par_match.group(1) if par_match else par_text
                    toc_entries.append(
                        TOC(
                            gliederungsbezug=current_gliederung,
                            gliederungstitel=title_text,
                            paragraph_typ="§",
                            paragraph_nr=par_nr,
                            text=f"{par_text} {title_text}",
                            jurabk=self.jurabk,
                            doknr=self.doknr,
                        )
                    )

        return toc_entries

    # -- norm extraction --

    def _extract_norms(self, soup: BeautifulSoup) -> list[Norm]:
        """Extract all norms (paragraphs) from the law body."""
        sections_div = soup.select_one("div.sections")
        if not sections_div:
            return []

        norms = []
        for section in sections_div.find_all("section", recursive=False):
            data_link = section.get("data-link", "")
            if not re.match(r"^p\d", data_link):
                continue
            norm = self._parse_section_to_norm(section, data_link)
            if norm:
                norms.append(norm)
        return norms

    def _parse_section_to_norm(self, section: Tag, data_link: str) -> Norm | None:
        """Parse a single <section> element into a Norm object."""
        link_match = PARAGRAPH_LINK_PATTERN.match(data_link)
        if not link_match:
            return None

        paragraph_nr = int(link_match.group(1))
        sub_paragraph_nr = link_match.group(2)
        titel = self._extract_title(section)

        if "(weggefallen)" in titel:
            return Norm(
                titel="(weggefallen)",
                doknr=self.doknr,
                jurabk=self.jurabk,
                paragraph_nr=paragraph_nr,
                sub_paragraph_nr=sub_paragraph_nr,
                paragraph_text="(weggefallen)",
                paragraph_typ="§",
                absaetze=[],
            )

        absaetze = self._extract_absaetze(section, paragraph_nr, sub_paragraph_nr)
        paragraph_text = " ".join(a.absatz_text for a in absaetze if a.absatz_text)

        return Norm(
            titel=titel,
            doknr=self.doknr,
            jurabk=self.jurabk,
            paragraph_nr=paragraph_nr,
            sub_paragraph_nr=sub_paragraph_nr,
            paragraph_text=paragraph_text,
            paragraph_typ="§",
            absaetze=absaetze,
        )

    def _extract_title(self, section: Tag) -> str:
        """Extract the paragraph title from the <h4> element."""
        h4 = section.find("h4")
        if not h4:
            return ""

        br = h4.find("br")
        if br and br.next_sibling:
            parts = []
            for sibling in br.next_siblings:
                text = (
                    sibling.get_text(strip=True)
                    if isinstance(sibling, Tag)
                    else str(sibling).strip()
                )
                if text:
                    parts.append(text)
            return " ".join(parts).strip()

        titel = h4.get_text(strip=True)
        return re.sub(r"^§\s*\d+\w*\s*", "", titel).strip()

    # -- absatz extraction --

    def _extract_absaetze(
        self, section: Tag, paragraph_nr: int, sub_paragraph_nr: str
    ) -> list[Absatz]:
        """Extract Absätze from a section's <p>/<dl> content blocks.

        Sentence/marker handling is delegated to the shared
        ``parse_absatz_blocks`` utility (shared across the other parsers),
        so this source produces the same Satz structure as the
        other state parsers: numbered/lettered list markers, disambiguated
        duplicate markers ("1. –", "2. –"), nested-marker recombination
        (["2", "a"]), shared intro/suffix text and continuation sentences.

        Source-specific markup (``<sup class="satzzahl">`` sentence markers
        and ``<a class="fussnote_link">`` footnote links) is stripped before
        the blocks are handed to the shared parser so it does not leak into the
        sentence text.
        """
        blocks = [
            self._clean_block(child)
            for child in section.children
            if isinstance(child, Tag) and child.name in ("p", "dl")
        ]

        absaetze = self._build_absaetze(blocks, paragraph_nr, sub_paragraph_nr)
        if not absaetze:
            absaetze.append(
                Absatz(
                    absatz_nr="1",
                    absatz_text="",
                    jurabk=self.jurabk,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub_paragraph_nr,
                    saetze=[],
                )
            )
        return absaetze

    def _build_absaetze(
        self, blocks: list[Tag], paragraph_nr: int, sub_paragraph_nr: str
    ) -> list[Absatz]:
        """Chunk content blocks by leading `(N)` markers into Absätze.

        a `<p>` opening with an `(N)` marker starts a new Absatz,
        whose remaining blocks are parsed by `parse_absatz_blocks`.
        Leading content without a marker is folded into the
        first Absatz (numbered "1").
        """
        chunks: list[tuple[str | None, str, list[Tag]]] = []
        current_nr: str | None = None
        current_prefix = ""
        current_blocks: list[Tag] = []

        for block in blocks:
            if block.name == "p":
                text = tag_to_text(block)
                m = ABSATZ_NR_PATTERN.match(text)
                if m:
                    if current_nr is not None or current_prefix or current_blocks:
                        chunks.append((current_nr, current_prefix, current_blocks))
                    current_nr = m.group(1)
                    current_prefix = text[m.end():].strip()
                    current_blocks = []
                    continue
            current_blocks.append(block)

        if current_nr is not None or current_prefix or current_blocks:
            chunks.append((current_nr, current_prefix, current_blocks))

        # fold a leading marker-less chunk into the first numbered Absatz
        if chunks and chunks[0][0] is None:
            if len(chunks) > 1:
                _, pre, pre_blocks = chunks[0]
                nr1, pref1, blocks1 = chunks[1]
                merged_prefix = (pre + " " + pref1).strip() if pre else pref1
                chunks = [(nr1, merged_prefix, pre_blocks + blocks1)] + chunks[2:]
            else:
                chunks = [("1", chunks[0][1], chunks[0][2])]

        absaetze: list[Absatz] = []
        for nr, prefix, block_list in chunks:
            text_parts = [prefix] if prefix else []
            text_parts.extend(t for t in (tag_to_text(b) for b in block_list) if t)
            absatz_text = "\n\n".join(text_parts)
            saetze = parse_absatz_blocks(prefix, block_list)
            if not absatz_text and not saetze:
                continue
            absaetze.append(
                Absatz(
                    absatz_nr=nr or "1",
                    absatz_text=absatz_text,
                    jurabk=self.jurabk,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub_paragraph_nr,
                    saetze=saetze,
                )
            )
        return absaetze

    @staticmethod
    def _clean_block(block: Tag) -> Tag:
        """Return a copy of a content block with source markup removed.

        Drops ``<sup class="satzzahl">`` sentence markers and
        ``<a class="fussnote_link">`` footnote links so neither the visible
        digit nor the footnote reference leaks into the parsed sentence text,
        and rewrites the source's flat sub-lists into nested ``<dl>``s.
        """
        clean = copy.deepcopy(block)
        for sup in clean.find_all("sup", class_="satzzahl"):
            sup.decompose()
        for link in clean.find_all("a", class_="fussnote_link"):
            link.decompose()
        if clean.name == "dl":
            clean = BsProcessor3._normalize_sublists(clean)
        return clean

    @staticmethod
    def _normalize_sublists(dl: Tag) -> Tag:
        """Rewrite the source's flat sub-lists into nested ``<dl>``s.

        The source does not nest a ``<dl>`` inside a ``<dd>``. Instead a
        sub-enumeration is encoded flatly as three siblings: an empty ``<dt>``,
        a ``<dd class="td_2">`` marker (e.g. "a)") and a ``<dd class="last">``
        body. Each such sub-row is folded into a nested ``<dl class="cf">``
        placed inside the preceding top-level item's ``<dd>`` (whose own body is
        wrapped in a ``<p>`` so it survives as shared intro text). This lets the
        shared ``dl_to_saetze`` emit combined markers like ["1", "a"] instead of
        leaking the letter into the sentence text.

        Returns the original ``dl`` unchanged when it carries no td_2 markers.

        A single top-level item may itself begin with a td_2 sub-item (no own
        body) and may be followed by shared suffix text (an empty ``<dt>`` plus
        a plain ``<dd>`` after the sub-list), so the flat child sequence is
        walked token by token rather than grouped per ``<dt>``.
        """
        children = [
            c for c in dl.children
            if isinstance(c, Tag) and c.name in ("dt", "dd")
        ]
        if not any(
            c.name == "dd" and "td_2" in (c.get("class") or []) for c in children
        ):
            return dl

        factory = BeautifulSoup("", "html.parser")

        new_dl = factory.new_tag("dl")
        if dl.get("class"):
            new_dl["class"] = dl.get("class")

        current_dd: Tag | None = None      # <dd> of the current top-level item
        nested_dl: Tag | None = None       # sub-list inside current_dd, if any
        pending_sub_dd: Tag | None = None  # sub-item <dd> awaiting its body

        def open_top_item(marker: str) -> Tag:
            nonlocal current_dd, nested_dl, pending_sub_dd
            top_dt = factory.new_tag("dt")
            top_dt.string = marker
            new_dl.append(top_dt)
            current_dd = factory.new_tag("dd")
            new_dl.append(current_dd)
            nested_dl = None
            pending_sub_dd = None
            return current_dd

        for child in children:
            text = child.get_text(" ", strip=True)
            if child.name == "dt":
                # non-empty <dt> starts a new top-level item; an empty <dt> is
                # only a separator between sub-rows and is ignored.
                if text:
                    open_top_item(text)
                continue

            # <dd>
            if "td_2" in (child.get("class") or []):
                if current_dd is None:
                    open_top_item("")
                if nested_dl is None:
                    nested_dl = factory.new_tag("dl")
                    nested_dl["class"] = ["cf"]
                    current_dd.append(nested_dl)
                sub_dt = factory.new_tag("dt")
                sub_dt.string = text
                nested_dl.append(sub_dt)
                pending_sub_dd = factory.new_tag("dd")
                nested_dl.append(pending_sub_dd)
            elif pending_sub_dd is not None:
                # body of the sub-item just opened by a td_2 marker
                pending_sub_dd.string = text
                pending_sub_dd = None
            else:
                # top-level body, or shared suffix after a sub-list; both are
                # wrapped in <p> inside current_dd (suffix lands after nested_dl)
                if current_dd is None:
                    open_top_item("")
                para = factory.new_tag("p")
                para.string = text
                current_dd.append(para)

        return new_dl

    # -- footnotes --

    def _extract_footnotes(self, soup: BeautifulSoup) -> list[Footnote]:
        """Extract footnotes from <footer class="fussnoten">."""
        footer = soup.select_one("footer.fussnoten")
        if not footer:
            return []
        dl = footer.find("dl")
        if not dl:
            return []

        footnotes = []
        for dt, dd in zip(dl.find_all("dt"), dl.find_all("dd")):
            fn_nr = dt.get_text(strip=True)
            # in-document anchor id (e.g. "FNID_1"), used to locate the norm
            fn_id = dd.get("id", f"FNID_{fn_nr}")
            paragraph_nr, sub_paragraph_nr = self._find_footnote_paragraph(soup, fn_id)

            footnotes.append(
                Footnote(
                    # Footnote.id_ is the table primary key, but the source
                    # anchor id ("FNID_1") only identifies the footnote within a
                    # single law and repeats across laws. Namespace it with the
                    # per-document doknr so the key is globally unique.
                    id_=f"{self.doknr}_{fn_id}",
                    text=dd.get_text(strip=True),
                    jurabk=self.jurabk,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub_paragraph_nr,
                )
            )
        return footnotes

    def _find_footnote_paragraph(
        self, soup: BeautifulSoup, fn_id: str
    ) -> tuple[int | None, str]:
        """Find which paragraph a footnote belongs to."""
        link = soup.select_one(f'a.fussnote_link[href="#{fn_id}"]')
        if not link:
            return None, ""
        parent_section = link.find_parent("section")
        if not parent_section:
            return None, ""
        link_match = PARAGRAPH_LINK_PATTERN.match(parent_section.get("data-link", ""))
        if not link_match:
            return None, ""
        return int(link_match.group(1)), link_match.group(2)

    def _attach_footnotes(self, soup: BeautifulSoup, normen: list[Norm]):
        """Attach footnotes to their respective norms."""
        footnotes = self._extract_footnotes(soup)
        norms_by_key = {(n.paragraph_nr, n.sub_paragraph_nr): n for n in normen}
        for fn in footnotes:
            norm = norms_by_key.get((fn.paragraph_nr, fn.sub_paragraph_nr))
            if norm:
                if norm.fussnoten is None:
                    norm.fussnoten = []
                norm.fussnoten.append(fn)

