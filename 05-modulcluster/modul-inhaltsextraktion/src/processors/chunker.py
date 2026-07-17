"""
Handles the chunking of markdown content into hierarchical chunks.

High-level flow:
1. _build_parent_chunks  — isolate special elements, split by headers,
                           merge sparse/header-only, handle oversized
2. Build ToC from content list
3. _process_parent_chunk — for each parent: create sub-chunks, link, assign pages
4. Clean img_path from output

Sub-chunk creation details live in sub_chunk_builder.py.
Page tracking lives in page_tracker.py.
ToC building lives in toc_builder.py.
"""

import re
from typing import Any

from semantic_text_splitter import MarkdownSplitter
from temporalio import activity
from transformers import AutoTokenizer

from src.config import get_config
from src.processors.page_tracker import PAGE_TAG_STRIP_RE, assign_page_numbers, build_page_map
from src.processors.sub_chunk_builder import (
    SubChunkSpec,
    find_special_elements,
    link_related_chunks,
    merge_header_only_sub_chunks,
    process_image_element,
    process_table_element,
    process_text_segment,
)
from src.processors.text_splitters import Document, MarkdownHeaderTextSplitter, RecursiveCharacterTextSplitter
from src.processors.toc_builder import build_toc_from_content_list, get_clean_header, resolve_toc_path
from src.providers.base import ContentItemDict
from src.schemas import Chunk, ChunkEWMS, SubChunk

# ---------------------------------------------------------------------------
# Parent chunk assembly
# ---------------------------------------------------------------------------


def _isolate_special_elements(markdown_content: str) -> tuple[str, dict[str, str]]:
    """Replace BILD/TABELLE/table tags with placeholders to protect them from header splitting."""
    special_elements: dict[str, str] = {}
    element_counter = 0

    def placeholder_replacer(match: re.Match[str]) -> str:
        nonlocal element_counter
        key = f"__SPECIAL_ELEMENT_PLACEHOLDER_{element_counter}__"
        special_elements[key] = match.group(0)
        element_counter += 1
        return f"\n\n{key}\n\n"

    placeholder_pattern = re.compile(
        r"(<BILD.*?/BILD>|"
        r"<TABELLE.*?/TABELLE>|"
        r"<table\b[^>]*>.*?</table>)",
        re.DOTALL | re.IGNORECASE,
    )
    sanitized_content = placeholder_pattern.sub(placeholder_replacer, markdown_content)
    return sanitized_content, special_elements


def _split_by_headers(sanitized_content: str) -> list[Document]:
    """Split content by markdown headers using MarkdownHeaderTextSplitter."""
    headers_to_split_on: list[tuple[str, str]] = [
        ("#", "Header 1"),
        ("##", "Header 2"),
    ]
    markdown_splitter = MarkdownHeaderTextSplitter(headers_to_split_on, strip_headers=False)
    return markdown_splitter.split_text(sanitized_content)


def _merge_sparse_chunks(md_header_splits: list[Document]) -> list[Document]:
    """Merge chunks that contain only placeholders or whitespace into the next chunk."""
    i = len(md_header_splits) - 2
    while i >= 0:
        current_split = md_header_splits[i]
        cleaned_content = PAGE_TAG_STRIP_RE.sub("", current_split.page_content)
        cleaned_content = re.sub(r"__SPECIAL_ELEMENT_PLACEHOLDER_\d+__", "", cleaned_content).strip()
        if not cleaned_content:
            next_split = md_header_splits[i + 1]
            next_split.page_content = f"{current_split.page_content}\n\n{next_split.page_content}"
            md_header_splits.pop(i)
        i -= 1
    return md_header_splits


def _is_header_only_split(page_content: str) -> bool:
    """Return True if the split contains only page tags and markdown headings."""
    cleaned = PAGE_TAG_STRIP_RE.sub("", page_content)
    cleaned = re.sub(r"^#{1,6}\s+.*$", "", cleaned, flags=re.MULTILINE)
    return not cleaned.strip()


def _merge_header_only_parent_chunks(md_header_splits: list[Document]) -> list[Document]:
    """Merge header-only parent chunks into the next content chunk."""
    pending: Document | None = None
    result: list[Document] = []

    for split in md_header_splits:
        if pending is not None:
            split.page_content = f"{pending.page_content}\n\n{split.page_content}"
            pending = None

        if _is_header_only_split(split.page_content):
            pending = split
        else:
            result.append(split)

    if pending is not None:
        if result:
            result[-1].page_content = f"{result[-1].page_content}\n\n{pending.page_content}"
        else:
            result.append(pending)

    return result


def _handle_oversized_chunks(
    md_header_splits: list[Document],
    special_elements: dict[str, str],
    max_chunk_char: int | None = None,
) -> list[Document]:
    """Rehydrate placeholders and force-split any parent chunks that are still oversized."""
    cfg = get_config()
    chunk_size = max_chunk_char or cfg.PARENT_CHUNK_MAX_CHARACTERS
    processed_splits: list[Document] = []
    recursive_splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size,
        chunk_overlap=cfg.CHUNK_OVERLAP,
        length_function=len,
        is_separator_regex=False,
    )

    for header_split in md_header_splits:
        temp_rehydrated_content = header_split.page_content
        for key, value in special_elements.items():
            temp_rehydrated_content = temp_rehydrated_content.replace(key, value)

        if len(temp_rehydrated_content) > chunk_size:
            activity.logger.warning(
                f"A parent chunk exceeded the {chunk_size} character limit and will be force-split. "
                "This may indicate an issue with header detection."
            )

            rehydrated_doc = Document(
                page_content=temp_rehydrated_content,
                metadata=header_split.metadata.copy(),
            )

            further_splits_docs = recursive_splitter.split_documents([rehydrated_doc])

            for further_split in further_splits_docs:
                rehydrated_further_split_content = further_split.page_content
                for key, value in special_elements.items():
                    rehydrated_further_split_content = rehydrated_further_split_content.replace(key, value)
                further_split.page_content = rehydrated_further_split_content
                processed_splits.append(further_split)
        else:
            header_split.page_content = temp_rehydrated_content
            processed_splits.append(header_split)

    return processed_splits


def _build_parent_chunks(markdown_content: str, max_chunk_size: int | None = None) -> list[Document]:
    """Isolate elements, split by headers, merge sparse/header-only, handle oversized."""
    sanitized_content, special_elements = _isolate_special_elements(markdown_content)
    md_header_splits = _split_by_headers(sanitized_content)
    md_header_splits = _merge_sparse_chunks(md_header_splits)
    md_header_splits = _merge_header_only_parent_chunks(md_header_splits)
    return _handle_oversized_chunks(md_header_splits, special_elements, max_chunk_size)


# ---------------------------------------------------------------------------
# Per-parent-chunk processing
# ---------------------------------------------------------------------------


def _process_parent_chunk(
    split: Document,
    text_splitter: RecursiveCharacterTextSplitter,
    all_valid_headers: list[str],
    toc: dict[str, list[str]],
    parent_map: dict[str, str],
    last_valid_path: list[str],
    last_valid_unterkapitel: list[str],
    doc_wide_last_known_page: int,
) -> tuple[Chunk, list[str], list[str], int]:
    """Build sub-chunks for a single parent chunk.

    Returns:
        Tuple of (chunk, last_valid_path, last_valid_unterkapitel, doc_wide_last_known_page)
    """
    main_chunk = Chunk(page_content=split.page_content, metadata=split.metadata)
    main_chunk.header = get_clean_header(split.metadata)

    last_valid_path, last_valid_unterkapitel = resolve_toc_path(
        main_chunk,
        all_valid_headers,
        toc,
        parent_map,
        last_valid_path,
        last_valid_unterkapitel,
    )

    page_map, chunk_starts_on_page, doc_wide_last_known_page = build_page_map(
        main_chunk.page_content, doc_wide_last_known_page
    )
    sorted_page_positions = sorted(page_map.keys())

    all_pages_in_chunk = list(page_map.values())
    main_chunk.metadata["page_numbers"] = sorted(set(all_pages_in_chunk))

    base_sub_chunk_metadata = main_chunk.metadata.copy()

    # Collect sub-chunk specs from text segments and special elements
    all_sub_chunk_specs: list[SubChunkSpec] = []
    last_end = 0
    for elem in find_special_elements(main_chunk.page_content):
        text_segment = main_chunk.page_content[last_end : elem.start]
        all_sub_chunk_specs.extend(process_text_segment(text_segment, text_splitter, last_end))
        if elem.type == "bild":
            all_sub_chunk_specs.extend(process_image_element(elem, text_splitter))
        else:
            all_sub_chunk_specs.extend(process_table_element(elem, text_splitter))
        last_end = elem.end

    remaining_text = main_chunk.page_content[last_end:]
    all_sub_chunk_specs.extend(process_text_segment(remaining_text, text_splitter, last_end))

    # Convert specs into SubChunk objects
    all_sub_chunks_with_type: list[dict[str, Any]] = []
    for content, chunk_type_str, metadata_updates, start_pos in all_sub_chunk_specs:
        if not content.strip():
            continue
        final_metadata = {
            **base_sub_chunk_metadata,
            **metadata_updates,
            "chunk_type": chunk_type_str,
        }
        sub_chunk = SubChunk(
            page_content=content,
            metadata=final_metadata,
            parent_chunk_id=main_chunk.chunk_id,
            header=main_chunk.header,
        )
        all_sub_chunks_with_type.append({"chunk": sub_chunk, "type": chunk_type_str, "start_pos": start_pos})

    link_related_chunks(all_sub_chunks_with_type)

    final_sub_chunks = assign_page_numbers(
        all_sub_chunks_with_type,
        page_map,
        sorted_page_positions,
        chunk_starts_on_page,
    )

    merged_sub_chunks = merge_header_only_sub_chunks(final_sub_chunks, main_chunk)

    # Ensure every parent chunk has at least one sub-chunk
    if not merged_sub_chunks and main_chunk.page_content.strip():
        merged_sub_chunks = [
            SubChunk(
                page_content=main_chunk.page_content,
                metadata={**main_chunk.metadata, "chunk_type": "text"},
                parent_chunk_id=main_chunk.chunk_id,
                header=main_chunk.header,
            )
        ]

    main_chunk.sub_chunks = merged_sub_chunks

    # Remove internal Header keys from output metadata
    for h_key in ["Header 1", "Header 2", "Header 3"]:
        main_chunk.metadata.pop(h_key, None)
        for sc in merged_sub_chunks:
            sc.metadata.pop(h_key, None)

    return (
        main_chunk,
        last_valid_path,
        last_valid_unterkapitel,
        doc_wide_last_known_page,
    )


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

_TOKENIZER = AutoTokenizer.from_pretrained(
    get_config().EWMS_CHUNK_TOKENIZER_NAME, revision=get_config().EWMS_CHUNK_TOKENIZER_REVISION
)  # nosec B615


def chunk_markdown_ewms(markdown_content: str) -> list["ChunkEWMS"]:
    """Splits markdown content into token-bounded segments and maps them to document pages.

    This function leverages a token-aware MarkdownSplitter initialized with the
    core backend tokenizer to chunk the text without exceeding a specified token
    maximum. It then sequentially tracks and resolves page markers across chunks
    to assign an accurate, sorted list of page numbers to each chunked segment.
    """
    cfg = get_config()

    # Step 1: Initialize the MarkdownSplitter using the backend tokenizer
    splitter = MarkdownSplitter.from_huggingface_tokenizer(
        _TOKENIZER.backend_tokenizer,
        cfg.EWMS_CHUNK_MAX_TOKENS,
        overlap=0,
    )
    splits = splitter.chunks(markdown_content)

    chunks_ewms = []
    doc_wide_last_known_page = 1

    # Step 2: Iterate through each textual split to compute its relative page map
    for split in splits:
        page_map, _, doc_wide_last_known_page = build_page_map(split, doc_wide_last_known_page)
        all_pages_in_chunk = list(page_map.values())
        page_numbers = sorted(set(all_pages_in_chunk))

        # Step 3: Bundle the text segment along with its unique, sorted page sequence
        chunks_ewms.append(ChunkEWMS(page_content=split, page_numbers=page_numbers))

    return chunks_ewms


def chunk_markdown(markdown_content: str, content_list: list[ContentItemDict]) -> list[Chunk]:
    """Chunk markdown by headers into hierarchical Chunk / SubChunk objects.

    1. Build parent chunks from markdown
    2. Build ToC from content list
    3. For each parent: process into Chunk with sub-chunks
    4. Clean img_path from output
    """
    processed_splits = _build_parent_chunks(markdown_content)

    toc, parent_map = build_toc_from_content_list(content_list)
    all_valid_headers = list(parent_map.keys())

    cfg = get_config()
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=cfg.CHUNKING_MAX_CHARACTERS,
        chunk_overlap=cfg.CHUNK_OVERLAP,
    )
    final_chunks: list[Chunk] = []
    doc_wide_last_known_page = 1
    last_valid_path: list[str] = []
    last_valid_unterkapitel: list[str] = []

    for split in processed_splits:
        if not split.page_content.strip():
            continue
        chunk, last_valid_path, last_valid_unterkapitel, doc_wide_last_known_page = _process_parent_chunk(
            split,
            text_splitter,
            all_valid_headers,
            toc,
            parent_map,
            last_valid_path,
            last_valid_unterkapitel,
            doc_wide_last_known_page,
        )
        final_chunks.append(chunk)

    for chunk in final_chunks:
        chunk.page_content = re.sub(r'(<(?:BILD|TABELLE)) img_path="[^"]*"', r"\1", chunk.page_content)

    return final_chunks


class MarkdownChunker:
    """Backward-compatible wrapper. Prefer importing chunk_markdown() directly."""

    chunk_markdown = staticmethod(chunk_markdown)
    chunk_markdown_ewms = staticmethod(chunk_markdown_ewms)
    _merge_header_only_parent_chunks = staticmethod(_merge_header_only_parent_chunks)
