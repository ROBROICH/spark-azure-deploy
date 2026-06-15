"""chunking pipeline"""

import re
from collections.abc import Sequence
from datetime import date
from typing import Any

from pydantic import BaseModel

from jura_db.config import app_config
from jura_db.schemas.db import Document, Norm, BaseListItem, Chunk, Citation

from db_services_shared.llm.embeddings import EmbeddingClient


class RawChunk(BaseModel):
    doc_id: str
    section_title: str
    section_number: str
    section_text: str
    chunk_index: int
    text: str
    start_char: int
    end_char: int
    section_length: int
    is_complete_section: bool
    is_part_of: str | None
    gericht: str
    datum: date
    aktenzeichen: str
    dokumenttyp: str
    normen: list[Norm]
    citations: list[Citation]


def find_relevant_norms(chunk_text: str, all_norms: list[Norm]) -> list[Norm]:
    """
    Findet alle Normen, die im Chunk-Text erwähnt werden.
    Paragraph und Gesetz müssen nah beieinander sein (max 30 Zeichen Abstand)
    Suffix ist optional - wird nicht gefordert
    """
    relevant_norms = []

    for norm in all_norms:
        # Gesetz mit optionalem Suffix (z.B. "BNatSchG" oder "BNatSchG 2009")
        gesetz_pattern = (
            rf"{norm.name}(?:\s+{norm.name_suffix})?"
            if norm.name_suffix
            else rf"{norm.name}"
        )

        paragraph_pattern = (
            rf"§\s*{norm.paragraph_nr}{norm.paragraph_nr_suffix if norm.paragraph_nr_suffix else ''}\b"
            if norm.paragraph_nr
            else None
        )
        # Paragraph und Gesetz in dieser Reihenfolge mit max 30 Zeichen Abstand
        combined_pattern = (
            rf"{paragraph_pattern}.{{0,30}}{gesetz_pattern}\b"
            if norm.paragraph_nr
            else gesetz_pattern
        )

        # Optional: Absatz - muss näher bei Paragraph sein (max 15 Zeichen)
        optional_pattern = (
            rf"{paragraph_pattern}\b.{{0,15}}Abs(?:atz)?\.?\s*{norm.absatz_nr}\b"
            if norm.absatz_nr
            else None
        )

        # Wenn Absatz gefordert, nutze die strikte Pattern
        if optional_pattern:
            has_norm = re.search(optional_pattern, chunk_text, re.IGNORECASE)
            if has_norm:
                relevant_norms.append(norm)
        else:
            # Ohne Absatz: Paragraph und Gesetz müssen nah beieinander sein
            has_norm = re.search(combined_pattern, chunk_text, re.IGNORECASE)
            if has_norm:
                relevant_norms.append(norm)

    return relevant_norms


def split_by_section_hierarchy(text: str) -> list[dict[str, Any]]:
    """
    Teilt Text nach nummerierten Abschnitten.
    Matched beide Formate:
    - "- 1 Der Kläger..." (mit Minus, kein Punkt)
    - "1. Der Kläger..." (mit Punkt)
    """
    # Pattern: "- 1 " ODER "1. " am Anfang einer Zeile
    # pattern = r"^(?:[-•]\s+)?(\d+)(?:\.\s+|\s+)"
    pattern = r"^(\d+)(?:\.\s+|\s+)"

    sections = []
    current_section = None

    for line in text.split("\n"):
        match = re.match(pattern, line)

        if match:
            # Neuer nummierter Abschnitt startet
            if current_section:
                sections.append(current_section)

            section_num = match.group(1)
            current_section = {
                "number": section_num,
                "text": line + "\n",
            }
        elif current_section is not None:
            # Zeile gehört zum aktuellen Abschnitt
            current_section["text"] += line + "\n"

    # Letzter Abschnitt nicht vergessen
    if current_section:
        sections.append(current_section)

    return sections


def extract_citations_with_rn(chunk_text: str) -> list[Citation]:
    """Extract case citations (Aktenzeichen + Randnummer) from text."""
    pattern = r"\b(\d{1,3})\s+([A-Z][a-z]{0,2}[A-Z]{0,2})\s+(\d+)[\./](\d{2,4}).*?Rn\.?\s*(\d+)"

    results = []
    for m in re.findall(pattern, chunk_text):
        az_formatted = f"{m[0]} {m[1]} {m[2]}/{m[3]}"
        results.append(
            Citation(
                chunk_id=None,
                aktenzeichen=az_formatted,
                randnummer=int(m[4]),
            )
        )

    return results


def chunk_section(section: dict[str, Any], document: Document) -> list[RawChunk]:
    """
    Hierarchisches Chunking mit hierarchischer Norm-Suche:
    1. Normen im Sub-Chunk suchen
    2. Wenn leer → Normen vom Hauptabschnitt verwenden
    """
    text = section["text"]
    main_sections = section["subsections"]
    main_title = section["title"]

    # Schritt 1: Normen für den GANZEN Hauptabschnitt suchen (Fallback)
    main_section_norms = find_relevant_norms(text, document.normen or [])
    if not main_section_norms:
        main_section_norms = document.normen or []

    # main_sections = split_by_section_hierarchy(text)
    chunks = []

    for sub in main_sections:
        section_num = sub["title"]
        section_text = sub["text"]

        # Schritt 2: Normen im Sub-Chunk suchen
        relevant_norms = find_relevant_norms(section_text, document.normen or [])

        # Schritt 3: Wenn keine gefunden → Hauptabschnitt-Normen verwenden
        if not relevant_norms:
            relevant_norms = main_section_norms

        for norm in relevant_norms:
            if norm.documents is not None and document not in norm.documents:
                norm.documents.append(document)

        total_length = len(section_text)

        if total_length <= app_config.chunking.size:
            # Kleine Sektion: ganzer Abschnitt = 1 Chunk
            chunks.append(
                RawChunk(
                    doc_id=document.doc_id,
                    section_title=main_title,
                    section_number=section_num,
                    section_text=section_text,
                    chunk_index=0,
                    text=section_text,
                    start_char=0,
                    end_char=total_length,
                    section_length=total_length,
                    is_complete_section=True,
                    is_part_of=None,
                    gericht=document.gericht,
                    datum=document.entsch_datum,
                    aktenzeichen=document.aktenzeichen,
                    dokumenttyp=document.doktyp,
                    normen=relevant_norms,
                    citations=[],  # temporary
                )
            )
        else:
            # Große Sektion: teile in Sub-Chunks mit hierarchischen Normen
            start = 0
            chunk_index = 0
            num_chunks = (
                total_length
                + app_config.chunking.size
                - app_config.chunking.overlap
                - 1
            ) // (app_config.chunking.size - app_config.chunking.overlap)

            while start < total_length:
                end = min(start + app_config.chunking.size, total_length)
                chunk_text = section_text[start:end]

                chunks.append(
                    RawChunk(
                        doc_id=document.doc_id,
                        section_title=main_title,
                        section_number=section_num,
                        section_text=section_text,
                        chunk_index=chunk_index,
                        text=chunk_text,
                        start_char=start,
                        end_char=end,
                        section_length=total_length,
                        is_complete_section=False,
                        is_part_of=f"{section_num}_part_{chunk_index}_of_{num_chunks}",
                        gericht=document.gericht,
                        datum=document.entsch_datum,
                        aktenzeichen=document.aktenzeichen,
                        dokumenttyp=document.doktyp,
                        normen=relevant_norms,
                        citations=[],  # temporary
                    )
                )

                chunk_index += 1
                start += app_config.chunking.size - app_config.chunking.overlap

    for chunk in chunks:
        chunk.citations = extract_citations_with_rn(chunk.text)

    return chunks


def split_into_subsections(section_entries: Sequence[BaseListItem]) -> list[dict[str, Any]]:
    """
    splits ListItems (e.g. Gruende) into hierarchical subsections based on numbering patterns
    """
    sections = []
    current_section = None

    for item in section_entries:
        if item.title:
            # Neuer Abschnitt startet
            if current_section:
                sections.append(current_section)

            current_section = {
                "title": item.title,
                "text": item.text,
            }
        elif current_section is not None:
            # Text gehört zum aktuellen Abschnitt
            current_section["text"] += (
                "\n" + item.text if current_section["text"] else item.text
            )

    # add last section
    if current_section:
        sections.append(current_section)

    return sections


def process_doc(doc: Document) -> list[RawChunk]:
    """Enrich a RechtsprechungDocument by chunking and creating text embeddings"""
    sections: list[dict[str, Any]] = []

    if doc.gruende:
        sections.extend(
            [
                {
                    "title": "gruende",
                    "text": "\n".join(f"{g.title} {g.text}" for g in doc.gruende),
                    "subsections": split_into_subsections(doc.gruende),
                }
            ]
        )
    if doc.entscheidungsgruende:
        sections.extend(
            [
                {
                    "title": "entscheidungsgruende",
                    "text": "\n".join(
                        f"{eg.title} {eg.text}" for eg in doc.entscheidungsgruende
                    ),
                    "subsections": split_into_subsections(doc.entscheidungsgruende),
                }
            ]
        )

    if not sections:
        raise ValueError(f"Document {doc.doc_id} has no sections to chunk?")

    all_chunks = []
    for section in sections:
        all_chunks.extend(chunk_section(section, doc))

    return all_chunks


def vectorise_chunks(
    raw_chunks: list[RawChunk],
    jurabk: str,
    model: EmbeddingClient | None = None,
) -> list[Chunk]:
    """vectorise chunks and create DB rows"""
    if model is None:
        model = EmbeddingClient(app_config.chunking)
    chunks = []
    texts = [ch.text for ch in raw_chunks]
    embeddings = model.embed_documents(texts)
    for ch, emb in zip(raw_chunks, embeddings):
        if ch.text is None:
            continue
        new_chunk = Chunk(
            embedding=emb,
            citations=ch.citations,
            normen=ch.normen,
            **ch.model_dump(exclude={"citations", "normen"}),
        )
        chunks.append(new_chunk)
    return chunks
