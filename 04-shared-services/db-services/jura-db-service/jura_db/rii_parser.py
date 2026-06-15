"""Parser for Rechtsprechung im Internet (RII) court decision XML files"""

import logging
import pickle
from datetime import datetime
from pathlib import Path
from typing import Any, cast

from xsdata.formats.dataclass.context import XmlContext
from xsdata.formats.dataclass.models.generics import AnyElement
from xsdata.formats.dataclass.parsers import XmlParser
from xsdata.formats.dataclass.parsers.config import ParserConfig

from jura_db.chunking import process_doc, vectorise_chunks
from jura_db.schemas.db import (
    BaseListItem,
    Chunk,
    Document,
    Entscheidungsgrund,
    Grund,
    Leitsatz,
    Norm,
    Region,
    Tatbestand,
    Tenor,
    Citation,
)
from jura_db.schemas.dtd.rii_dok import DL, Div, Dokument

logger = logging.getLogger("rii_parser")

config = ParserConfig()
context = XmlContext()
parser = XmlParser(context=context, config=config)


def extract_list_item(elem: Any) -> BaseListItem:
    """
    extract BaseListItem from a <dl> element.
    """
    if isinstance(elem, AnyElement):
        # weird case where this is a list with an empty second DL element
        if (elem.children is not None
            and len(elem.children) == 2
            and cast(Any, elem.children[1]).dt.a is None):
            return extract_list_item(cast(Any, elem.children[0]))
        else:
            raise ValueError(
                f"Expected <dl> element to contain a single child, got '{elem.qname}'({elem.children})"
            )

    if isinstance(elem, Div):
        # If it's a div, we assume it has one dl child and extract that instead
        if not elem.dl:
            raise ValueError("Expected <div> element to contain a single <dl> child")
        return extract_list_item(elem.dl[0])

    if not isinstance(elem, DL):
        raise ValueError(f"Expected <dl> element, got <{elem.qname}>")

    return BaseListItem(
        title=cast(Any, elem.dt.a).text if elem.dt and elem.dt.a else None,
        text=cast(Any, elem.dd.p).text or "" if elem.dd and elem.dd.p else "",
    )


def extract_list_items(elem: Any) -> list[BaseListItem]:
    """
    extract a list of BaseListItem from a <div> AnyElement
    """
    if elem is None:
        return []

    if isinstance(elem, DL):
        return [extract_list_item(elem)]

    if not isinstance(elem, Div):
        raise ValueError(f"Expected <div> element, got <{elem.qname}>")

    items = [extract_list_item(dl) for dl in elem.dl]
    return items


def extract_norm(norm: str) -> Norm:
    """
    Extract structured information from a norm string.
    """
    split_str = norm.split(" ")
    jurabk = None
    jurabk_suffix = None
    paragraph_nr = None
    paragraph_nr_suffix = None
    absatz_nr = None
    match len(split_str):
        case 0:
            raise ValueError(f"Invalid norm format: '{norm}'")
        case 1:
            # Format: "BNatSchG"
            jurabk = split_str[0]
        case 2:
            jurabk = split_str[0]
            jurabk_suffix = split_str[1]
        case 3:
            # Format: "§ 44 BNatSchG"
            paragraph_nr = split_str[1]
            jurabk = split_str[2]
        case 4:
            # Format: "§ 44 BNatSchG 2009"
            paragraph_nr = split_str[1]
            jurabk = split_str[2]
            jurabk_suffix = split_str[3]
        case 5:
            # Format: "§ 44 Abs. 1 BNatSchG"
            paragraph_nr = split_str[1]
            absatz_nr = split_str[3]
            jurabk = split_str[4]
        case 6:
            # Format: "§ 44 Abs. 1 BNatSchG 2009"
            paragraph_nr = split_str[1]
            absatz_nr = split_str[3]
            jurabk = split_str[-2]
            jurabk_suffix = split_str[-1]
        case _:
            paragraph_nr = split_str[1]
            absatz_nr = split_str[3]
            # ignore satz and lower for now
            if len(split_str) % 2 == 0:
                jurabk = split_str[-2]
                jurabk_suffix = split_str[-1]
            else:
                jurabk = split_str[-1]

    if paragraph_nr:
        # Extract paragraph number and suffix if present
        import re

        match = re.match(r"(\d+)([a-zA-Z]*)", paragraph_nr)
        if match:
            paragraph_nr = int(match.group(1))
            paragraph_nr_suffix = match.group(2) if match.group(2) else None

    return Norm(
        full_text=norm,
        name=jurabk,
        name_suffix=jurabk_suffix,
        paragraph_nr=int(paragraph_nr) if paragraph_nr else None,
        paragraph_nr_suffix=paragraph_nr_suffix,
        absatz_nr=absatz_nr,
    )


def parse_doc(xml_path: str | Path) -> Document:
    raw_doc: Dokument = parser.parse(xml_path, Dokument)
    # if no norms are listed, doc is irrelevant!
    if raw_doc.norm.value.strip() == "":
        raise ValueError(
            f"Document {raw_doc.doknr.value} has no norms listed, skipping."
        )

    # xsdata can't do typing with optional fields, but will parse listitems?
    titelzeile_item = (
        extract_list_item(raw_doc.titelzeile.any_element)
        if raw_doc.titelzeile.any_element
        else None
    )
    titelzeile = (
        " ".join(filter(None, [titelzeile_item.title, titelzeile_item.text]))
        if titelzeile_item
        else None
    )
    sonstosatz_item = (
        extract_list_item(raw_doc.sonstosatz.any_element)
        if raw_doc.sonstosatz.any_element
        else None
    )
    sonstosatz = (
        " ".join(filter(None, [sonstosatz_item.title, sonstosatz_item.text]))
        if sonstosatz_item
        else None
    )

    leitsaetze_items = extract_list_items(raw_doc.leitsatz.any_element)
    leitsaetze = [
        Leitsatz(title=item.title, text=item.text, doc_id=raw_doc.doknr.value)
        for item in leitsaetze_items
    ]
    gruende_items = extract_list_items(raw_doc.gruende.any_element)
    gruende = [
        Grund(title=item.title, text=item.text, doc_id=raw_doc.doknr.value)
        for item in gruende_items
    ]
    tenor_items = extract_list_items(raw_doc.tenor.any_element)
    tenor = [
        Tenor(title=item.title, text=item.text, doc_id=raw_doc.doknr.value)
        for item in tenor_items
    ]
    tatbestaende_items = extract_list_items(raw_doc.tatbestand.any_element)
    tatbestaende = [
        Tatbestand(title=item.title, text=item.text, doc_id=raw_doc.doknr.value)
        for item in tatbestaende_items
    ]
    entscheidungsgruende_items = extract_list_items(
        raw_doc.entscheidungsgruende.any_element
    )
    entscheidungsgruende = [
        Entscheidungsgrund(title=item.title, text=item.text, doc_id=raw_doc.doknr.value)
        for item in entscheidungsgruende_items
    ]

    norms = [
        extract_norm(norm)
        for norm in raw_doc.norm.value.split(", ")
        if norm.strip() != ""
    ]

    doc = Document(
        doc_id=raw_doc.doknr.value,
        gericht=raw_doc.gertyp.value,
        spruchkoerper=raw_doc.spruchkoerper.value,
        entsch_datum=datetime.strptime(raw_doc.entsch_datum.value, "%Y%m%d").date(),
        aktenzeichen=raw_doc.aktenzeichen.value,
        doktyp=raw_doc.doktyp.value,
        mitwirkung=raw_doc.mitwirkung.value or "",
        vorinstanz=cast(Any, raw_doc.vorinstanz.any_element).text
        if raw_doc.vorinstanz.any_element
        else None,
        leitsaetze=leitsaetze,
        sonstosatz=sonstosatz,
        titelzeile=titelzeile,
        normen=norms,
        region=Region(
            abk=raw_doc.region.abk.value,
            long=raw_doc.region.long.value,
        ),
        tenor=tenor,
        gruende=gruende,
        tatbestaende=tatbestaende,
        entscheidungsgruende=entscheidungsgruende,
    )

    logger.debug("processing chunks")
    chunk_cache_path = Path(xml_path).with_suffix(".chunks.pkl")
    if chunk_cache_path.exists():
        logger.debug(f"Loading chunks from cache for document {doc.doc_id}")
        with open(chunk_cache_path, "rb") as f:
            raw_chunks = pickle.load(f)  # nosec B301 - cache wird nur lokal vom cli selbst geschrieben
            # reload data only because old relationships get cached in pickle
            chunks = []
            for ch in raw_chunks:
                chunk = Chunk(
                    citations=[Citation(**c.model_dump()) for c in ch.citations] if ch.citations else [],
                    **ch.model_dump(exclude={"citations", "normen"}),
                )
                norms = []
                # norms share a link table, so we should reuse them if they exist
                for norm in ch.normen:
                    norm_dict = norm.model_dump()
                    existing_norm = [norm for norm in doc.normen if norm.full_text == norm_dict["full_text"]]
                    if existing_norm != []:
                        norms.append(existing_norm[0])
                    else:
                        norms.append(Norm(**norm.model_dump()))
                chunk.normen=norms
                chunks.append(chunk)
    else:
        raw_chunks = process_doc(doc)
        logger.debug(f"Vectorising chunks for document {doc.doc_id}")
        chunks = vectorise_chunks(raw_chunks, doc.doc_id)
        with open(chunk_cache_path, "wb") as f:
            pickle.dump(chunks, f)
    doc.chunks = chunks

    return doc
