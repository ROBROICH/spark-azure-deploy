"""Parser/Downloader for XML laws"""
import re
from xml.etree.ElementTree import Element

import defusedxml.ElementTree as ET
import httpx
from db_services_shared.utils.parsing import split_paragraph_nr_str
from db_services_shared.utils.zip import extract_and_validate
from defusedxml import DefusedXmlException

from event_logging.enums import EventAction, EventOutcome, EventCategory

from db_pipelines.parsers.base_processor import BaseProcessor
from db_pipelines.parsers.utils.sentence_split import (
    get_absatz_nr,
    smart_split_sentences,
)
from db_pipelines.parsers.utils.xml import (
    xml_elem_to_str,
    xml_html_elem_to_md,
)
from db_pipelines.schemas.db import (
    TOC,
    Absatz,
    DocType,
    Document,
    Hierarchy,
    Norm,
    ParagraphTyp,
    Satz,
    Standangabe,
)


class XmlProcessor2(BaseProcessor):
    """class for processing laws from XML sources"""

    def __init__(self, slug: str, doctype: DocType, **kwargs) -> None:
        # source-specific archive sub-directory injected via config `extra`;
        # required only when reading the extracted document
        self._archive_subdir = kwargs.pop("archive_subdir", None)
        super().__init__(slug, doctype, **kwargs)

    def _get_doc(self) -> ET:
        if not self._archive_subdir:
            raise ValueError("XmlProcessor2 requires 'archive_subdir' in `extra` config")
        return ET.parse(self.norm_dir.joinpath(f"{self._archive_subdir}/{self.slug}.xml"))

    def _fetch_doc(self):
        """
        fetches a zip containing the requested
        law in xml format to the `downloads` directory and unzips the contents.

        Returns:
        Path: path to the directory with the extracted zip file(s)
        """

        # Parse norm-xml
        endpoint = f"/{self.slug}"
        response = httpx.get(self.base_url.strip("/") + endpoint)
        if response.status_code != 200:
            raise ValueError("could not fetch zip")

        # Write parsed xml to zip-file
        zip_path = self.norm_dir.parent.joinpath(f"{self.slug}.zip")
        with open(zip_path, "wb") as output_file:
            output_file.write(response.content)

            # Extract zip-file
            extract_and_validate(zip_path, self.norm_dir)

    @staticmethod
    def clean_paragraph_nr_text(para_elem: Element) -> tuple[int, str]:
        """common cleanup steps"""

        para_text = para_elem.text.strip() if para_elem.text else ""

        # Determine paragraph type (Art., §, etc.)
        if para_text.startswith("Art."):
            clean_para_text = para_text.replace("Art.", "").strip()
        elif para_text.startswith("§"):
            clean_para_text = para_text.replace("§", "").strip()
        else:
            raise ValueError(f"odd paragraph number {xml_elem_to_str(para_elem)}")
        paragraph_nr, sub_paragraph_nr = split_paragraph_nr_str(clean_para_text)
        return (paragraph_nr, sub_paragraph_nr)

    @staticmethod
    def _split_p_by_satz_nr(p_elem: Element) -> list[tuple[int | None, str]]:
        """Split a <p> element into (satz_nr, text) segments using <satz.nr> child markers.

        Returns a list of (satz_nr, text) tuples. If no <satz.nr> children are found,
        returns [(None, full_text)] as a fallback for smart_split_sentences.
        """
        satz_nr_elems = p_elem.findall("satz.nr")
        if not satz_nr_elems:
            full_text = "".join(p_elem.itertext()).strip()
            if full_text:
                return [(None, full_text)]
            return []

        segments: list[tuple[int | None, str]] = []

        # p_elem.text is text before the first <satz.nr>
        initial_text = (p_elem.text or "").strip()
        current_satz_nr: int | None = None
        current_text = initial_text

        for child in p_elem:
            if child.tag == "satz.nr":
                # flush previous segment
                if current_text:
                    segments.append((current_satz_nr, current_text))
                try:
                    current_satz_nr = int(child.text.strip())
                except (ValueError, AttributeError):
                    current_satz_nr = None
                # tail is the sentence text following this marker
                current_text = (child.tail or "").strip()
            else:
                # non-satz.nr child: accumulate its text and tail
                current_text += "".join(child.itertext())
                current_text += (child.tail or "")
                current_text = current_text.strip()

        if current_text:
            segments.append((current_satz_nr, current_text))

        return segments

    @staticmethod
    def _normalize_marker(symbol_text: str, index: int) -> str:
        """Normalize a list marker symbol to a canonical string.

        '1.' -> '1', 'a)' -> 'a', ambiguous (e.g. '•', '–') -> '{index+1}. {symbol}'
        """
        text = (symbol_text or "").strip()
        # Numeric marker: '1.' -> '1'
        m = re.fullmatch(r"(\d+)\.", text)
        if m:
            return m.group(1)
        # Letter marker: 'a)' -> 'a'
        m = re.fullmatch(r"([a-zA-Z]{1,2})\)", text)
        if m:
            return m.group(1)
        # Ambiguous: bullet, dash, etc.
        return f"{index + 1}. {text}"

    @staticmethod
    def _clean_list_text(text: str) -> str:
        """Strip trailing commas and trailing conjunctions (und, oder, sowie)."""
        text = text.rstrip()
        text = re.sub(r",\s*$", "", text)
        text = re.sub(r"\s+(und|oder|sowie)\s*$", "", text, flags=re.IGNORECASE)
        return text.strip()

    @staticmethod
    def _end_sentence(text: str) -> str:
        """Ensure text ends with a period, stripping trailing ','/';' first."""
        text = text.rstrip()
        text = re.sub(r"[,;]\s*$", "", text)
        if not text.endswith("."):
            text += "."
        return text

    @staticmethod
    def _clean_verweis_xml(elem: Element) -> None:
        """Replace verweis.norm and fn.call child elements with inline text, in-place.

        A <verweis.norm><v.abk ersatz="ZPO">Text</v.abk></verweis.norm> immediately
        followed by <fn.call><fn.def><p>Note</p></fn.def></fn.call> becomes
        "Text (ZPO Note)". Standalone verweis.norm with an ersatz attribute becomes
        "Text (ZPO)". Standalone fn.call becomes "(Note)". Recurses into other elements.
        """
        i = 0
        while i < len(elem):
            child = elem[i]

            if child.tag == "verweis.norm":
                v_abk = child.find("v.abk")
                verweis_text = "".join(child.itertext()).strip()
                ersatz = v_abk.get("ersatz") if v_abk is not None else None
                child_tail = child.tail or ""

                if i + 1 < len(elem) and elem[i + 1].tag == "fn.call":
                    fn_call = elem[i + 1]
                    fn_def_text = ""
                    fn_def = fn_call.find("fn.def")
                    if fn_def is not None:
                        p_el = fn_def.find("p")
                        if p_el is not None:
                            fn_def_text = "".join(p_el.itertext()).strip()

                    paren_parts = [p for p in [ersatz, fn_def_text] if p]

                    if (paren_parts
                        and paren_parts[-1]
                        and paren_parts[-1][-1] == "."):
                        paren_parts[-1] = paren_parts[-1][:-1]
                    paren = f" ({' '.join(paren_parts)})" if paren_parts else ""
                    replacement = verweis_text + child_tail + paren + (fn_call.tail or "")
                    elem.remove(fn_call)
                elif ersatz:
                    replacement = verweis_text + f" ({ersatz})" + child_tail
                else:
                    replacement = verweis_text + child_tail

                if i == 0:
                    elem.text = (elem.text or "") + replacement  # type: ignore[assignment]
                else:
                    elem[i - 1].tail = (elem[i - 1].tail or "") + replacement  # type: ignore[assignment]
                elem.remove(child)

            elif child.tag == "fn.call":
                fn_def_text = ""
                fn_def = child.find("fn.def")
                if fn_def is not None:
                    p_el = fn_def.find("p")
                    if p_el is not None:
                        fn_def_text = "".join(p_el.itertext()).strip()

                if fn_def_text and fn_def_text[-1] == ".":
                    fn_def_text = fn_def_text[:-1]
                paren = f"({fn_def_text})" if fn_def_text else ""
                replacement = paren + (child.tail or "")

                if i == 0:
                    elem.text = (elem.text or "") + replacement  # type: ignore[assignment]
                else:
                    elem[i - 1].tail = (elem[i - 1].tail or "") + replacement  # type: ignore[assignment]
                elem.remove(child)

            else:
                XmlProcessor2._clean_verweis_xml(child)
                i += 1

    @classmethod
    def _expand_ul(
        cls,
        ul_elem: Element,
        intro: str,
        satz_nr: int,
        marker_path: list[str],
    ) -> list[tuple[list[str], int, str]]:
        """Expand a <ul> element into a list of (markers, satz_nr, sentence_text) tuples.

        Each <li> produces one or more entries. Nested <ul> items recurse.
        post-text of a <li> (text after nested <ul>) is appended to each sub-path.
        """
        results: list[tuple[list[str], int, str]] = []

        for li_index, li in enumerate(ul_elem.findall("li")):
            symbol_elem = li.find("symbol")
            symbol_text = symbol_elem.text if symbol_elem is not None else ""
            marker = cls._normalize_marker(symbol_text, li_index)
            current_path = marker_path + [marker]

            # Collect direct <p> children and nested <ul>
            p_elems = li.findall("p")
            nested_ul = li.find("ul")

            # Pre-text: first <p> before any nested <ul>
            # Post-text: <p> elements after the nested <ul>
            pre_p_elems = []
            post_p_elems = []
            seen_ul = False
            for child in li:
                if child.tag == "ul":
                    seen_ul = True
                elif child.tag == "p":
                    if seen_ul:
                        post_p_elems.append(child)
                    else:
                        pre_p_elems.append(child)

            pre_text = cls._clean_list_text(" ".join(
                "".join(p.itertext()).strip() for p in pre_p_elems
            ).strip())
            post_text = " ".join(
                "".join(p.itertext()).strip() for p in post_p_elems
            ).strip()

            if nested_ul is not None:
                # recurse: sub-paths get the pre_text as new intro
                sub_intro = (intro + " " + pre_text).strip() if pre_text else intro
                sub_results = cls._expand_ul(nested_ul, sub_intro, satz_nr, current_path)
                # append post_text to each sub-path sentence
                if post_text:
                    sub_results = [
                        (m, nr, cls._end_sentence(
                            cls._clean_list_text(txt.rstrip(".")) + " " + post_text
                        ))
                        for m, nr, txt in sub_results
                    ]
                results.extend(sub_results)
            else:
                # leaf item
                item_text = (intro + " " + pre_text).strip() if pre_text else intro
                item_text = cls._end_sentence(item_text)
                results.append((current_path, satz_nr, item_text))

        return results

    @classmethod
    def _ul_to_dl(cls, elem: Element) -> Element:
        """Return a deep copy of elem with <ul>/<li>/<symbol> converted to <dl>/<dt>/<dd>.

        <symbol> becomes <dt>, remaining <li> children (including nested <ul>) become <dd>.
        Must not mutate the original — _process_absatz_text still needs the <ul> structure.
        """
        def convert(el: Element) -> Element:
            if el.tag == "ul":
                dl = Element("dl")
                dl.text = el.text
                dl.tail = el.tail
                for child in el:
                    if child.tag == "li":
                        symbol = child.find("symbol")
                        dt = Element("dt")
                        dt.text = symbol.text if symbol is not None else ""
                        dt.tail = None
                        dl.append(dt)
                        dd = Element("dd")
                        dd.tail = child.tail
                        for li_child in child:
                            if li_child.tag != "symbol":
                                dd.append(convert(li_child))
                        dl.append(dd)
                    else:
                        dl.append(convert(child))
                return dl
            else:
                new_el = Element(el.tag, el.attrib)
                new_el.text = el.text
                new_el.tail = el.tail
                for child in el:
                    new_el.append(convert(child))
                return new_el

        return convert(elem)

    @classmethod
    def _process_absatz_text(cls, absatz_text_elem: Element) -> list[Satz]:
        """Parse an <absatz.text> XML element into a list of Satz objects.

        Iterates direct children (<p> and <ul>). Pending <p> segments are flushed
        as standalone Satz entries, or used as intro text when followed by a <ul>.
        Falls back to satz_nr=1 for list entries when no <satz.nr> markers exist.

        A trailing <p> whose first segment has no explicit <satz.nr> marker is
        treated as a shared endtext: the unmarked text is appended as a suffix
        to the preceding list items, and any marked segments that follow become
        standalone sentences.
        """
        saetze: list[Satz] = []
        satz_id_counter = 1   # unique ordering id, always increments
        sentence_nr = 1       # logical sentence number within the absatz
        last_ul_indices: list[int] = []  # most recent list saetze (for suffix append)

        # pending: list of (satz_nr, text) from the last <p> element not yet emitted
        pending: list[tuple[int | None, str]] = []

        def flush_pending_as_standalone(pending_segs: list[tuple[int | None, str]]) -> list[Satz]:
            nonlocal satz_id_counter, sentence_nr
            result = []
            has_explicit = any(nr is not None for nr, _ in pending_segs)
            if has_explicit:
                for nr, text in pending_segs:
                    satz_nr_val = nr if nr is not None else sentence_nr
                    result.append(Satz(
                        satz_id=satz_id_counter,
                        satz_nr=satz_nr_val,
                        markers=[],
                        satz_text=cls._end_sentence(text),
                    ))
                    satz_id_counter += 1
                    sentence_nr = satz_nr_val + 1
            else:
                # fallback: use smart_split_sentences
                combined = " ".join(t for _, t in pending_segs).strip()
                split_sentences = smart_split_sentences(combined)
                for sent in split_sentences:
                    result.append(Satz(
                        satz_id=satz_id_counter,
                        satz_nr=sentence_nr,
                        markers=[],
                        satz_text=cls._end_sentence(sent),
                    ))
                    satz_id_counter += 1
                    sentence_nr += 1
            return result

        children = list(absatz_text_elem)
        i = 0
        while i < len(children):
            child = children[i]

            if child.tag == "p":
                pending = cls._split_p_by_satz_nr(child)
                i += 1
                # peek: if next sibling is a <ul>, hold pending as intro
                if i < len(children) and children[i].tag == "ul":
                    # will be consumed in the ul branch
                    continue
                # if the first segment is unmarked and we just emitted a list,
                # treat it as a shared endtext suffix appended to the list items
                if last_ul_indices and pending and pending[0][0] is None:
                    suffix_text = pending[0][1].strip()
                    suffix_text = re.sub(r"\.\s*$", "", suffix_text).strip()
                    if suffix_text:
                        for idx in last_ul_indices:
                            s = saetze[idx]
                            txt = re.sub(r"[,\s]+$", "", s.satz_text.rstrip(".")).rstrip()
                            txt = re.sub(r"\b(und|oder)\s*$", "", txt, flags=re.IGNORECASE).strip()
                            s.satz_text = cls._end_sentence(f"{txt} {suffix_text}")
                    pending = pending[1:]
                last_ul_indices = []
                # else flush as standalone
                new_saetze = flush_pending_as_standalone(pending)
                saetze.extend(new_saetze)
                pending = []

            elif child.tag == "ul":
                # determine intro from pending
                # pending may have multiple segments; use the last one as intro
                # (earlier segments are flushed as standalone first)
                if pending:
                    # segments before the last become standalone sentences
                    if len(pending) > 1:
                        for seg in pending[:-1]:
                            nr, text = seg
                            satz_nr_val = nr if nr is not None else sentence_nr
                            saetze.append(Satz(
                                satz_id=satz_id_counter,
                                satz_nr=satz_nr_val,
                                markers=[],
                                satz_text=cls._end_sentence(text),
                            ))
                            satz_id_counter += 1
                            sentence_nr = satz_nr_val + 1
                    last_nr, last_text = pending[-1]
                    intro = last_text
                    # satz_nr for list items: use last_nr if available, else current sentence_nr
                    list_satz_nr = last_nr if last_nr is not None else sentence_nr
                else:
                    intro = ""
                    list_satz_nr = sentence_nr

                ul_start = len(saetze)
                expanded = cls._expand_ul(child, intro, list_satz_nr, [])
                for markers, satz_nr_val, satz_text in expanded:
                    saetze.append(Satz(
                        satz_id=satz_id_counter,
                        satz_nr=satz_nr_val,
                        markers=markers,
                        satz_text=satz_text,
                    ))
                    satz_id_counter += 1
                last_ul_indices = list(range(ul_start, len(saetze)))
                # after processing the list block, advance sentence_nr by 1
                sentence_nr = list_satz_nr + 1

                pending = []
                i += 1

            else:
                # skip unknown elements (aenderungsverlauf etc.)
                i += 1

        # flush any remaining pending
        if pending:
            saetze.extend(flush_pending_as_standalone(pending))

        return saetze

    def _parse_doc(self, doc: ET = None) -> Document:
        """parse an xml ElementTree to tabular format"""
        if doc is None:
            try:
                et = self._get_doc()
            except DefusedXmlException as e:
                raise ValueError(f"Unsafe XML input detected for {self._get_doc()}") from e
        else:
            et = doc

        root = et.getroot()

        # Extract document metadata from kopf (head)
        kopf = root.find("kopf")
        doknr = kopf.find("angaben.versunabh/dokumentation").get("dokid")

        meta_entry = {}
        try:
            dokumentation = kopf.find("angaben.versunabh/dokumentation")
            meta_entry["jurabk"] = self.suffixed_jurabk(dokumentation.get("dokid"))  # e.g., "BayBO"
            meta_entry["doktyp"] = dokumentation.get("doktyp")  # e.g., "gesetz"
            meta_entry["ersatz"] = dokumentation.get("ersatz")  # replacement document

            # Parse ausfertigung (enactment) data
            ausfertigung = kopf.find("angaben.versunabh/ausfertigung")
            if ausfertigung is not None:
                ausfertigungsdatum = ausfertigung.find("ausfertigungsdatum")
                if ausfertigungsdatum is not None:
                    meta_entry["ausfertigung_datum"] = ausfertigungsdatum.text

            # Parse fundstelle (source reference)
            fundstelle_gvbl = (
                ausfertigung.find("fundstelle.GVBl") if ausfertigung else None
            )
            if fundstelle_gvbl is not None:
                jahr = fundstelle_gvbl.find("jahr")
                seite = fundstelle_gvbl.find("seite")
                if jahr is not None and seite is not None:
                    meta_entry["fundstelle"] = f"GVBl {jahr.text} ({seite.text})"

            # Parse version-dependent data
            versabh = kopf.find("angaben.versabh")
            if versabh is not None:
                inkraft = versabh.find("inkraft")
                if inkraft is not None:
                    meta_entry["inkraft"] = inkraft.text

                fassung = versabh.find("fassung")
                if fassung is not None:
                    fassungsdatum = fassung.find("fassungsdatum")
                    if fassungsdatum is not None:
                        meta_entry["fassungsdatum"] = fassungsdatum.text

                kurzbezeichnung = versabh.find("kurzbezeichnung")
                if kurzbezeichnung is not None:
                    meta_entry["kurzbezeichnung"] = kurzbezeichnung.text

                titelangaben = versabh.find("titelangaben")
                if titelangaben is not None:
                    meta_entry["titelangaben"] = titelangaben.text

                amtlicheAbk = versabh.find("amtlicheAbk")
                if amtlicheAbk is not None:
                    meta_entry["amtlicheAbk"] = amtlicheAbk.text

                gliederungsNr_BayRS = versabh.find("gliederungsNr.BayRS")
                if gliederungsNr_BayRS is not None:
                    meta_entry["gliederungsNr_BayRS"] = gliederungsNr_BayRS.text

        except Exception as e:
            self.logger.error(
                outcome=EventOutcome.FAILURE,
                action=EventAction.WRITE,
                category=EventCategory.DATABASE,
                message=f"could not find document meta {e}"
                )
            raise e

        # Parse aenderungsverlauf (change history) - maps to standangaben
        standangaben = []
        rumpf = root.find("rumpf")
        if rumpf is not None:
            aenderungsverlauf = rumpf.find("aenderungsverlauf")
            if aenderungsverlauf is not None:
                for li in aenderungsverlauf.findall(".//li"):
                    symbol = li.find("symbol")
                    p = li.find("p")
                    if symbol is not None and p is not None:
                        full_text = "".join(p.itertext()).strip()
                        entry = Standangabe(
                            doknr=doknr,
                            standtyp=f"Änderung {symbol.text}",
                            standkommentar=full_text,
                        )
                        standangaben.append(entry)

        # Parse gliederung (structure) - maps to TOC entries
        toc_entries = []
        gliederungen = rumpf.findall(".//gliederung") if rumpf is not None else []

        for gliederung in gliederungen:
            gliederungsid = gliederung.get("gliederungsid")
            gliederung_titel = gliederung.find("gliederung.titel")

            if gliederung_titel is not None:
                p = gliederung_titel.find("p")
                if p is not None:
                    # Create TOC entry for the structure unit
                    structure_title = p.text.strip() if p.text else ""

                    # Find all einzelnorm elements within this gliederung
                    einzelnormen_in_gliederung = gliederung.findall(".//einzelnorm")

                    # Create TOC entries for each norm within this structure
                    for einzelnorm in einzelnormen_in_gliederung:
                        para_nr = einzelnorm.find("para.nr")
                        para_titel = einzelnorm.find("para.titel")

                        if para_titel == "Schlussformel":
                            continue

                        tmp_nr, tmp_sub_nr = self.clean_paragraph_nr_text(para_nr)
                        paragraph_nr = " ".join([str(tmp_nr), tmp_sub_nr]).strip()

                        # Create TOC entry that includes
                        # both structure and norm reference
                        paragraph_typ = ParagraphTyp.SINGLE
                        toc_entry = TOC(
                            doknr=doknr,
                            jurabk=meta_entry["jurabk"],
                            Ident=gliederungsid or "",
                            Title=structure_title,
                            paragraph_typ=paragraph_typ,
                            paragraph_nr=paragraph_nr,
                            text=(
                                para_titel.text.strip()
                                if para_titel is not None and para_titel.text
                                else ""
                            ),
                        )
                        toc_entries.append(toc_entry)

        # Parse einzelnorm (individual norms) - maps to Norm entries
        norms_entries = []
        einzelnormen = rumpf.findall(".//einzelnorm") if rumpf is not None else []

        for einzelnorm in einzelnormen:
            # Parse paragraph number and title
            para_nr = einzelnorm.find("para.nr")
            para_titel = xml_html_elem_to_md(einzelnorm.find("para.titel")).strip()

            if para_titel == "Schlussformel":
                continue

            # don't write empty norms
            if "(aufgehoben)" in para_titel:
                continue

            if para_nr is not None:
                paragraph_nr, sub_paragraph_nr = self.clean_paragraph_nr_text(para_nr)

                # Parse paragraph content
                content = []
                absaetze: list[Absatz] = []
                jur_absaetze = einzelnorm.findall("jurAbsatz")
                for jur_absatz in jur_absaetze:
                    absatz_nr_elem = jur_absatz.find("absatz.nr")
                    absatz_text_elem = jur_absatz.find("absatz.text")

                    if absatz_text_elem is None:
                        continue

                    raw_absatz_nr = absatz_nr_elem.text if absatz_nr_elem is not None else None
                    try:
                        absatz_nr, _ = get_absatz_nr(raw_absatz_nr)
                    except ValueError:
                        absatz_nr = "1"

                    self._clean_verweis_xml(absatz_text_elem)
                    saetze = self._process_absatz_text(absatz_text_elem)
                    for elem in absatz_text_elem.iter():
                        if elem.tag == "satz.nr":
                            elem.text = '' # clear text to avoid satz.nr in output
                    absatz_text_str = xml_html_elem_to_md(self._ul_to_dl(absatz_text_elem)).strip()

                    content.append(absatz_text_str)
                    absaetze.append(Absatz(
                        jurabk=meta_entry["jurabk"],
                        paragraph_nr=int(paragraph_nr),
                        sub_paragraph_nr=sub_paragraph_nr,
                        absatz_nr=absatz_nr,
                        absatz_text=absatz_text_str,
                        saetze=saetze,
                    ))

                # Create norm entry
                norms_entries.append(
                    Norm(
                        jurabk=meta_entry["jurabk"],
                        paragraph_typ=ParagraphTyp.SINGLE,
                        paragraph_nr=int(paragraph_nr),
                        sub_paragraph_nr=sub_paragraph_nr,
                        titel=(para_titel),
                        paragraph_text="\n".join(content),
                        absaetze=absaetze,
                    )
                )

        # Parse anlagen (attachments) if any
        anlagen = []
        # Note: the XML structure might have attachments in a different location
        # This would need to be adjusted based on actual XML structure

        # fall back kurzue to langue if unavailable
        kurzue = meta_entry.get("kurzbezeichnung", None)
        if not kurzue:
            kurzue = meta_entry.get("titelangaben", "")

        return Document(
            doknr=doknr,
            hierarchy=Hierarchy.BUNDESLAND,
            bundesland=self.bundesland.name if self.bundesland else None,
            fundstelle=meta_entry.get("fundstelle", ""),
            builddate=root.get("builddate"),
            jurabk=meta_entry["jurabk"],
            kurzue=kurzue,
            langue=meta_entry.get("titelangaben", ""),
            ausfertigung_datum=meta_entry.get("ausfertigung_datum"),
            doktyp=meta_entry.get("doktyp"),
            standangaben=standangaben,
            toc=toc_entries,
            normen=norms_entries,
            anlagen=anlagen,
        )
