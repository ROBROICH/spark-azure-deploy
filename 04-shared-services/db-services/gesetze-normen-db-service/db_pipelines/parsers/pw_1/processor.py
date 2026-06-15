import json
import logging
import re
from dataclasses import asdict, dataclass
from datetime import date, datetime
from typing import Any, override

from bs4 import BeautifulSoup, Tag
from db_services_shared.utils.parsing import split_paragraph_nr_str
from playwright.sync_api import Page, sync_playwright

from db_pipelines.parsers.base_processor import BaseProcessor
from db_pipelines.parsers.utils.absatz_blocks import (
    parse_absatz_blocks as _parse_absatz_blocks,
    tag_to_text as _tag_to_text,
)
from db_pipelines.parsers.utils.xml import xml_html_elem_to_md
from db_pipelines.parsers.utils.time import get_current_time, german_to_english_month
from db_pipelines.schemas.db import (
    TOC,
    Absatz,
    Anlage,
    DocType,
    Document,
    Hierarchy,
    Norm,
    ParagraphTyp,
    Standangabe,
)

logger = logging.getLogger(__name__)

# React SPA: `domcontentloaded` only fires on the shell, actual
# content is hydrated afterward. We wait on selectors that exist only once
# meaningful content is in the DOM — either a rendered document body
# (norm/rahmen/anlage/eingangsformel pages) or sidebar jlr-links (IVZ pages).
CONTENT_READY_SELECTOR = (
    "article.docbody h3, article.docbody .doc-body__text, article.docbody .docLayoutText, a[href*='/document/jlr-']"
)
PAGE_TIMEOUT_MS = 30_000
NBSP = "\xa0"

@dataclass
class TitleEntry:
    """header and Title data"""
    langue: str
    kurzue: str | None
    ausfertigung_datum: date | None

@dataclass
class TocEntry:
    """One row from the IVZ table."""

    kind: str  # "section" | "norm" | "anlage" | "eingangsformel"
    doc_id: str
    label: str  # e.g. "§ 2 Begriffsbestimmungen" or "Abschnitt I Allgemeine Vorschriften"
    section_label: str  # inherited section breadcrumb for norms


class PwProcessor1(BaseProcessor):
    """Process Landesrecht laws via a installation.

    `base_url` is injected via BaseProcessor; `portal_id` must be provided in `extra`; 
    """

    portal_id: str

    def __init__(self, slug: str, doctype: DocType, **kwargs) -> None:
        if 'portal_id' not in kwargs:
            raise ValueError("`portal_id` must be provided in `extra` config for PwProcessor1")
        self.portal_id: str = kwargs.pop('portal_id')
        # bundesland is injected from the config (NormSpec.bundesland)
        super().__init__(slug, doctype, **kwargs)

    def _get_doc(self) -> str:
        gesamtausgabe = self.norm_dir / "gesamtausgabe.html"
        if not gesamtausgabe.exists():
            raise FileNotFoundError(f"No fetched data at {gesamtausgabe}")
        return gesamtausgabe.read_text(encoding="utf-8")

    @override
    def parse_doc(self, doc: Any | None = None, **kwargs) -> Document:
        """
        override BaseProcessor because of single page fallback
        """
        self.fetch_doc(
            overwrite=kwargs["overwrite"] if "overwrite" in kwargs else False
        )
        return self._parse_doc(doc)

    def _fetch_by_page(self, rahmen_id: str | None = None) -> None:
        if rahmen_id is None:
            rahmen_id = f"jlr-{self.slug}rahmen"
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(
                locale="de-DE",
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                extra_http_headers={"Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"},
            )
            page = ctx.new_page()

            try:
                logger.info(f"[{self.bundesland}] Fetching rahmen page: {rahmen_id}")
                rahmen_html = self._fetch_page(page, rahmen_id)

                (self.norm_dir / f"{rahmen_id}.html").write_text(rahmen_html, encoding="utf-8")

                ivz_id = self._find_ivz_id_on_page(page)

                if ivz_id is None:
                    logger.info(f"[{self.bundesland}] No dedicated IVZ link found in rahmen, waiting for sidebar...")
                    try:
                        page.wait_for_selector('a[href*="/document/jlr-"]', state="attached", timeout=10000)
                        page.wait_for_timeout(3000)
                    except Exception:
                        pass
                    self._expand_toc_accordion(page)
                    ivz_id = self._find_ivz_id_on_page(page) or rahmen_id
                    ivz_html = page.content()
                    # update rahmen too since sidebar might have loaded
                    rahmen_html = ivz_html
                else:
                    logger.info(f"[{self.bundesland}] Found IVZ link: {ivz_id}. Fetching dedicated IVZ page.")
                    ivz_html = self._fetch_page(page, ivz_id)

                # Step 2: Parse TOC
                toc = self._parse_ivz(ivz_html)

                # Fallback if IVZ was empty but we have rahmen sidebar
                if not any(e.kind == "norm" for e in toc) and ivz_id != rahmen_id:
                    logger.info(f"[{self.bundesland}] IVZ page yielded no norms. Trying rahmen sidebar.")
                    self._fetch_page(page, rahmen_id)
                    try:
                        page.wait_for_selector('a[href*="/document/jlr-"]', state="attached", timeout=10000)
                        page.wait_for_timeout(3000)
                    except Exception:
                        pass
                    self._expand_toc_accordion(page)
                    ivz_html = page.content()
                    toc = self._parse_ivz(ivz_html)

                # Fallback: some laws (e.g. BW DSchGBW1983) expose only section
                # links in the sidebar — actual §-paragraph links live one level
                # deeper, behind each section page. Recurse into sections to
                # harvest pP norms. Runs also on mixed TOCs because
                # collapses §-ranges into "Ebene öffnen" group links whose
                # individual §§ only appear after descending into them.
                if any(e.kind == "section" for e in toc):
                    logger.info(f"[{self.bundesland}] TOC has only sections, descending into them to find norms.")
                    section_entries = [e for e in toc if e.kind == "section"]
                    section_html_cache: dict[str, str] = {}
                    harvested: list[TocEntry] = []
                    seen_ids: set[str] = {e.doc_id for e in toc}
                    for sec in section_entries:
                        html = self._fetch_page(page, sec.doc_id)
                        section_html_cache[sec.doc_id] = html
                        for entry in self._extract_norms_from_section(html, sec.label):
                            if entry.doc_id in seen_ids:
                                continue
                            seen_ids.add(entry.doc_id)
                            harvested.append(entry)
                    # cache the fetched section pages so _parse_doc can re-read them if needed
                    for sid, shtml in section_html_cache.items():
                        (self.norm_dir / f"{sid}.html").write_text(shtml, encoding="utf-8")
                    # interleave harvested norms after their section in toc order
                    merged: list[TocEntry] = []
                    norms_by_section: dict[str, list[TocEntry]] = {}
                    for n in harvested:
                        norms_by_section.setdefault(n.section_label, []).append(n)
                    for e in toc:
                        merged.append(e)
                        if e.kind == "section":
                            merged.extend(norms_by_section.get(e.label, []))
                    toc = merged
                    logger.info(f"[{self.bundesland}] Recursive descent harvested {len(harvested)} norm entries.")

                logger.info(f"[{self.bundesland}] Final TOC extracted: {len(toc)} entries.")

                if not any(e.kind in ("norm", "anlage") for e in toc):
                    raise ValueError(
                        f"[{self.bundesland}] No norms or anlagen found for slug '{self.slug}' — "
                        f"IVZ/sidebar discovery yielded only sections or empty TOC."
                    )

                # Step 3: Load Einzelnormen, Anlagen und Eingangsformel
                to_fetch: dict[str, TocEntry] = {
                    e.doc_id: e for e in toc if e.kind in ("norm", "anlage", "eingangsformel")
                }
                logger.info(f"[{self.bundesland}] Fetching {len(to_fetch)} individual norm/anlage pages.")
                for doc_id in to_fetch:
                    html = self._fetch_page(page, doc_id)
                    (self.norm_dir / f"{doc_id}.html").write_text(html, encoding="utf-8")

            finally:
                browser.close()

        (self.norm_dir / f"{rahmen_id}.html").write_text(rahmen_html, encoding="utf-8")
        if ivz_id != rahmen_id:
            (self.norm_dir / f"{ivz_id}.html").write_text(ivz_html, encoding="utf-8")

        manifest = {
            "slug": self.slug,
            "rahmen_id": rahmen_id,
            "ivz_id": ivz_id,
            "toc": [asdict(e) for e in toc],
        }
        (self.norm_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return

    def _fetch_doc(self) -> None:
        """Fetch via single-page Gesamtausgabe with fallbacks for all known quirks.

        Handles three known problems:
          1. perma?a= lands on search page  → fallback perma?j=…Inhaltsverzeichnis,
             then fallback _fetch_by_page().
          2. perma?a= lands on rahmen page  → navigate "Aktuelle Gesamtausgabe" tab.
          3. Client-side redirect → read docId from DOM, not URL.
        """
        fallback_to_by_page = False
        fallback_rahmen_id: str | None = None
        gesamtausgabe_html: str | None = None
        gesamtausgabe_id: str | None = None

        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            ctx = browser.new_context(
                locale="de-DE",
                user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
                extra_http_headers={"Accept-Language": "de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7"},
            )
            page = ctx.new_page()

            try:
                # --- Attempt 1: perma?a={slug} ---------------------------------
                logger.info(f"[{self.bundesland}] fetching gesamtausgabe perma?a={self.slug}")
                html = self._fetch_page_content(page, f"perma?a={self.slug}")
                rahmen_id = self._extract_doc_id_from_page(page) or page.url.split("/")[-1]

                if self._is_search_or_invalid_page(rahmen_id, html):
                    # Try permalink
                    logger.info(f"[{self.bundesland}] perma?a= led to search/invalid page, trying perma?j fallback")
                    html = self._fetch_page_content(page, f"perma?j={self.slug}")
                    rahmen_id = self._extract_doc_id_from_page(page) or page.url.split("/")[-1]

                    if self._is_search_or_invalid_page(rahmen_id, html):
                        resolved_rahmen_id: str | None = None

                        matching_hit = self._find_matching_search_result(page)

                        if not matching_hit:
                            logger.info(
                                f"[{self.bundesland}] no search hits visible, submitting explicit search for '{self.slug}'"
                            )
                            self._submit_search(page, self.slug)
                            matching_hit = self._find_matching_search_result(page)

                        if matching_hit:
                            m = re.search(r"/document/(jlr-[^/?]+)", matching_hit)
                            if m:
                                resolved_rahmen_id = m.group(1)
                                logger.info(f"[{self.bundesland}] resolved docId via search: {resolved_rahmen_id}")
                                html = self._fetch_page_content(page, matching_hit)
                                rahmen_id = resolved_rahmen_id

                        if self._is_search_or_invalid_page(rahmen_id, html):
                            logger.info(
                                f"[{self.bundesland}] all perma+search fallbacks failed → falling back to _fetch_by_page"
                            )
                            fallback_to_by_page = True
                            fallback_rahmen_id = resolved_rahmen_id

                if not fallback_to_by_page and not self._page_has_norm_blocks(html):
                    ges_url = self._find_gesamtausgabe_url(page)
                    if ges_url:
                        logger.info(f"[{self.bundesland}] rahmen page detected, navigating to Gesamtausgabe tab")
                        html = self._fetch_page_content(page, ges_url)
                        rahmen_id = self._extract_doc_id_from_page(page) or page.url.split("/")[-1]

                if not fallback_to_by_page:
                    gesamtausgabe_html = html
                    gesamtausgabe_id = rahmen_id

            finally:
                browser.close()

        if fallback_to_by_page:
            return self._fetch_by_page(rahmen_id=fallback_rahmen_id)

        assert gesamtausgabe_html is not None and gesamtausgabe_id is not None
        (self.norm_dir / "gesamtausgabe.html").write_text(gesamtausgabe_html, encoding="utf-8")
        manifest = {
            "slug": self.slug,
            "rahmen_id": gesamtausgabe_id,
            "ivz_id": gesamtausgabe_id,
            "gesamtausgabe_id": gesamtausgabe_id,
            "toc": [],
        }
        (self.norm_dir / "manifest.json").write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        return

    def _fetch_page_content(self, page: Page, endpoint: str) -> str:
        # Accept full URLs (e.g. from _find_gesamtausgabe_url) or relative endpoints
        url = endpoint if endpoint.startswith("http") else f"{self.base_url}/{endpoint}"
        page.goto(url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        try:
            page.wait_for_selector(CONTENT_READY_SELECTOR, timeout=PAGE_TIMEOUT_MS)
        except Exception:
            pass
        return page.content()

    def _fetch_page(self, page: Page, doc_id: str) -> str:
        url = f"{self.base_url}/{self.portal_id}/document/{doc_id}/format/xsl"
        return self._fetch_page_content(page, url)

    @staticmethod
    def _extract_doc_id_from_page(page: Page) -> str | None:
        """Read jlr-docId from DOM because URL still shows ?a=slug after client-side redirect."""
        js = """() => {
            const a = document.querySelector('a[name^="jlr-"]');
            if (a) return a.getAttribute('name');
            const url = new URL(window.location.href);
            const docId = url.searchParams.get('docId');
            if (docId) return docId;
            return null;
        }"""
        return page.evaluate(js)

    @staticmethod
    def _is_search_or_invalid_page(rahmen_id: str, html: str) -> bool:
        """Return True when the page is the search page or otherwise unusable."""
        if "search" in rahmen_id.lower():
            return True
        soup = BeautifulSoup(html, "html.parser")
        # no jlr anchor at all → likely search or error page
        if not soup.select_one('a[name^="jlr-"]'):
            return True
        return False

    @staticmethod
    def _page_has_norm_blocks(html: str) -> bool:
        """True when the HTML contains actual norm content blocks (not just rahmen)."""
        soup = BeautifulSoup(html, "html.parser")
        for block in soup.find_all("div", class_="docLayoutMarginTop"):
            anchor = block.find("a", recursive=False)
            if anchor and (anchor.get("name") or "").startswith("jlr-"):
                return True
        return False

    def _matches_slug(self, doc_id: str) -> bool:
        """True iff doc_id encodes the law named by self.slug.

        docIds follow a deterministic scheme:
            jlr-{abbrev_without_underscores}[year][rahmen|pGn|Gn|Anlage|IVZ|ELS]
        We require the prefix `jlr-{stripped_slug}` followed by either a digit
        (year), a known suffix, or end-of-string. This rejects unrelated laws
        that merely cite our target.
        """
        stripped = self.slug.replace("_", "")
        return bool(
            re.match(
                rf"^jlr-{re.escape(stripped)}(?:$|\d|rahmen|pG|G\d|Anlage|IVZ|ELS)",
                doc_id,
            )
        )

    def _find_matching_search_result(self, page: Page) -> str | None:
        """Return href of first search hit whose docId matches our slug pattern.

        Prefers links that explicitly say "Gesamtausgabe" — this avoids
        landing on a rahmen page and then needing Problem 2 fallback.
        Falls back to norm-paragraph entries over rahmen/IVZ links.
        """
        js = """() => {
            const links = Array.from(document.querySelectorAll('a[href*="/document/jlr-"]'));
            return links.map(a => ({
                href: a.getAttribute('href'),
                text: (a.textContent || '').trim()
            })).filter(x => x.href);
        }"""
        link_infos: list[dict[str, str]] = page.evaluate(js)
        base = page.evaluate("() => window.location.origin")

        def absolute(h: str) -> str:
            return f"{base}{h}" if h.startswith("/") else h

        # Pass 1: prefer explicit Gesamtausgabe link
        for info in link_infos:
            href = info["href"]
            text = info.get("text", "")
            m = re.search(r"/document/(jlr-[^/?]+)", href)
            if not m:
                continue
            doc_id = m.group(1)
            if not self._matches_slug(doc_id):
                continue
            if "gesamtausgabe" in text.lower():
                return absolute(href)

        # Pass 2: any other matching link (prefer norm entries over rahmen/IVZ)
        matching: list[tuple[str, str]] = []
        for info in link_infos:
            href = info["href"]
            m = re.search(r"/document/(jlr-[^/?]+)", href)
            if not m:
                continue
            doc_id = m.group(1)
            if not self._matches_slug(doc_id):
                continue
            matching.append((doc_id, href))

        if not matching:
            return None

        for doc_id, href in matching:
            if "IVZ" not in doc_id and not doc_id.endswith("rahmen"):
                return absolute(href)
        return absolute(matching[0][1])

    def _submit_search(self, page: Page, query: str) -> None:
        """
        Used when perma?a= and perma?j= both fail to resolve the slug — the
        portal redirects to its homepage with nothing in the DOM.
        The search box is a Draft.js contenteditable div with
        ``aria-label="Eingabe in Schnellsuche"``; pressing Enter in Draft.js
        only inserts a newline, so we click the explicit "Suche starten"
        button instead.
        """
        home_url = f"{self.base_url}/{self.portal_id}/"
        page.goto(home_url, wait_until="domcontentloaded", timeout=PAGE_TIMEOUT_MS)
        try:
            page.wait_for_load_state("networkidle", timeout=10_000)
        except Exception:
            pass

        input_selectors = [
            '[aria-label="Eingabe in Schnellsuche"]',
            '[aria-label*="Schnellsuche"]',
            '[contenteditable="true"]',
            'input[type="search"]',
            'input[type="text"]',
        ]
        submit_selectors = [
            'button[aria-label="Suche starten"]',
            'button[title="Suche starten"]',
            'button[type="submit"]',
        ]

        input_el = None
        for sel in input_selectors:
            el = page.query_selector(sel)
            if el and el.is_visible():
                input_el = el
                logger.info(f"[{self.bundesland}] found search input via '{sel}'")
                break

        if input_el is None:
            logger.warning(f"[{self.bundesland}] could not find search input on {home_url}")
            return

        input_el.click()
        # search often works better without the underscore suffix.
        search_term = query.split("_")[0]
        page.keyboard.type(search_term, delay=20)

        for sel in submit_selectors:
            btn = page.query_selector(sel)
            if btn and btn.is_visible():
                logger.info(f"[{self.bundesland}] clicking submit button '{sel}'")
                btn.click()
                try:
                    # Wait for results page: URL change or a hit list rendering.
                    page.wait_for_url(re.compile(r".*/(search|jportal).*"), timeout=10_000)
                except Exception:
                    pass
                try:
                    page.wait_for_selector('a[href*="/document/jlr-"]', timeout=PAGE_TIMEOUT_MS)
                except Exception:
                    logger.warning(f"[{self.bundesland}] no search results visible after submit")
                return

        logger.warning(f"[{self.bundesland}] no submit button found, falling back to Enter")
        page.keyboard.press("Enter")
        try:
            page.wait_for_selector('a[href*="/document/jlr-"]', timeout=PAGE_TIMEOUT_MS)
        except Exception:
            pass

    @staticmethod
    def _find_gesamtausgabe_url(page: Page) -> str | None:
        """Return the href of the 'Aktuelle Gesamtausgabe' tab link, or None."""
        js = """() => {
            const link = Array.from(document.querySelectorAll('a')).find(a =>
                a.textContent.includes('Aktuelle Gesamtausgabe')
            );
            return link ? link.getAttribute('href') : null;
        }"""
        href = page.evaluate(js)
        if href and href.startswith("/"):
            base = page.evaluate("() => window.location.origin")
            return f"{base}{href}"
        return href

    @staticmethod
    def _parse_norms_from_complete_page(html: str) -> list[tuple[str, str, list[Tag], str]]:
        """Extract all norm blocks from a Gesamtausgabe (complete-law) page.

        Iterates over every ``div.docLayoutMarginTopMore`` block inside the
        document body. Blocks whose heading matches a norm pattern (§, Art.,
        Anlage, Eingangsformel) are yielded as
        ``(raw_bez, titel, content_blocks, section_label)`` tuples.
        Blocks with other headings (Abschnitt, Teil, …) update the running
        ``section_label`` but are not yielded.
        """
        soup = BeautifulSoup(html, "html.parser")
        layout = (
            soup.select_one("article.docbody div.docLayoutText div.docLayoutMarginTop")
            or soup.select_one("article.docbody div.docLayoutText")
            # or soup.select_one("article.docbody div.doc-body__text")
            or soup.select_one("article.docbody")
        )
        if layout is None:
            return []

        norm_heading_re = re.compile(r"^(§+\s*\S+|Art\.?\s*\S+|Anlage\s*\S*)(?:\s+(.+))?$", re.IGNORECASE)
        current_section = ""
        results: list[tuple[str, str, list[Tag], str]] = []

        # Norm wrappers have a direct <a name="jlr-..."> anchor regardless of depth.
        # Iterate all docLayoutMarginTop divs and only process those wrappers.
        for block in layout.find_all("div", class_="docLayoutMarginTop"):
            anchor = block.find("a", recursive=False)
            if anchor is None or not (anchor.get("name") or "").startswith("jlr-"):
                continue
            anchor_name = anchor.get("name", "")

            # pELS blocks carry no heading — detect via anchor suffix
            if anchor_name.endswith("pELS"):
                content_div = block.find("div", class_="docLayoutMarginTop")
                if content_div is not None:
                    content_blocks = [c for c in content_div.children if isinstance(c, Tag)]
                else:
                    content_blocks = [c for c in block.children if isinstance(c, Tag) and c is not anchor]
                results.append(("Eingangsformel", "", content_blocks, current_section))
                continue

            h = block.find(["h1", "h2", "h3", "h4", "h5", "h6"])
            if h is None:
                continue
            heading = h.get_text(" ", strip=True).replace(NBSP, " ")
            if not heading:
                continue

            content_div = block.find("div", class_="docLayoutMarginTop")
            if content_div is not None:
                content_blocks = [c for c in content_div.children if isinstance(c, Tag) and c is not h]
            else:
                # Some blocks (e.g. Eingangsformel) inline content directly
                # under the wrapper without a nested margin div.
                content_blocks = [c for c in block.children if isinstance(c, Tag) and c is not h and c is not anchor]

            if heading.lower() == "eingangsformel":
                results.append(("Eingangsformel", "", content_blocks, current_section))
                continue

            m = re.match(norm_heading_re, heading)
            if m:
                raw_bez = re.sub(r"\s+", " ", m.group(1)).strip()
                titel = (m.group(2) or "").strip()
                results.append((raw_bez, titel, content_blocks, current_section))
            else:
                # Section / Abschnitt / Teil heading — update breadcrumb only
                current_section = heading

        return results

    @staticmethod
    def _find_ivz_id_on_page(page: Page) -> str | None:
        """Find IVZ link using JS evaluation on the current page."""
        js = """() => {
            const links = Array.from(document.querySelectorAll('a[href*="/document/jlr-"]'));
            for (const a of links) {
                const m = a.href.match(/\\/document\\/((jlr-[^/?]+?IVZ)[^/?]*)/i);
                if (m) return m[1];
            }
            return null;
        }"""
        return page.evaluate(js)

    @staticmethod
    def _expand_toc_accordion(page: Page) -> None:
        """Expand collapsed 'Ebene öffnen' nodes in the sidebar TOC.

        grouped norm ranges (e.g. "§ 1 - § 9") are rendered as collapsed
        accordion buttons; the individual §-links are absent from the DOM
        until a toggle is activated. React binds handlers via event
        delegation, so element.click() is a no-op — bubbling MouseEvents
        are required. Nested levels may surface after expansion, so loop
        until no collapsed toggles remain.
        """
        js = """() => {
            const toggles = Array.from(
                document.querySelectorAll('a.tocPaneEntryToggleButton[aria-pressed="false"]')
            );
            const seen = new Set();
            let count = 0;
            for (const b of toggles) {
                const base = (b.id || '').replace(/_LABEL$/, '');
                if (base && seen.has(base)) continue;
                if (base) seen.add(base);
                ['mousedown', 'mouseup', 'click'].forEach(t => {
                    b.dispatchEvent(new MouseEvent(t, {bubbles: true, cancelable: true, view: window}));
                });
                count++;
            }
            return count;
        }"""
        for _ in range(5):
            if not page.evaluate(js):
                break
            page.wait_for_timeout(500)

    def _parse_doc(self, doc: str | None = None) -> Document:
        try:
            gesamtausgabe_html = doc or self._get_doc()
            return self._parse_from_gesamtausgabe(gesamtausgabe_html)
        except FileNotFoundError:
            logger.warning(f"[{self.bundesland}] Gesamtausgabe not found or failed to parse, falling back to individual pages")
        except Exception as e:
            logger.warning(f"[{self.bundesland}] error parsing gesamtausgabe: {e}. Falling back to individual pages.")

        manifest = json.loads((self.norm_dir / "manifest.json").read_text(encoding="utf-8"))
        toc_entries_raw = [TocEntry(**e) for e in manifest["toc"]]

        rahmen_html = (self.norm_dir / f"{manifest['rahmen_id']}.html").read_text(encoding="utf-8")
        header = self._read_header(rahmen_html)
        full_title = header["full_title"]
        jurabk = self.suffixed_jurabk(header["jurabk"])
        unique_doknr = jurabk

        toc_out: list[TOC] = []
        norms: list[Norm] = []
        anlagen: list[Anlage] = []
        eingangsformel: str | None = None
        seen: set[tuple[int, str]] = set()

        for entry in toc_entries_raw:
            html_path = self.norm_dir / f"{entry.doc_id}.html"
            if not html_path.exists():
                continue
            html = html_path.read_text(encoding="utf-8")

            if entry.kind == "eingangsformel":
                eingangsformel = self._parse_eingangsformel(html) or eingangsformel
                continue

            if entry.kind == "anlage":
                anlage = self._parse_anlage(html, jurabk, entry.label)
                if anlage is not None:
                    anlage.doknr = unique_doknr
                    anlagen.append(anlage)
                    toc_out.append(
                        TOC(
                            doknr=unique_doknr,
                            jurabk=jurabk,
                            Ident=entry.doc_id,
                            Title=entry.section_label,
                            paragraph_nr=entry.label,
                            paragraph_typ=ParagraphTyp.ANLAGE,
                            text=anlage.title,
                        )
                    )
                continue

            if entry.kind != "norm":
                continue

            parsed = self._parse_norm_page(html)
            if parsed is None:
                continue
            raw_bez, titel, absaetze_text = parsed

            paragraph_typ, paragraph_ref = ParagraphTyp.normalize_prefix(raw_bez)
            if paragraph_typ is None or not paragraph_ref:
                continue
            paragraph_nr, sub = split_paragraph_nr_str(paragraph_ref)
            if not isinstance(paragraph_nr, int):
                continue
            key = (paragraph_nr, sub or "")
            if key in seen:
                continue
            seen.add(key)

            absaetze = self._build_absaetze(absaetze_text, jurabk, paragraph_nr, sub or "")
            paragraph_text = "\n\n".join(a.absatz_text for a in absaetze)

            norms.append(
                Norm(
                    doknr=unique_doknr,
                    jurabk=jurabk,
                    paragraph_typ=paragraph_typ,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub or "",
                    titel=titel,
                    paragraph_text=paragraph_text,
                    absaetze=absaetze,
                )
            )
            toc_out.append(
                TOC(
                    doknr=unique_doknr,
                    jurabk=jurabk,
                    Ident=entry.doc_id,
                    Title=entry.section_label,
                    paragraph_nr=paragraph_ref,
                    paragraph_typ=paragraph_typ,
                    text=titel,
                )
            )

        standangaben = [
            Standangabe(doknr=unique_doknr, standtyp=k, standkommentar=v)
            for k, v in header.get("stand_entries", [])
        ]
        return Document(
            doknr=unique_doknr,
            hierarchy=Hierarchy.BUNDESLAND,
            bundesland=self.bundesland.name if self.bundesland else None,
            builddate=get_current_time(),
            jurabk=jurabk,
            langue=full_title,
            kurzue=header.get("kurzue"),
            ausfertigung_datum=header.get("ausfertigung_datum"),
            # pyrefly: ignore [bad-argument-type]
            # fundstelle missing should fail
            fundstelle=header.get("fundstelle"),
            eingangsformel=eingangsformel,
            doktyp=self.doctype,
            toc=toc_out,
            normen=norms,
            anlagen=anlagen,
            standangaben=standangaben or None,
        )

    def _parse_from_gesamtausgabe(self, gesamtausgabe_html: str) -> Document:
        """Parse a Document from a cached Gesamtausgabe (complete-law) HTML file."""
        header = self._read_header(gesamtausgabe_html)
        jurabk = header["jurabk"]
        unique_doknr = jurabk

        norm_tuples = self._parse_norms_from_complete_page(gesamtausgabe_html)

        toc_out: list[TOC] = []
        norms: list[Norm] = []
        anlagen: list[Anlage] = []
        eingangsformel: str | None = None
        seen: set[tuple[int, str]] = set()

        for raw_bez, titel, blocks, section_label in norm_tuples:
            if raw_bez == "Eingangsformel":
                text = "\n\n".join(xml_html_elem_to_md(b) for b in blocks)
                eingangsformel = text or eingangsformel
                continue

            if re.match(r"^Anlage", raw_bez, re.IGNORECASE):
                content = "\n\n".join(xml_html_elem_to_md(b) for b in blocks)
                if content:
                    anlage = Anlage(jurabk=jurabk, title=titel or raw_bez, content=content)
                    anlage.doknr = unique_doknr
                    anlagen.append(anlage)
                    toc_out.append(
                        TOC(
                            doknr=unique_doknr,
                            jurabk=jurabk,
                            Ident=raw_bez,
                            Title=section_label,
                            paragraph_nr=raw_bez,
                            paragraph_typ=ParagraphTyp.ANLAGE,
                            text=titel or raw_bez,
                        )
                    )
                continue

            paragraph_typ, paragraph_ref = ParagraphTyp.normalize_prefix(raw_bez)
            if paragraph_typ is None or not paragraph_ref:
                continue
            paragraph_nr, sub = split_paragraph_nr_str(paragraph_ref)
            if not isinstance(paragraph_nr, int):
                continue
            key = (paragraph_nr, sub or "")
            if key in seen:
                continue
            seen.add(key)

            absaetze = self._build_absaetze(blocks, jurabk, paragraph_nr, sub or "")
            paragraph_text = "\n\n".join(a.absatz_text for a in absaetze)

            norms.append(
                Norm(
                    doknr=unique_doknr,
                    jurabk=jurabk,
                    paragraph_typ=paragraph_typ,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub or "",
                    titel=titel,
                    paragraph_text=paragraph_text,
                    absaetze=absaetze,
                )
            )
            toc_out.append(
                TOC(
                    doknr=unique_doknr,
                    jurabk=jurabk,
                    Ident=raw_bez,
                    Title=section_label,
                    paragraph_nr=paragraph_ref,
                    paragraph_typ=paragraph_typ,
                    text=titel,
                )
            )

        standangaben = [
            Standangabe(doknr=unique_doknr, standtyp=k, standkommentar=v)
            for k, v in header.get("stand_entries", [])
        ]
        return Document(
            doknr=unique_doknr,
            hierarchy=Hierarchy.BUNDESLAND,
            bundesland=self.bundesland.name if self.bundesland else None,
            builddate=get_current_time(),
            jurabk=jurabk,
            langue=header.get("full_title", ""),
            kurzue=header.get("kurzue"),
            ausfertigung_datum=header.get("ausfertigung_datum"),
            # pyrefly: ignore [bad-argument-type]
            # missing fundstelle should fail
            fundstelle=header.get("fundstelle"),
            eingangsformel=eingangsformel,
            doktyp=self.doctype,
            toc=toc_out,
            normen=norms,
            anlagen=anlagen,
            standangaben=standangaben or [],
        )

    @staticmethod
    def _parse_full_title(title: str, jurabk: str) -> TitleEntry:
        """Parse full title extracting langue, kurzue, and Ausfertigungsdatum."""
        pattern_ausfertigung = r"\s*(.*om)?(\d{1,2}\.\s[\d\w]*\s\d{4})"
        pattern_jurabk = rf"({re.escape(jurabk)})"
        pattern_langue = r"^(.*?)\s*\("
        pattern_kurzue = r"\s*\(([\w\d\s-]*)?(\s-\s)?"

        langue_match = re.match(pattern_langue, title)
        date_match = re.search(pattern_ausfertigung, title)

        if langue_match:
            langue = langue_match.group(1).strip()
            if re.search(pattern_jurabk, title):
                kurzue_match = re.search(pattern_kurzue, title)
                raw = kurzue_match.group(1) if kurzue_match and kurzue_match.group(1) else None
                if raw:
                    raw = re.sub(rf"\s*-\s*{re.escape(jurabk)}.*", "", raw)
                kurzue = raw.strip() if raw else langue
            else:
                paren_match = re.search(r"\(([^)]+)\)", title)
                kurzue = paren_match.group(1).strip() if paren_match else langue
        else:
            # No parens: strip date and optional "Vom" suffix to get langue = kurzue
            date_only = re.search(r"\d{1,2}\.\s[\d\w]+\s\d{4}", title)
            if not date_only:
                raise ValueError(f"Full title does not match expected format: {title}")
            prefix = title[:date_only.start()].rstrip()
            langue = re.sub(r"\s+[Vv]om$", "", prefix, flags=re.IGNORECASE).strip()
            kurzue = langue

        if not date_match:
            logger.warning(f"Could not parse Ausfertigungsdatum from title {title!r}")
            ausfertigung_datum = None
        else:
            date_str = date_match.group(2)
            month_name = german_to_english_month(date_str.split()[1])
            ausfertigung_datum = datetime.strptime(
                date_str.replace(date_str.split()[1], month_name), "%d. %B %Y"
            ).date()

        out_title = TitleEntry(langue=langue, kurzue=kurzue, ausfertigung_datum=ausfertigung_datum)
        if out_title.kurzue and out_title.kurzue.strip().endswith("-"):
            out_title.kurzue = out_title.kurzue.strip().rstrip("-").strip()
        return out_title

    def _read_header(self, rahmen_html: str) -> dict[str, Any]:
        soup = BeautifulSoup(rahmen_html, "html.parser")

        rows: dict[str, str] = {}
        stand_entries: list[tuple[str, str]] = []
        for tr in soup.select('[aria-label*="Dokumentkopf"] tr'):
            cells = [c.get_text(" ", strip=True).replace(NBSP, " ") for c in tr.find_all(["td", "th"])]
            if len(cells) >= 2:
                key = cells[0].rstrip(":").strip()
                value = cells[1].strip()
                rows[key] = value

        # Standangaben live in a separate <table class="standangaben"> — not in the Dokumentkopf.
        for tr in soup.select("table.standangaben tr"):
            cells = [c.get_text(" ", strip=True).replace(NBSP, " ") for c in tr.find_all(["td", "th"])]
            if len(cells) >= 2:
                key = cells[0].rstrip(":").strip()
                value = cells[1].strip()
                if key and value:
                    stand_entries.append((key, value))

        raw_jurabk = rows.get("Amtliche Abkürzung") or rows.get("juris-Abkürzung") or ""
        h3 = soup.select_one("article.docbody h3") or soup.select_one(".doc-body__text h3") or soup.select_one("h3")
        title_entry = self._parse_full_title(h3.get_text(" ", strip=True) if h3 else "", raw_jurabk)
        jurabk = self.suffixed_jurabk(raw_jurabk)
            

        ausfertigung_datum: date | None = None
        ausf_raw = rows.get("Ausfertigungsdatum") or rows.get("Neugefasst") or ""
        if ausf_raw:
            try:
                ausfertigung_datum = datetime.strptime(ausf_raw, "%d.%m.%Y").date()
            except ValueError:
                if title_entry.ausfertigung_datum:
                    logger.warning(f"Could not parse Ausfertigungsdatum {ausf_raw!r}, falling back to date from title")
                    ausfertigung_datum = title_entry.ausfertigung_datum
                else:
                    raise ValueError(f"Could not parse Ausfertigungsdatum {ausf_raw!r} for {self.slug} and no fallback")

        return {
            "full_title": title_entry.langue,
            "jurabk": jurabk,
            "kurzue": title_entry.kurzue,
            "ausfertigung_datum": ausfertigung_datum,
            "fundstelle": rows["Fundstelle"],
            "stand_entries": stand_entries,
        }

    @staticmethod
    def _parse_ivz(ivz_html: str) -> list[TocEntry]:
        soup = BeautifulSoup(ivz_html, "html.parser")
        entries: list[TocEntry] = []
        current_section = ""

        # Find all jlr- links
        for a in soup.select('a[href*="/document/jlr-"]'):
            href = a.get("href", "")
            m = re.search(r"/document/(jlr-[A-Za-z0-9_]+?)(?:/format/xsl|\?)", href)
            if not m:
                continue
            doc_id = m.group(1)

            # Use a's text first to avoid getting text from sibling links in same row
            row_text = a.get_text(" ", strip=True).replace(NBSP, " ")
            if not row_text:
                row = a.find_parent(["tr", "li", "span"]) or a.parent
                row_text = row.get_text(" ", strip=True).replace(NBSP, " ")

            if doc_id.lower().endswith("ivz") or doc_id.lower().endswith("rahmen"):
                continue
            if doc_id.endswith("pELS"):
                entries.append(
                    TocEntry(
                        kind="eingangsformel", doc_id=doc_id, label="Eingangsformel", section_label=current_section
                    )
                )
                continue
            if doc_id.endswith("Anlage") or row_text[:40].startswith("Anlage"):
                entries.append(TocEntry(kind="anlage", doc_id=doc_id, label=row_text, section_label=current_section))
                continue

            if re.search(r"G\d+$", doc_id, re.I):
                current_section = row_text
                entries.append(TocEntry(kind="section", doc_id=doc_id, label=row_text, section_label=current_section))
                continue
            if re.search(r"P\d+[a-z]?$", doc_id, re.I):
                entries.append(TocEntry(kind="norm", doc_id=doc_id, label=row_text, section_label=current_section))

        seen: set[str] = set()
        out: list[TocEntry] = []
        for e in entries:
            if e.doc_id in seen:
                continue
            seen.add(e.doc_id)
            out.append(e)
        return out

    @staticmethod
    def _extract_norms_from_section(section_html: str, section_label: str) -> list[TocEntry]:
        """Find pP-style §-norm links on a section page."""
        soup = BeautifulSoup(section_html, "html.parser")
        out: list[TocEntry] = []
        seen: set[str] = set()
        for a in soup.select('a[href*="/document/jlr-"]'):
            href = a.get("href", "")
            m = re.search(r"/document/(jlr-[^/?]+?)(?:/format/xsl|\?|$)", href)
            if not m:
                continue
            doc_id = m.group(1)
            if doc_id in seen:
                continue
            if not re.search(r"P\d+[a-z]?$", doc_id, re.I):
                continue
            seen.add(doc_id)
            # Use a's text first to avoid getting text from sibling links in same row
            row_text = a.get_text(" ", strip=True).replace(NBSP, " ")
            if not row_text:
                row = a.find_parent(["tr", "li", "span"]) or a.parent
                row_text = row.get_text(" ", strip=True).replace(NBSP, " ")
            out.append(TocEntry(kind="norm", doc_id=doc_id, label=row_text, section_label=section_label))
        return out

    @staticmethod
    def _parse_norm_page(html: str) -> tuple[str, str, list[Tag]] | None:
        """Return (raw_bezeichnung, titel, list of content blocks) or None."""
        soup = BeautifulSoup(html, "html.parser")
        # Try different body containers
        body = soup.select_one("article.docbody div.docLayoutText div.docLayoutMarginTopMore")
        if body is None:
            body = (
                soup.select_one("article.docbody div.doc-body__text")
                or soup.select_one("article.docbody")
                or soup.select_one(".jnhtml")
            )

        if body is None:
            return None

        # Heading search: h1-h4, or div with title class
        h = body.find(["h1", "h2", "h3", "h4", "h5"])
        if h is None:
            # Maybe it's in the rahmen but not here? Try to find any text that looks like a §
            all_text = body.get_text(" ", strip=True).replace(NBSP, " ")
            m = re.search(r"(§+\s*\d+\S*|Art\.?\s*\d+\S*|Anlage\s*\S*)", all_text)
            if not m:
                return None
            raw_bez = m.group(1)
            # Find everything after raw_bez as title until first Absatz
            title_part = all_text[m.end() :].split("(")[0].strip()
            titel = title_part
            blocks = [c for c in body.children if isinstance(c, Tag)]
            return raw_bez, titel, blocks

        heading = h.get_text(" ", strip=True).replace(NBSP, " ")
        m = re.match(r"^(§+\s*\S+|Art\.?\s*\S+|Anlage\s*\S*)(?:\s+(.+))?$", heading)
        if not m:
            # Just use the heading as raw_bez if it contains §
            if "§" in heading or "Art" in heading or "Anlage" in heading:
                raw_bez = heading
                titel = ""
            else:
                return None
        else:
            raw_bez = re.sub(r"\s+", " ", m.group(1)).strip()
            titel = (m.group(2) or "").strip()

        blocks = [c for c in body.children if isinstance(c, Tag) and c is not h]
        return raw_bez, titel, blocks

    @staticmethod
    def _build_absaetze(
        blocks: list[Tag],
        jurabk: str,
        paragraph_nr: int,
        sub_paragraph_nr: str,
    ) -> list[Absatz]:
        """Chunk content blocks by leading "(N)" markers into Absätze."""
        absatz_nr_re = re.compile(r"^\((\d+[a-z]?)\)\s*(.*)$", re.DOTALL)
        # chunks: (absatz_nr, prefix_text_after_marker, remaining_tag_blocks)
        chunks: list[tuple[str | None, str, list[Tag]]] = []
        current_nr: str | None = None
        current_prefix = ""
        current_blocks: list[Tag] = []

        for block in blocks:
            if block.name == "p":
                text = _tag_to_text(block)
                m = absatz_nr_re.match(text)
                if m:
                    if current_nr is not None or current_prefix or current_blocks:
                        chunks.append((current_nr, current_prefix, current_blocks))
                    current_nr = m.group(1)
                    current_prefix = m.group(2).strip()
                    current_blocks = []
                    continue
            current_blocks.append(block)

        if current_nr is not None or current_prefix or current_blocks:
            chunks.append((current_nr, current_prefix, current_blocks))

        if chunks and chunks[0][0] is None:
            if len(chunks) > 1:
                _, pre, pre_blocks = chunks[0]
                nr1, pref1, blocks1 = chunks[1]
                chunks = [(nr1, (pre + " " + pref1).strip() if pre else pref1, pre_blocks + blocks1)] + chunks[2:]
            else:
                chunks = [("1", chunks[0][1], chunks[0][2])]

        out: list[Absatz] = []
        for nr, prefix, block_list in chunks:
            text_parts: list[str] = [prefix] if prefix else []
            for b in block_list:
                t = xml_html_elem_to_md(b)
                if t:
                    text_parts.append(t)
            absatz_text = "\n\n".join(text_parts)
            if not absatz_text:
                continue
            out.append(
                Absatz(
                    jurabk=jurabk,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub_paragraph_nr,
                    absatz_nr=nr,
                    absatz_text=absatz_text,
                    saetze=_parse_absatz_blocks(prefix, block_list),
                )
            )
        return out

    @staticmethod
    def _parse_eingangsformel(html: str) -> str | None:
        soup = BeautifulSoup(html, "html.parser")
        body = (
            soup.select_one("article.docbody div.docLayoutText div.docLayoutMarginTopMore")
            or soup.select_one("article.docbody div.doc-body__text")
            or soup.select_one("article.docbody")
        )
        if body is None:
            return None
        text = xml_html_elem_to_md(body)
        # The page also contains the doc header ("Eingangsformel") as h3/h4;
        # strip it if present so only the actual formula text remains.
        text = re.sub(r"^\s*Eingangsformel\s*\n+", "", text, flags=re.IGNORECASE)
        return text or None

    @staticmethod
    def _parse_anlage(html: str, jurabk: str, label: str) -> Anlage | None:
        soup = BeautifulSoup(html, "html.parser")
        body = soup.select_one("article.docbody div.docLayoutText div.docLayoutMarginTopMore") or soup.select_one(
            "article.docbody"
        )
        if body is None:
            return None
        content = xml_html_elem_to_md(body)
        if not content:
            return None
        return Anlage(jurabk=jurabk, title=label or "Anlage", content=content)


