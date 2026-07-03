"""Process class for HTML laws"""

import logging
import re
from datetime import date
from pathlib import Path

import httpx
from bs4 import BeautifulSoup, Tag

from db_pipelines.parsers.base_processor import BaseProcessor
from db_pipelines.parsers.utils.sentence_split import get_absatz_nr, process_absatz, smart_split_sentences
from db_pipelines.parsers.utils.time import get_current_time
from db_pipelines.schemas.db import TOC, Absatz, Document, Norm, ParagraphTyp, Satz, Standangabe

GERMAN_MONTHS = {
    "Januar": 1,
    "Februar": 2,
    "März": 3,
    "April": 4,
    "Mai": 5,
    "Juni": 6,
    "Juli": 7,
    "August": 8,
    "September": 9,
    "Oktober": 10,
    "November": 11,
    "Dezember": 12,
}

DATE_PATTERN = re.compile(r"[Vv]om\s+(\d{1,2})\.\s+(\w+)\s+(\d{4})")
ABSATZ_NR_PATTERN = re.compile(r"^\(\d+\w?\)")
ANCHOR_PATTERN = re.compile(r"^(\d+)([a-z]*)$")
PARAGRAPH_NR_PATTERN = re.compile(r"§\s*(\d+)(\s*[a-z])?")  # matches "§ 1", "§ 16a" etc.

# Config doktyp values (singular) -> URL path segments (plural)
DOKTYP_PATH_MAP = {
    "gesetz": "gesetze",
    "verordnung": "verordnungen",
    "verwaltungsvorschrift": "verwaltungsvorschriften",
}

logger = logging.getLogger(__name__)


class BsProcessor1(BaseProcessor):
    """Class for processing laws from HTML sources"""

    jurabk: str | None = None

    @property
    def doktyp_path(self) -> str:
        return DOKTYP_PATH_MAP.get(self.doctype, "gesetze")

    @property
    def doknr(self) -> str:
        return f"{self.jurabk or self.slug}"

    def _fetch_doc(self) -> None:
        """Download the law HTML."""
        url = f"{self.base_url}/{self.doktyp_path}/{self.slug}"
        response = httpx.get(url)
        response.raise_for_status()
        self._get_doc().write_text(response.text, encoding="utf-8")

    def _get_doc(self) -> Path:
        return self.norm_dir / f"{self.slug}.html"

    # -- main parse entry point --

    def _parse_doc(self, doc=None) -> Document:
        """Parse the HTML into a Document object."""
        soup = BeautifulSoup(self._get_doc().read_text(encoding="utf-8"), "html.parser")

        jurabk, langue, kurzue = self._extract_metadata(soup)
        jurabk = self.suffixed_jurabk(jurabk)
        self.jurabk = jurabk

        normen = self._extract_norms(soup)

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

        Supports two title patterns:
        - "Langue (Kurzue - Jurabk)"  e.g. "Gesetz zum Schutz ... (Datenschutzgesetz - DSG)"
        - "Langue (Jurabk)"           e.g. "Abfall- und Bodenschutzgesetz (AbfBodG)"
        """
        h2 = soup.find("h2", id="norm_title")
        full_text = h2.get_text(strip=True) if h2 else ""

        jurabk_raw = ""
        kurzue = ""

        # Try pattern with dash first: "... (Kurzue - Jurabk)"
        match = re.search(r"\((.+?)\s*-\s*(\S+)\s*\)\s*$", full_text)
        if match:
            kurzue = match.group(1).strip()
            jurabk_raw = match.group(2)
        else:
            # Fallback: single abbreviation in parens "... (Jurabk)"
            match = re.search(r"\((\S+)\)\s*$", full_text)
            if match:
                jurabk_raw = match.group(1)

        # langue = everything before the parenthetical
        langue = re.sub(r"\s*\(.*\)\s*$", "", full_text).strip()

        # If no kurzue was extracted (Format B), use langue as kurzue
        if not kurzue:
            kurzue = langue

        if jurabk_raw:
            jurabk = jurabk_raw
        else:
            jurabk = self.slug
        return jurabk, langue, kurzue

    def _extract_fundstelle(self, soup: BeautifulSoup) -> str:
        """Extract Fundstelle (GVBl reference) from reiterbox_innen_kopf."""
        kopf = soup.find("div", class_="reiterbox_innen_kopf")
        if not kopf:
            return ""
        # Collect GVBl link texts
        links = kopf.find_all("a", class_="gvbi")
        if links:
            return ", ".join(a.get_text(strip=True) for a in links)
        return ""

    def _extract_ausfertigung_datum(self, soup: BeautifulSoup) -> date | None:
        """Extract the Ausfertigung date from reiterbox_innen_kopf."""
        kopf = soup.find("div", class_="reiterbox_innen_kopf")
        if not kopf:
            return None
        text = kopf.get_text()
        match = DATE_PATTERN.search(text)
        if not match:
            return None
        month = GERMAN_MONTHS.get(match.group(2))
        if not month:
            return None
        return date(int(match.group(3)), month, int(match.group(1)))

    def _extract_eingangsformel(self, soup: BeautifulSoup) -> str:
        """Extract Eingangsformel (preamble) from text before the first paragraph.

        Verordnungen often have a preamble like:
        "Auf Grund ... verordnet die Landesregierung:"
        Gesetze may have "Der Landtag hat das folgende Gesetz beschlossen:"
        """
        text_div = soup.find("div", class_="reiterbox_innen_text")
        if not text_div:
            return ""

        # Find the region between Inhaltsübersicht/title block and first § heading
        collecting = False
        parts = []
        for elem in text_div.children:
            if not isinstance(elem, Tag):
                continue

            elem_text = elem.get_text(strip=True)

            # Stop at first § heading (h4 containing "§")
            if elem.name == "h4" and "§" in elem_text:
                break

            # Skip everything up to and including the Inhaltsübersicht
            if not collecting:
                # Skip title block (bold p with date)
                if elem.name == "p" and elem.find("strong") and DATE_PATTERN.search(elem_text):
                    continue
                # Inhaltsübersicht marks start of TOC — skip it and everything in TOC
                if "Inhaltsübersicht" in elem_text:
                    collecting = "skip_toc"
                    continue
                # No TOC found yet — collect preamble content (e.g. "Der Landtag...")
                if elem.name in ("p", "ol") and not elem.find("strong"):
                    text = elem.get_text(" ", strip=True)
                    if text:
                        parts.append(text)
                continue

            if collecting == "skip_toc":
                # TOC entries are p and h3/h4 elements — skip until we hit
                # a non-TOC element (p without § link pattern after TOC section)
                if elem.name in ("h3", "h4"):
                    continue
                if elem.name == "p" and elem.find("a", href=True):
                    continue
                if elem.name == "p" and re.match(r"§\s*\d+", elem_text):
                    continue
                # End of TOC — start collecting preamble
                collecting = True

            if collecting is True and elem.name in ("p", "ol"):
                text = elem.get_text(" ", strip=True)
                if text:
                    parts.append(text)

        if not parts:
            return ""

        return " ".join(parts).strip()

    def _extract_standangaben(self, soup: BeautifulSoup) -> list[Standangabe]:
        """Extract Standangaben (amendment history) from the /list page.

        The list page contains a table.historie with columns:
        - Änderung und geänderte Gesamtfassung
        - Fundstelle der Änderung
        """
        url = f"{self.base_url}/{self.doktyp_path}/{self.slug}/list"
        cached = self._get_doc().with_stem("standangaben")
        if not cached.exists():
            try:
                response = httpx.get(url)
                response.raise_for_status()
                list_soup = BeautifulSoup(response.text, "html.parser")
            except httpx.HTTPError:
                logger.warning("Could not fetch amendment history from %s", url, exc_info=True)
                return []
        else:
            with open(cached) as f:
                list_soup = BeautifulSoup(f.read(), "html.parser")

        table = list_soup.find("table", class_="historie")
        if not table:
            return []

        standangaben = []
        for row in table.find_all("tr")[1:]:  # skip header row
            cells = row.find_all("td")
            if len(cells) < 2:
                continue
            change = re.sub(r"\s+", " ", cells[0].get_text(strip=True)).strip()
            fundstelle = re.sub(r"\s+", " ", cells[1].get_text(strip=True)).strip()
            if not change:
                continue
            standkommentar = f"{change} ({fundstelle})" if fundstelle else change
            standangaben.append(
                Standangabe(
                    standtyp="Stand",
                    standkommentar=standkommentar,
                    doknr=self.doknr,
                )
            )

        return standangaben

    # -- TOC extraction --

    def _extract_toc(self, soup: BeautifulSoup) -> list[TOC]:
        """Extract table of contents from the main text area."""
        toc_entries = []
        current_gliederung = ""

        text_div = soup.find("div", class_="reiterbox_innen_text")
        if not text_div:
            return []

        # Find TOC section: look for Inhaltsübersicht header
        toc_start = None
        for elem in text_div.children:
            if not isinstance(elem, Tag):
                continue
            # BbgDSG: <p style="text-align: center;"><strong>Inhaltsübersicht</strong></p>
            if elem.name == "p" and elem.find("strong"):
                if "Inhaltsübersicht" in elem.get_text():
                    toc_start = elem
                    break
            # BbgNatSchAG: <h2>Inhaltsübersicht</h2>
            if elem.name == "h2" and "Inhaltsübersicht" in elem.get_text():
                toc_start = elem
                break

        if not toc_start:
            return []

        # Iterate siblings after TOC header until we hit the first norm h4 with anchor
        for sib in toc_start.find_next_siblings():
            if not isinstance(sib, Tag):
                continue

            # Stop at first norm paragraph (h4 with § in text or anchor)
            if sib.name == "h4":
                sib_text = sib.get_text(strip=True)
                if sib.find("a", attrs={"name": True}) or PARAGRAPH_NR_PATTERN.match(sib_text):
                    break
            # Also stop at h3 with span.abschnitt_ueberschrift (section heading in body)
            if sib.name == "h3" and sib.find("span", class_="abschnitt_ueberschrift"):
                break

            if sib.name == "h3":
                # Section heading in TOC
                current_gliederung = sib.get_text(separator=" ", strip=True)
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
            elif sib.name == "h4":
                # Subsection heading in TOC (e.g. "Unterabschnitt 1")
                sub_title = sib.get_text(separator=" ", strip=True)
                toc_entries.append(
                    TOC(
                        gliederungsbezug=current_gliederung,
                        gliederungstitel=sub_title,
                        paragraph_typ=None,
                        paragraph_nr=None,
                        text=sub_title,
                        jurabk=self.jurabk,
                        doknr=self.doknr,
                    )
                )
            elif sib.name == "p":
                # Paragraph entries in TOC
                link = sib.find("a", href=True)
                if link:
                    # BbgDSG format: <p class="br2_inner_index"><a href="#N">§ N Title</a></p>
                    link_text = link.get_text(strip=True)
                    par_match = re.match(r"§\s*(\d+\w*)\s*(.*)", link_text)
                    if par_match:
                        par_nr = par_match.group(1)
                        title_text = par_match.group(2)
                        toc_entries.append(
                            TOC(
                                gliederungsbezug=current_gliederung,
                                gliederungstitel=title_text,
                                paragraph_typ=ParagraphTyp.SINGLE,
                                paragraph_nr=par_nr,
                                text=link_text,
                                jurabk=self.jurabk,
                                doknr=self.doknr,
                            )
                        )

        return toc_entries

    # -- norm extraction --

    def _extract_paragraph_nr(self, h4: Tag) -> tuple[int, str] | None:
        """Extract paragraph number from an h4 element.

        Supports two formats:
        - With anchor: <h4><a name="16a">...</a>§ 16a Title</h4>
        - Without anchor: <h4>§ 16a Title</h4>
        """
        anchor = h4.find("a", attrs={"name": True})
        if anchor:
            match = ANCHOR_PATTERN.match(anchor["name"])
            if match:
                return int(match.group(1)), match.group(2)

        # Fallback: extract from text "§ N" or "§ Na"
        text = h4.get_text(strip=True)
        match = PARAGRAPH_NR_PATTERN.match(text)
        if match:
            nr = int(match.group(1))
            sub = match.group(2).strip() if match.group(2) else ""
            return nr, sub

        return None

    def _extract_norms(self, soup: BeautifulSoup) -> list[Norm]:
        """Extract all norms (paragraphs) from the law body."""
        norms = []
        for h4 in soup.find_all("h4"):
            result = self._extract_paragraph_nr(h4)
            if not result:
                continue

            paragraph_nr, sub_paragraph_nr = result

            titel = self._extract_title(h4)

            # Check for weggefallen/aufgehoben
            if "(weggefallen)" in titel or "(aufgehoben)" in titel:
                weggefallen_text = "(aufgehoben)" if "(aufgehoben)" in titel else "(weggefallen)"
                norms.append(
                    Norm(
                        titel=weggefallen_text,
                        doknr=self.doknr,
                        jurabk=self.jurabk,
                        paragraph_nr=paragraph_nr,
                        sub_paragraph_nr=sub_paragraph_nr,
                        paragraph_text=weggefallen_text,
                        paragraph_typ=ParagraphTyp.SINGLE,
                        absaetze=[],
                    )
                )
                continue

            # Collect content elements between this h4 and the next h4/h3
            content_elements = self._collect_content_elements(h4)
            absaetze = self._extract_absaetze(content_elements, paragraph_nr, sub_paragraph_nr)
            paragraph_text = " ".join(a.absatz_text for a in absaetze if a.absatz_text)

            norms.append(
                Norm(
                    titel=titel,
                    doknr=self.doknr,
                    jurabk=self.jurabk,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub_paragraph_nr,
                    paragraph_text=paragraph_text,
                    paragraph_typ=ParagraphTyp.SINGLE,
                    absaetze=absaetze,
                )
            )
        return norms

    def _extract_title(self, h4: Tag) -> str:
        """Extract the paragraph title from the <h4> element.

        Handles both formats:
        - New: <h4 class="paragraph_bez">...<span class="paragraph_ueberschrift">Title</span></h4>
        - Old: <h4 align="center"><a name="N"></a>§ N<br/>Title</h4>
        """
        # New format: look for span.paragraph_ueberschrift
        span = h4.find("span", class_="paragraph_ueberschrift")
        if span:
            return span.get_text(strip=True)

        # Old format: title is text after <br/>
        br = h4.find("br")
        if br:
            parts = []
            for sibling in br.next_siblings:
                if isinstance(sibling, Tag):
                    parts.append(sibling.get_text(strip=True))
                else:
                    text = str(sibling).strip()
                    if text:
                        parts.append(text)
            title = " ".join(parts).strip()
            if title:
                return title

        # Fallback: remove § N from full text
        full_text = h4.get_text(strip=True)
        return re.sub(r"^§\s*\d+\w*\s*", "", full_text).strip()

    def _collect_content_elements(self, h4: Tag) -> list[Tag]:
        """Collect <p>, <ol> and <ul> elements between this h4 and the next h4/h3."""
        elements = []
        for sib in h4.find_next_siblings():
            if not isinstance(sib, Tag):
                continue
            if sib.name in ("h4", "h3", "h2"):
                break
            if sib.name == "p":
                # Skip einzelnorm links and empty paragraphs
                if "einzelnorm" in (sib.get("class") or []):
                    continue
                text = sib.get_text(strip=True)
                if not text or text == "Einzelnorm":
                    continue
                elements.append(sib)
            elif sib.name in ("ol", "ul"):
                elements.append(sib)
        return elements

    # -- absatz extraction --

    def _extract_absaetze(self, content_elements: list[Tag], paragraph_nr: int, sub_paragraph_nr: str) -> list[Absatz]:
        """Extract Absätze from content elements.

        Splits content_elements on <p>"(N)..." markers; each chunk forms one Absatz
        whose body (intro + trailing <p>/<ol> blocks) is converted to Sätze via the
        HTML structure rather than freetext sentence-splitting.
        """
        chunks = self._chunk_by_absatz(content_elements)

        absaetze: list[Absatz] = []
        counter = 0
        for chunk_marker, blocks in chunks:
            if chunk_marker is None:
                counter += 1
                absatz_nr = str(counter)
                prefix = ""
                rest_blocks = blocks
            else:
                first_text = re.sub(r" {2,}", " ", blocks[0].get_text(" ", strip=True))
                try:
                    absatz_nr, prefix = get_absatz_nr(first_text)
                except ValueError:
                    counter += 1
                    absatz_nr = str(counter)
                    prefix = first_text
                else:
                    nr_match = re.match(r"(\d+)", absatz_nr)
                    if nr_match:
                        counter = int(nr_match.group(1))
                rest_blocks = blocks[1:]

            saetze, absatz_text = self._build_saetze_with_lists(prefix, rest_blocks)
            if not saetze and not absatz_text:
                continue
            absaetze.append(
                Absatz(
                    absatz_nr=absatz_nr,
                    absatz_text=absatz_text,
                    jurabk=self.jurabk,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub_paragraph_nr,
                    saetze=saetze,
                )
            )

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

    @staticmethod
    def _chunk_by_absatz(content_elements: list[Tag]) -> list[tuple[Tag | None, list[Tag]]]:
        """Group content elements into per-Absatz chunks.

        Each <p> starting with "(N)" opens a new chunk; subsequent <p>/<ol>/<ul>
        blocks are appended to the current chunk until the next "(N)" marker.
        Leading non-numbered blocks form an initial chunk with marker=None (used
        for §§ with a single un-numbered Absatz).
        """
        chunks: list[tuple[Tag | None, list[Tag]]] = []
        for elem in content_elements:
            if elem.name == "p":
                text = elem.get_text(" ", strip=True)
                if ABSATZ_NR_PATTERN.match(text):
                    chunks.append((elem, [elem]))
                    continue
            if chunks:
                chunks[-1][1].append(elem)
            else:
                chunks.append((None, [elem]))
        return chunks

    def _build_saetze_with_lists(self, prefix: str, blocks: list[Tag]) -> tuple[list[Satz], str]:
        """Build Sätze and absatz_text from an intro string plus <p>/<ol>/<ul> blocks.

        <p> blocks before any list accumulate into the intro; an <ol>/<ul>
        turns the intro plus each <li> into a Satz (numbered <ol> markers like ["1"];
        <ul> markers disambiguated as ["1. –"]); nested lists inside an <li> recurse and
        emit one Satz per leaf with combined markers like ["2", "a"]. <p>
        blocks after the list become plain continuation sentences (no markers,
        satz_nr=2,3,…). Without any list block the intro is sentence-split via
        process_absatz, preserving the prior behaviour for plain absätze.
        """
        saetze: list[Satz] = []
        intro = prefix
        list_seen = False
        continuation_nr = 2
        text_parts: list[str] = [prefix] if prefix else []
        pending_list_indices: list[int] = []

        for block in blocks:
            if block.name in ("ol", "ul"):
                list_saetze = self._list_to_saetze(block, intro, parent_markers=[])
                start = len(saetze)
                saetze.extend(list_saetze)
                pending_list_indices = list(range(start, len(saetze)))
                list_seen = True
                intro = ""
                list_text = self._list_to_text(block)
                if list_text:
                    text_parts.append(list_text)
                continue

            text = block.get_text(" ", strip=True)
            text = re.sub(r" {2,}", " ", text)
            if not text:
                continue
            text_parts.append(text)
            if list_seen:
                sentences = smart_split_sentences(text)
                if pending_list_indices and sentences and sentences[0][:1].islower():
                    suffix = re.sub(r"[,;\s]+$", "", re.sub(r"\.\s*$", "", sentences[0])).strip()
                    if suffix:
                        for idx in pending_list_indices:
                            s = saetze[idx]
                            body = re.sub(r"[,;\s]+$", "", s.satz_text.rstrip(".")).rstrip()
                            body = re.sub(r"\b(und|oder)\s*$", "", body, flags=re.IGNORECASE).strip()
                            s.satz_text = f"{body} {suffix}"
                            if not s.satz_text.endswith("."):
                                s.satz_text += "."
                    sentences = sentences[1:]
                pending_list_indices = []
                for sent in sentences:
                    sent = sent.strip()
                    if not sent:
                        continue
                    if not sent.endswith("."):
                        sent += "."
                    saetze.append(
                        Satz(
                            satz_id=len(saetze) + 1,
                            satz_nr=continuation_nr,
                            satz_text=sent,
                        )
                    )
                    continuation_nr += 1
            else:
                intro = (intro + " " + text).strip() if intro else text

        if not list_seen:
            saetze = process_absatz(intro) if intro.strip() else []

        # satz_id is the pure integer index of the sentence within the
        # Absatz; renumber at the end so absätze that combine multiple lists
        # (or fall through to process_absatz) keep unique ids.
        for idx, satz in enumerate(saetze, start=1):
            satz.satz_id = idx

        absatz_text = "\n".join(p for p in text_parts if p).strip()
        absatz_text = re.sub(r"[ \t]{2,}", " ", absatz_text)
        return saetze, absatz_text

    def _list_to_saetze(self, list_tag: Tag, intro: str, parent_markers: list[str]) -> list[Satz]:
        """Convert an <ol> or <ul> into Sätze, recursing into nested lists.

        Each <li> joins the surrounding intro with the item text to form a
        Satz; if the <li> contains a nested <ol>/<ul>, intro and pre-list text
        propagate down and any post-list text is appended to each leaf sentence.
        markers are accumulated across nesting levels (outer "2" + inner "a"
        → ["2", "a"]). For a <ul> all items share the same source marker
        ("–"), so they are disambiguated as "1. –", "2. –", …
        """
        intro_clean = re.sub(r",\s*$", "", intro).rstrip() if intro else ""
        items = list_tag.find_all("li", recursive=False)
        if not items:
            return []

        markers_raw = self._raw_markers_for_list(list_tag, items)

        saetze: list[Satz] = []
        for raw_marker, li in zip(markers_raw, items):
            marker = self._strip_marker(raw_marker)
            child_markers = parent_markers + [marker]

            inner_list = li.find(["ol", "ul"], recursive=False)
            if inner_list is not None:
                before_text, after_text = self._split_li_around_inner_list(li, inner_list)
                inner_intro_clean = re.sub(r",\s*$", "", before_text).rstrip()
                inner_intro = (intro_clean + " " + inner_intro_clean).strip() if intro_clean else inner_intro_clean
                sub_saetze = self._list_to_saetze(inner_list, inner_intro, child_markers)
                inner_suffix = re.sub(r"[,;\s]+$", "", after_text.strip()).rstrip()
                if inner_suffix:
                    for s in sub_saetze:
                        body = re.sub(r"[,;\s]+$", "", s.satz_text.rstrip(".")).rstrip()
                        body = re.sub(r"\b(und|oder)\s*$", "", body, flags=re.IGNORECASE).strip()
                        s.satz_text = f"{body} {inner_suffix}"
                        if not s.satz_text.endswith("."):
                            s.satz_text += "."
                saetze.extend(sub_saetze)
                continue

            item_text = re.sub(r"\s{2,}", " ", li.get_text(" ", strip=True))
            item_text = re.sub(r"[,;]\s*$", "", item_text).strip()
            item_text = re.sub(r"\b(und|oder)\s*$", "", item_text, flags=re.IGNORECASE).strip()
            if not item_text:
                continue
            sentence = (intro_clean + " " + item_text).strip() if intro_clean else item_text
            if not sentence.endswith("."):
                sentence += "."
            saetze.append(
                Satz(
                    satz_id=len(saetze) + 1,
                    satz_nr=1,
                    markers=child_markers,
                    satz_text=sentence,
                )
            )
        return saetze

    @staticmethod
    def _split_li_around_inner_list(li: Tag, inner_list: Tag) -> tuple[str, str]:
        """Return (text before inner list, text after inner list) for an <li>.

        Used when an <li> wraps both its own intro/suffix text and a nested
        <ol>/<ul>. Walks the child nodes of the <li> in order and partitions
        them by their position relative to inner_list.
        """
        before: list[str] = []
        after: list[str] = []
        seen_inner = False
        for child in li.children:
            if isinstance(child, Tag):
                if child is inner_list:
                    seen_inner = True
                    continue
                t = child.get_text(" ", strip=True)
            else:
                t = str(child).strip()
            if not t:
                continue
            (after if seen_inner else before).append(t)
        return " ".join(before), " ".join(after)

    @staticmethod
    def _raw_markers_for_list(list_tag: Tag, items: list[Tag]) -> list[str]:
        """Return one raw marker string per <li>.

        For <ol> the marker reflects the item index (honouring `start="N"`
        and lower-alpha styling); for <ul> all items share "–" which the
        caller disambiguates into "1. –", "2. –", … via _strip_marker.
        """
        if list_tag.name == "ul":
            if len(items) == 1:
                return ["–"]
            return [f"{i + 1}. –" for i in range(len(items))]

        try:
            start = int(list_tag.get("start") or 1)
        except (TypeError, ValueError):
            start = 1

        if BsProcessor1._is_alpha_list(list_tag):
            return [f"{chr(ord('a') + (start - 1) + i)})" for i in range(len(items))]
        return [f"{start + i}." for i in range(len(items))]

    @staticmethod
    def _is_alpha_list(list_tag: Tag) -> bool:
        """True when an <ol> renders as a-z items (type='a' or list-style: lower-alpha)."""
        if list_tag.get("type") in ("a", "A"):
            return True
        style = list_tag.get("style") or ""
        return "lower-alpha" in style.lower() or "upper-alpha" in style.lower()

    _MARKER_STRIP_RE = re.compile(r"[\.\)]+$")

    @classmethod
    def _strip_marker(cls, raw: str) -> str:
        """Normalise a list marker: '1.' → '1', 'a)' → 'a', '–' → '–', '1. –' → '1. –'."""
        return cls._MARKER_STRIP_RE.sub("", raw.strip())

    def _list_to_text(self, list_tag: Tag, indent: str = "") -> str:
        """Render an <ol>/<ul> (with nested lists) as multi-line text for absatz_text.

        Each item starts on its own line prefixed with its raw marker; nested
        lists indent by 3 spaces; pre/post-list text inside an <li> stays
        attached to the parent item line / following indented line so the
        combined block remains readable.
        """
        items = list_tag.find_all("li", recursive=False)
        if not items:
            return ""
        markers_raw = self._raw_markers_for_list(list_tag, items)

        lines: list[str] = []
        for raw_marker, li in zip(markers_raw, items):
            inner_list = li.find(["ol", "ul"], recursive=False)
            if inner_list is not None:
                before_text, after_text = self._split_li_around_inner_list(li, inner_list)
                lines.append(f"{indent}{raw_marker} {before_text}".rstrip())
                inner_block = self._list_to_text(inner_list, indent + "   ")
                if inner_block:
                    lines.append(inner_block)
                if after_text:
                    lines.append(f"{indent}   {after_text}")
            else:
                text = re.sub(r"\s{2,}", " ", li.get_text(" ", strip=True))
                if text:
                    lines.append(f"{indent}{raw_marker} {text}")
        return "\n".join(lines)
