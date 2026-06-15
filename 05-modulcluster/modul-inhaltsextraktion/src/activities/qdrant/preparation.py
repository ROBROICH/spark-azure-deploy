"""Helpers for preparing Qdrant point data from processed documents."""

from typing import Any

from src.schemas import ProcessedDocument
from src.workflows.qdrant.schemas import (
    ChunkMetadata,
    ParentChunkMetadata,
    QuestionMetadata,
)

__all__ = [
    "_chunk_metadata_from_dict",
    "_extract_hypothetical_questions",
    "_extract_parent_chunks",
    "_flatten_chunks",
]


def _chunk_metadata_from_dict(
    chunk_id: str,
    page_content: str,
    metadata: dict[str, Any],
    parent_chunk_id: str | None = None,
) -> ChunkMetadata:
    """Build ChunkMetadata from a raw metadata dict (works for both Chunk and SubChunk)."""
    return ChunkMetadata(
        chunk_id=str(chunk_id),
        page_content=page_content,
        page_numbers=metadata.get("page_numbers", []),
        chunk_type=metadata.get("chunk_type"),
        parent_chunk_id=str(parent_chunk_id) if parent_chunk_id else None,
        # headers / structure
        header_1=metadata.get("Header 1"),
        header_2=metadata.get("Header 2"),
        header_3=metadata.get("Header 3"),
        toc_path=metadata.get("toc_path", []),
        all_subchapters=metadata.get("all_subchapters", []),
        # element metadata
        asset_path=metadata.get("asset_path"),
        caption=metadata.get("caption"),
        summary=metadata.get("summary"),
        description=metadata.get("description"),
        content=metadata.get("content"),
        footnote=metadata.get("footnote"),
        # cross-chunk linking
        related_assets=metadata.get("related_assets", []),
        related_text=metadata.get("related_text", []),
        # enrichment
        focus_topic=metadata.get("focus_topic"),
        wildlife_mentioned=metadata.get("wildlife_mentioned"),
        plant_species_mentioned=metadata.get("plant_species_mentioned"),
        wildlife_species=metadata.get("wildlife_species", []),
        plant_species=metadata.get("plant_species", []),
        map_scale=metadata.get("map_scale"),
        hypothetical_questions=metadata.get("hypothetical_questions", []),
    )


def _flatten_chunks(processed_doc: ProcessedDocument) -> list[ChunkMetadata]:
    """Flatten document chunks into a list of ChunkMetadata with prev/next pointers."""
    prepared: list[ChunkMetadata] = []
    for chunk in processed_doc.chunks:
        if chunk.sub_chunks:
            for sub in chunk.sub_chunks:
                prepared.append(
                    _chunk_metadata_from_dict(
                        chunk_id=str(sub.chunk_id),
                        page_content=sub.page_content,
                        metadata=sub.metadata,
                        parent_chunk_id=str(sub.parent_chunk_id) if sub.parent_chunk_id else None,
                    )
                )
        else:
            prepared.append(
                _chunk_metadata_from_dict(
                    chunk_id=str(chunk.chunk_id),
                    page_content=chunk.page_content,
                    metadata=chunk.metadata,
                )
            )
    for i, cm in enumerate(prepared):
        cm.previous_chunk_id = prepared[i - 1].chunk_id if i > 0 else None
        cm.next_chunk_id = prepared[i + 1].chunk_id if i < len(prepared) - 1 else None
    return prepared


def _extract_hypothetical_questions(processed_doc: ProcessedDocument) -> list[QuestionMetadata]:
    """Extract hypothetical questions from parent chunks."""
    questions: list[QuestionMetadata] = []
    for chunk in processed_doc.chunks:
        for q_text in chunk.metadata.get("hypothetical_questions", []):
            if not q_text.strip():
                continue
            questions.append(
                QuestionMetadata(
                    question_text=q_text.strip(),
                    chunk_id=str(chunk.chunk_id),
                    parent_chunk_id=None,
                )
            )
    return questions


def _extract_parent_chunks(processed_doc: ProcessedDocument) -> list[ParentChunkMetadata]:
    """Extract parent chunks (only those that actually have sub_chunks)."""
    return [
        ParentChunkMetadata(
            chunk_id=str(chunk.chunk_id),
            page_content=chunk.page_content,
            page_numbers=chunk.metadata.get("page_numbers", []),
        )
        for chunk in processed_doc.chunks
        if chunk.sub_chunks
    ]
