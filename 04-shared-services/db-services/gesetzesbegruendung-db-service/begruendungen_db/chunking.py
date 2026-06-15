"""markdown chunking for vectorisation"""

from dataclasses import dataclass

from begruendungen_db.schemas.db import Chunk
from begruendungen_db.config import app_config

from db_services_shared.llm.embeddings import EmbeddingClient

from db_services_shared.utils.docling import DoclingApiDoc, TextItem, extract_sections_from_doc


@dataclass
class RawChunk:
    dokumentnummer: str
    section_title: str
    section_text: str
    chunk_index: int
    chunk_text: str
    start_char: int
    end_char: int
    start_page: int
    end_page: int


def chunk_text_with_pages(
    texts: list[TextItem],
    chunk_size=app_config.chunking.size,
    overlap=app_config.chunking.overlap,
    dokumentnummer=None,
    section_title=None
) -> list[RawChunk]:
    """
    Chunk a section using DoclingDocument texts while keeping track of PDF pages.
    """
    separator = "\n\n"

    full_text = ""
    char_to_page = []

    for t in texts:
        t_text = t.text.strip()
        if not t_text:
            continue

        page_no = t.prov[0].page_no if t.prov else None

        # Add separator between blocks
        if full_text:
            full_text += separator
            char_to_page.extend([page_no] * len(separator))

        # Add actual text
        full_text += t_text
        char_to_page.extend([page_no] * len(t_text))

    chunks = []
    start = 0
    chunk_index = 0
    text_len = len(full_text)

    while start < text_len:
        end = min(start + chunk_size, text_len)

        chunk_text = full_text[start:end]

        start_page = char_to_page[start] if start < len(char_to_page) else None
        end_page = char_to_page[end - 1] if end - 1 < len(char_to_page) else None

        chunks.append(
            RawChunk(
                dokumentnummer=dokumentnummer,
                section_title=section_title,
                section_text=full_text,
                chunk_index=chunk_index,
                chunk_text=chunk_text,
                start_char=start,
                end_char=end,
                start_page=start_page,
                end_page=end_page
            )
        )

        chunk_index += 1

        if end == text_len:
            break

        start += chunk_size - overlap

    return chunks


def process_chunks(doc: DoclingApiDoc, dokumentnummer: str) -> list[RawChunk]:
    """process docling document and return list of chunks"""
    all_chunks = []

    sections = extract_sections_from_doc(doc)
    for sec in sections:
        all_chunks.extend(
            chunk_text_with_pages(
                sec.texts,
                dokumentnummer=dokumentnummer,
                section_title=sec.title
            )
        )

    return all_chunks


def vectorise_chunks(
    raw_chunks: list[RawChunk],
    jurabk: str,
    model: EmbeddingClient = None,
) -> list[Chunk]:
    """vectorise chunks and create DB rows"""
    if model is None:
        model = EmbeddingClient(app_config.chunking)
    chunks = []
    texts = [ch.chunk_text for ch in raw_chunks]
    embeddings = model.embed_documents(texts)
    for ch, emb in zip(raw_chunks, embeddings):
        if ch.chunk_text is None:
            continue
        new_chunk = Chunk(
            jurabk=jurabk,
            dokumentnummer=ch.dokumentnummer,
            section_title=ch.section_title,
            section_text=ch.section_text,
            chunk_index=ch.chunk_index,
            chunk_text=ch.chunk_text,
            start_page=ch.start_page,
            end_page=ch.end_page,
            embedding=emb,
        )
        chunks.append(new_chunk)
    return chunks
