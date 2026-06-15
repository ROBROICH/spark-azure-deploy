"""parser for xml documents"""

import re
from xml.etree.ElementTree import Element

import defusedxml.ElementTree as ET
import httpx
from db_services_shared.utils.parsing import split_paragraph_nr_str
from db_services_shared.utils.zip import extract_and_validate
from defusedxml import DefusedXmlException
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)

from db_pipelines.parsers.base_processor import BaseProcessor
from db_pipelines.parsers.utils.xml_sentence_split import process_absatz
from db_pipelines.parsers.utils.xml import xml_html_elem_to_md as html_elem_to_md
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
from pydantic import HttpUrl


class XmlProcessor1(BaseProcessor):
    """Class for processing xml files"""

    doknr: str
    jurabk: str

    def __init__(
        self,
        slug: str,
        doctype: DocType,
        base_url: HttpUrl | str | None = None,
        hierarchy: Hierarchy = Hierarchy.BUND,
        **kwargs,
    ) -> None:
        super().__init__(
            slug=slug,
            doctype=doctype,
            hierarchy=hierarchy,
            base_url=base_url,
            **kwargs,
        )

    def _get_doc(self) -> ET:
        xml_paths = list(self.norm_dir.glob("*.xml"))
        if len(xml_paths) > 1:
            raise ValueError(f"multiple xml files found.\n{xml_paths}")

        if len(xml_paths) < 1:
            raise ValueError(f"no xml files found!\n{xml_paths}")

        # Parse the extracted xml-file
        try:
            return ET.parse(xml_paths[0].absolute())
        except DefusedXmlException as e:
            raise ValueError(f"Unsafe XML input detected for {xml_paths[0]}") from e

    def _fetch_doc(self) -> None:
        """
        fetches a zip containing the requested
        law in xml format to the `CACHE_DIR` directory and unzips the contents.

        Args:
          law_slug (str): short form name (slug) of the required law

        Returns:
          None
        """
        # fetch xml zip
        endpoint = f"/{self.slug}/xml.zip"
        response = httpx.get(self.base_url.strip("/") + endpoint)
        if response.status_code != 200:
            raise ValueError("could not fetch zip")

        # Write to disk
        zip_path = self.norm_dir.parent.joinpath(f"{self.slug}.zip")
        with open(zip_path, "wb") as output_file:
            output_file.write(response.content)

        # Extract files
        extract_and_validate(zip_path, self.norm_dir)

    def _extract_document_metadata(self, root: Element, norms: list[Element]) -> dict:
        """
        Extracts document metadata from the first norm element.

        Args:
          root (Element): The root element of the XML tree.
          norms (list[Element]): List of norm elements. The first element is expected
                                   to contain metadata and will be removed if it matches.

        Returns:
          dict: A dictionary containing extracted metadata.
        """
        doknr = root.get("doknr")
        meta_entry = {}
        standangaben = []

        try:
            meta_elem = norms[0].find("metadaten")

            for standangabe in meta_elem.findall("standangabe"):
                entry = Standangabe(
                    doknr=doknr,
                    standtyp=standangabe.find("standtyp").text,
                    standkommentar=standangabe.find("standkommentar").text,
                )
                standangaben.append(entry)

            kurzue = meta_elem.find("kurzue")

            # always get the shortform (without years),
            # as this is how it is cited
            amtabk_elem = meta_elem.find("amtabk")
            amtabk = amtabk_elem.text if amtabk_elem is not None else None
            if amtabk is None:
                jurabk_elems = meta_elem.findall("jurabk")
                if len(jurabk_elems) > 1:
                    text_elems = [elem.text for elem in jurabk_elems]
                    self.jurabk = min(text_elems, key=len)
                else:
                    self.jurabk = jurabk_elems[0].text
            else:
                self.jurabk = amtabk

            fundstelle = f"{meta_elem.find('fundstelle').find('periodikum').text} ({
                meta_elem.find('fundstelle').find('zitstelle').text
            })"

            meta_entry = {
                "doknr": doknr,
                "jurabk": self.jurabk,
                "kurzue": (kurzue.text if kurzue is not None else meta_elem.find("langue").text),
                "langue": meta_elem.find("langue").text,
                "fundstelle": fundstelle,
                "ausfertigung_datum": meta_elem.find("ausfertigung-datum").text,
                "standangaben": standangaben,
                "builddate": root.get("builddate"),
            }

            # Remove the metadata norm
            norms.pop(0)

        except Exception as e:
            self.logger.error(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.UNKNOWN,
                category=EventCategory.DATABASE,
                default_event=LogEventDefault.GENERAL,
                message=f"could not find document meta ({e})",  # , exc_info=True
            )
            raise e

        # additional info for Verorordnungen
        try:
            # peek at next norm for eingangsformel
            if norms:
                enbez_elem = norms[0].find("metadaten").find("enbez")
                if enbez_elem is not None and enbez_elem.text == "Eingangsformel":
                    eingangsformel = norms[0].find("textdaten").find("text").find("Content").find("P").text
                    meta_entry["eingangsformel"] = eingangsformel
                    # pop from the norms list after parsing
                    norms.pop(0)
        except Exception:
            self.logger.info(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.UNKNOWN,
                category=EventCategory.DATABASE,
                default_event=LogEventDefault.GENERAL,
                message="no eingangsformel",  # , exc_info=True
            )

        return meta_entry

    def _parse_toc_xml(self, root: Element, doknr: str = None, jurabk: str = None) -> list[TOC]:
        """
        Parses toc element and returns a list of TOC objects.

        Args:
          root (Element): The XML content (toc-norm element)
          doknr (str): the global document identifier
          jurabk (str): the law identifier

        Returns:
          list[TOC]: List of TOC objects
        """
        toc_entries = []
        current_ident = ""
        current_title = ""

        if jurabk is None:
            jurabk = self.jurabk

        try:
            for element in root.iter():
                # Check for Ident elements (section identifiers)
                if element.tag == "Ident":
                    current_ident = element.text.strip() if element.text else ""

                # Check for Title elements (section titles)
                elif element.tag == "Title":
                    current_title = element.text.strip() if element.text else ""
                    # Clean up any HTML-like tags and whitespce in title
                    current_title = re.sub(r"<BR\s*/?>", " ", current_title)
                    current_title = re.sub(r"\s+", " ", current_title).strip()

                # Check for table rows containing the actual TOC entries
                elif element.tag == "row":
                    entries = element.findall("entry")
                    if len(entries) >= 2:
                        col1_text = entries[0].text.strip() if entries[0].text else ""
                        col2_text = entries[1].text.strip() if entries[1].text else ""

                        # Clean up col1 (remove non-breaking spaces and normalize)
                        col1_text = col1_text.replace("\xa0", " ").strip()

                        if col1_text and col2_text:
                            p_typ, p_nr = ParagraphTyp.match_prefix(col1_text)
                            toc_entry = TOC(
                                doknr=doknr,
                                jurabk=jurabk,
                                Ident=current_ident,
                                Title=current_title,
                                paragraph_typ=p_typ,
                                paragraph_nr=p_nr or None,
                                text=col2_text,
                            )
                            toc_entries.append(toc_entry)
                    elif (len(entries)) == 1:
                        # single-column rows carry Anlagen headers and section titles
                        col_text = entries[0].text or ""
                        col_split = col_text.strip().split("<BR /> ")
                        p_typ, p_nr = ParagraphTyp.match_prefix(col_split[0])
                        toc_entry = TOC(
                            doknr=doknr,
                            jurabk=jurabk,
                            Ident=current_ident,
                            Title=current_title,
                            paragraph_typ=p_typ,
                            paragraph_nr=p_nr or None,
                            text=col_split[1] if len(col_split) > 1 else col_split[0],
                        )
                        toc_entries.append(toc_entry)

                # Anlagen/Anhang are not rows...
                elif element.tag == "P":
                    if element.text is None:
                        continue

                    col_split = element.text.strip().split("<BR /> ")
                    p_typ, p_nr = ParagraphTyp.match_prefix(col_split[0])
                    toc_entry = TOC(
                        doknr=doknr,
                        jurabk=jurabk,
                        Ident=current_ident,
                        Title=current_title,
                        paragraph_typ=p_typ,
                        paragraph_nr=p_nr or None,
                        text=col_split[1] if len(col_split) > 1 else col_split[0],
                    )
                    toc_entries.append(toc_entry)

            return toc_entries

        except ET.ParseError as e:
            self.logger.error(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.DATABASE,
                default_event=LogEventDefault.GENERAL,
                message=f"Error parsing XML: {e}",  # , exc_info=True
            )
            return []
        except Exception as e:
            self.logger.error(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.DATABASE,
                default_event=LogEventDefault.GENERAL,
                message=f"Unexpected error: {e}",  # , exc_info=True
            )
            return []

    def _extract_toc(self, norms: list[Element], doknr: str, jurabk: str = None) -> list[TOC]:
        """
        Extracts the table of contents from the norms list.
        If found, the TOC norm is removed from the list.

        Args:
          norms (list[Element]): list of xml norm-elements
          doknr (str): the global document identifier
          jurabk (str): the law identifier

        Returns:
          list[TOC]: List of TOC objects
        """
        toc_entries = []
        try:
            # Check if the first remaining norm is the TOC (it should be after metadata)
            if norms:
                enbez_elem = norms[0].find("metadaten").find("enbez")
                if enbez_elem is not None and enbez_elem.text == "Inhaltsübersicht":
                    toc_elem = norms[0].find("textdaten").find("text")
                    if toc_elem.find("Content"):
                        toc_elem = toc_elem.find("Content")
                    if toc_elem.find("TOC"):
                        toc_elem = toc_elem.find("TOC")
                    toc_entries = self._parse_toc_xml(toc_elem, doknr, jurabk)
                    # pop from the norms list after parsing
                    norms.pop(0)
                else:
                    self.logger.warn(
                        action=EventAction.NOTIFY,
                        outcome=EventOutcome.UNKNOWN,
                        category=EventCategory.DATABASE,
                        default_event=LogEventDefault.GENERAL,
                        message="no table of contents found, attempting to generate " + "from gliederungseinheit norms",
                    )
        except Exception as e:
            self.logger.error(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.DATABASE,
                default_event=LogEventDefault.GENERAL,
                message=f"error extracting table of contents ({e})",  # , exc_info=True
            )

        return toc_entries

    def _extract_anlagen(self, norms: list[Element], doknr: str = None, jurabk: str = None) -> list[Anlage]:
        """
        Extracts attachments (Anlagen/Anhang) from the norms list (removing the entries).

        Args:
          norms (list[Element]): list of xml norm-elements
          doknr (str): the global document identifier
          jurabk (str): the law identifier

        Returns:
          list[Anlage]: List of Anlage objects
        """
        attachments = []
        # copy list because we're modifying original in the loop
        for norm in norms.copy():
            norm_meta_elem = norm.find("metadaten")
            enbez_elem = norm_meta_elem.find("enbez")
            enbez = enbez_elem.text if enbez_elem is not None else ""

            if "Anlage" in enbez or "Anhang" in enbez:
                try:
                    title_elem = norm_meta_elem.find("titel")
                    title = html_elem_to_md(title_elem) if title_elem is not None else ""
                    title = title.replace("\n", " ").strip()

                    content_elem = norm.find("textdaten").find("text").find("Content")
                    content = html_elem_to_md(content_elem) if content_elem is not None else ""

                    attachments.append(
                        Anlage(
                            title=title,
                            jurabk=jurabk or self.jurabk,
                            doknr=doknr or self.doknr,
                            content=content,
                        )
                    )
                    # remove from norms
                    norms.pop(norms.index(norm))
                except Exception as e:
                    self.logger.error(
                        action=EventAction.NOTIFY,
                        outcome=EventOutcome.FAILURE,
                        category=EventCategory.DATABASE,
                        default_event=LogEventDefault.GENERAL,
                        message=f"could not convert attachment text to markdown ({e})",  # , exc_info=True
                    )
        return attachments

    def _process_absatz(
        self,
        content: list[Element],
        paragraph_nr: int,
        sub_paragraph_nr: str,
        jurabk: str = None,
    ) -> list[Absatz]:
        """
        process absatz elements

        Args:
          norms (list[Element]): list of xml norm-elements
          jurabk (str): the law identifier
          paragraph_nr (int): numeric part of paragraph_nr
          sub_paragraph_nr (str): alphabetic part of paragraph_nr

        Returns:
          list[Absatz]: List of Absatz objects
        """
        # split absaetze
        absaetze: list[Absatz] = []
        for absatz in content:
            item = process_absatz(absatz)
            item.jurabk = jurabk or self.jurabk
            item.paragraph_nr = paragraph_nr
            item.sub_paragraph_nr = sub_paragraph_nr

            if item.absatz_nr == "null":
                if len(absaetze) < 1:
                    item.absatz_nr = "1"
                elif len(absaetze) >= 1:
                    prev_absatz = absaetze[-1]
                    prev_absatz.absatz_text += f"\n\n{item.absatz_text}"
                    # rewrite satz_ids + satz_nr
                    if prev_absatz.saetze:
                        prev_last_satz_nr = prev_absatz.saetze[-1].satz_nr
                        for i, satz in enumerate(item.saetze, start=1):
                            satz.satz_id = i + len(prev_absatz.saetze)
                            satz.satz_nr += prev_last_satz_nr
                        prev_absatz.saetze.extend(item.saetze)
                    continue
                else:
                    raise ValueError("Unexpected absatz state")
            absaetze.append(item)
        return absaetze

    def _extract_norms(self, norms: list[Element], doknr: str = None, jurabk: str = None) -> list[Norm]:
        """
        Extracts actual norms from the norms-element list.
        Ignores metadata, existing TOC, and attachments if encountered.

        Args:
          norms (list[Element]): list of xml norm-elements
          doknr (str): the global document identifier
          jurabk (str): the law identifier

        Returns:
          list[Norm]: List of Norm objects
        """
        norms_entries = []
        for norm in norms:
            norm_meta_elem = norm.find("metadaten")
            enbez_elem = norm_meta_elem.find("enbez")
            enbez = enbez_elem.text if enbez_elem is not None else ""

            # Skipping logic for things we handle elsewhere or don't want
            if "Anlage" in enbez or "Anhang" in enbez:
                continue

            if "Schlussformel" in enbez or "Schlußformel" in enbez:
                continue

            if enbez == "Inhaltsübersicht":
                continue

            if enbez == "Eingangsformel":
                continue

            # skip, marks §§ enbez (multiple norms weggefallen)
            enbez_split = re.split(r"\s+", enbez)
            if enbez_split[0] == "(XXXX)":
                continue

            # Check content
            norm_text_elem = norm.find("textdaten").find("text")
            content = []
            if norm_text_elem is not None and norm_text_elem.find("Content") is not None:
                for p in norm_text_elem.find("Content").findall("P"):
                    # skip underscore page dividers
                    if p.find("U") is not None:
                        continue
                    content.append(p)

            # skip empty norms and (weggefallen) norms
            if not content:
                continue

            first_content_md = html_elem_to_md(content[0])
            if first_content_md == "" or first_content_md.strip() == "(weggefallen)":
                continue

            titel_elem = norm_meta_elem.find("titel")
            titel = titel_elem.text if titel_elem is not None else ""

            if len(enbez_split) > 1:
                _paragraph_nr, sub_paragraph_nr = split_paragraph_nr_str(enbez_split[1])
            else:
                _paragraph_nr, sub_paragraph_nr = 0, ""  # Fallback or error?

            absaetze = self._process_absatz(content, _paragraph_nr, sub_paragraph_nr, jurabk)

            p_typ, _ = ParagraphTyp.match_prefix(enbez_split[0])

            norms_entries.append(
                Norm(
                    jurabk=jurabk or self.jurabk,
                    doknr=doknr or self.doknr,
                    paragraph_typ=p_typ,
                    paragraph_nr=_paragraph_nr,
                    sub_paragraph_nr=sub_paragraph_nr,
                    titel=titel,
                    paragraph_text="\n".join([html_elem_to_md(elem) for elem in content]),
                    absaetze=absaetze,
                )
            )
        return norms_entries

    def _parse_doc(self, doc: ET = None, **kwargs) -> Document:
        """
        parse an xml ElementTree from gii to tabular format

        Args:
          et (ElementTree): xml elementtree

        Returns:
          Document: DB Document object
        """
        if doc is None:
            et = self._get_doc()
        else:
            et = doc

        root = et.getroot()
        self.doknr = root.get("doknr")
        norms = root.findall("norm")

        # always modifies the norms list (pops the first metadata element)
        meta_entry = self._extract_document_metadata(root, norms)

        # modifies norms list if TOC is found at the start (pops it)
        toc_entries = self._extract_toc(norms, self.doknr)

        # extracts anlagen (modifieds norms list)
        attachments = self._extract_anlagen(norms, self.doknr)

        # ignores what's not a norm
        norms_entries = self._extract_norms(norms, self.doknr)

        # If TOC was not found, we generate it from norms
        if not toc_entries:
            for norm in norms_entries:
                toc_entries.append(
                    TOC(
                        doknr=self.doknr,
                        jurabk=self.jurabk,
                        Ident="",
                        Title="",
                        paragraph_typ=norm.paragraph_typ,
                        paragraph_nr=f"{norm.paragraph_nr}{norm.sub_paragraph_nr}",
                        text=norm.titel,
                    )
                )
            for anlage in attachments:
                toc_entries.append(
                    TOC(
                        doknr=self.doknr,
                        jurabk=self.jurabk,
                        Ident="",
                        Title="",
                        paragraph_typ=ParagraphTyp.ANLAGE,
                        paragraph_nr=None,
                        text=anlage.title,
                    )
                )

        return Document(
            doknr=self.doknr,
            doktyp=self.doctype,
            hierarchy="bund",
            fundstelle=meta_entry["fundstelle"],
            builddate=meta_entry["builddate"],
            ausfertigung_datum=meta_entry["ausfertigung_datum"],
            jurabk=self.jurabk,
            kurzue=meta_entry["kurzue"],
            langue=meta_entry["langue"],
            eingangsformel=meta_entry.get("eingangsformel"),
            standangaben=meta_entry["standangaben"],
            toc=toc_entries,
            normen=norms_entries,
            anlagen=attachments,
        )
