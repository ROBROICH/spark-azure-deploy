"""db call routes"""

from typing import AsyncGenerator
import asyncio

# from event_logging.enums import (
#     EventAction,
#     EventCategory,
#     EventOutcome,
#     LogEventDefault,
# )
# from db_services_shared.utils.logger import logger
import logging
from typing import Annotated, Any, Optional

from db_services_shared.llm.embeddings import EmbeddingClient
from db_services_shared.models.db.database import get_db_session
from db_services_shared.utils.parsing import split_paragraph_nr_str
from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, HTTPException, Query
from openai import APITimeoutError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import and_, func, or_, select
from sqlmodel.sql.expression import SelectOfScalar

from jura_db.schemas.api import (
    ChunkRequest,
    ResponseChunk,
    ResponseNorm,
    SimilarityRequest,
)
from jura_db.schemas.db import (
    Chunk,
    Document,
    Grund,
    Norm,
    Region,
    Tenor,
)

logger = logging.getLogger("fastapi")


db_router = APIRouter(
    dependencies=[
        Depends(require_role(allowed_roles=[OidcRoles.SERVICE])),
    ],
    responses={404: {"description": "No results found for given criteria"}},
)


embedding_client: EmbeddingClient | None = None

async def get_model() -> AsyncGenerator[EmbeddingClient | None, None]:
    global embedding_client
    yield embedding_client

SessionDep = Annotated[AsyncSession, Depends(get_db_session)]
ModelDep = Annotated[EmbeddingClient | None, Depends(get_model)]


@db_router.get("/documents/", response_model=list[Document])
async def read_documents(
    limit: Optional[int] = Query(
        100, description="Maximum number of documents to return"
    ),
    offset: Optional[int] = Query(0, description="Number of documents to skip"),
    session: AsyncSession = Depends(get_db_session),
) -> list[Document]:
    """
    Return all court decision documents in the database.

    Supports pagination with limit and offset parameters.

    Example Schema:
    {
        "doc_id": "JURE100055035",
        "gertyp": "BGH",
        "spruchkoerper": "9. Zivilsenat",
        "entsch_datum": "20100114",
        "aktenzeichen": "IX ZB 76/09",
        "doktyp": "Beschluss"
    }
    """
    stmt = select(Document).limit(limit).offset(offset)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@db_router.get("/documents/search", response_model=list[Document])
async def search_documents(
    gertyp: Optional[str] = Query(
        None, description="Court type (e.g., 'BGH', 'BVerfG')"
    ),
    aktenzeichen: Optional[str] = Query(
        None, description="Case number (e.g., 'IX ZB 76/09')"
    ),
    doktyp: Optional[str] = Query(
        None, description="Document type (e.g., 'Beschluss', 'Urteil')"
    ),
    entsch_datum: Optional[str] = Query(
        None, description="Decision date (YYYYMMDD format)"
    ),
    limit: Optional[int] = Query(100, description="Maximum number of results"),
    session: AsyncSession = Depends(get_db_session),
) -> list[Document]:
    """
    Search for court decisions by various criteria.

    All search parameters are optional. Multiple criteria can be combined.

    Example:
        GET /documents/search?gertyp=BGH&doktyp=Beschluss
        GET /documents/search?aktenzeichen=IX ZB 76/09
    """
    stmt = select(Document)

    if gertyp:
        stmt = stmt.where(Document.gericht == gertyp)
    if aktenzeichen:
        stmt = stmt.where(Document.aktenzeichen == aktenzeichen)
    if doktyp:
        stmt = stmt.where(Document.doktyp == doktyp)
    if entsch_datum:
        stmt = stmt.where(Document.entsch_datum == entsch_datum)

    stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    results = list(result.scalars().all())

    if not results:
        raise HTTPException(
            status_code=404, detail="No documents found for given criteria"
        )

    return results


@db_router.get("/documents/by-norm", response_model=list[Document])
async def search_by_norm(
    norm_name: str = Query(
        ..., description="Legal norm to search for (e.g., '§ 315 InsO')"
    ),
    limit: Optional[int] = Query(
        100, description="Maximum number of documents to return"
    ),
    session: AsyncSession = Depends(get_db_session),
) -> list[Document]:
    """
    Find all court decisions that reference a specific legal norm.

    This endpoint is useful for legal research to find all cases that cite
    a particular law, regulation, or constitutional article.

    Args:
        norm_name: The legal norm to search for (e.g., '§ 315 InsO', 'Art. 3 GG')
        limit: Maximum number of documents to return

    Returns:
        list of court decisions that reference the specified norm

    Example:
        GET /documents/by-norm?norm_name=§ 315 InsO
        GET /documents/by-norm?norm_name=Art. 3 GG&limit=50
    """
    stmt = select(Document).where(Norm.full_text.in_([norm_name])).limit(limit)  # type: ignore[attr-defined]

    result = await session.execute(stmt)
    documents = list(result.scalars().all())

    if not documents:
        raise HTTPException(
            status_code=404,
            detail=f"No court decisions found that reference the norm '{norm_name}'",
        )

    return documents


@db_router.get("/documents/{doc_id}", response_model=Document)
async def read_document(
    doc_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> Document:
    """
    Get a specific court decision by its document ID.

    Args:
        doc_id: The unique document identifier (e.g., "JURE100055035")

    Returns:
        Complete court decision document with all metadata
    """
    result = await session.execute(
        select(Document).where(Document.doc_id == doc_id)
    )
    document = result.scalars().first()

    if not document:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")

    return document


@db_router.get("/norms/", response_model=list[Norm])
async def read_norms(
    doc_id: Optional[str] = Query(None, description="Filter by document ID"),
    norm_name: Optional[str] = Query(
        None, description="Filter by norm name (e.g., '§ 315 InsO')"
    ),
    limit: Optional[int] = Query(100, description="Maximum number of results"),
    session: AsyncSession = Depends(get_db_session),
) -> list[Norm]:
    """
    Get legal norms referenced in court decisions.

    Can be filtered by document ID or norm name.

    Example:
        GET /norms/?doc_id=JURE100055035
        GET /norms/?norm_name=§ 315 InsO
    """
    stmt = select(Norm)

    if doc_id:
        stmt = stmt.where(Norm.document.doc_id == doc_id)  # type: ignore[attr-defined]
    if norm_name:
        stmt = stmt.where(Norm.full_text == norm_name)

    stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    results = list(result.scalars().all())

    if not results:
        raise HTTPException(status_code=404, detail="No norms found for given criteria")

    return results


@db_router.get("/regions/", response_model=list[Region])
async def read_regions(
    abk: Optional[str] = Query(
        None, description="Filter by region abbreviation (e.g., 'DEU')"
    ),
    limit: Optional[int] = Query(100, description="Maximum number of results"),
    session: AsyncSession = Depends(get_db_session),
) -> list[Region]:
    """
    Get geographic regions referenced in court decisions.

    Can be filtered by document ID or region abbreviation.

    Example:
        GET /regions/?doc_id=JURE100055035
        GET /regions/?abk=DEU
    """
    stmt = select(Region)

    if abk:
        stmt = stmt.where(Region.abk == abk)

    stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    results = list(result.scalars().all())

    if not results:
        raise HTTPException(
            status_code=404, detail="No regions found for given criteria"
        )

    return results


@db_router.get("/tenor/", response_model=list[Tenor])
async def read_tenor(
    doc_id: Optional[str] = Query(None, description="Filter by document ID"),
    limit: Optional[int] = Query(100, description="Maximum number of results"),
    session: AsyncSession = Depends(get_db_session),
) -> list[Tenor]:
    """
    Get tenor (operative parts) of court decisions.

    Can be filtered by document ID.

    Example:
        GET /tenor/?doc_id=JURE100055035
    """
    stmt = select(Tenor)

    if doc_id:
        stmt = stmt.where(Tenor.doc_id == doc_id)

    stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    results = list(result.scalars().all())

    if not results:
        raise HTTPException(status_code=404, detail="No tenor found for given criteria")

    return results


@db_router.get("/gruende/", response_model=list[Grund])
async def read_gruende(
    doc_id: Optional[str] = Query(None, description="Filter by document ID"),
    name: Optional[str] = Query(None, description="Filter by section name/identifier"),
    limit: Optional[int] = Query(100, description="Maximum number of results"),
    session: AsyncSession = Depends(get_db_session),
) -> list[Grund]:
    """
    Get legal reasoning (Gruende) from court decisions.

    Can be filtered by document ID or section name.

    Example:
        GET /gruende/?doc_id=JURE100055035
        GET /gruende/?name=1
    """
    stmt = select(Grund)

    if doc_id:
        stmt = stmt.where(Grund.doc_id == doc_id)
    if name:
        stmt = stmt.where(Grund.title == name)

    stmt = stmt.limit(limit)
    result = await session.execute(stmt)
    results = list(result.scalars().all())

    if not results:
        raise HTTPException(
            status_code=404, detail="No gruende found for given criteria"
        )

    return results


@db_router.get("/documents/{doc_id}/complete", response_model=dict[str, Any])
async def read_complete_document(
    doc_id: str,
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, Any]:
    """
    Get a complete court decision with all related data.

    Returns the main document along with all related:
    - Legal norms
    - Geographic regions
    - Tenor
    - Legal reasoning (Gruende)

    Args:
        doc_id: The unique document identifier

    Returns:
        Complete document with all related data
    """
    # Get main document with all relationships eagerly loaded
    result = await session.execute(
        select(Document)
        .where(Document.doc_id == doc_id)
        .options(
            selectinload(Document.normen),  # type: ignore[arg-type]
            selectinload(Document.region),  # type: ignore[arg-type]
            selectinload(Document.tenor),  # type: ignore[arg-type]
            selectinload(Document.gruende),  # type: ignore[arg-type]
        )
    )
    document = result.scalars().first()

    if not document:
        raise HTTPException(status_code=404, detail=f"Document {doc_id} not found")

    return {
        "document": document,
        "norms": document.normen,
        "regions": document.region,
        "tenor": document.tenor,
        "gruende": document.gruende,
    }


@db_router.get("/stats", response_model=dict[str, int])
async def get_database_stats(
    session: AsyncSession = Depends(get_db_session),
) -> dict[str, int]:
    """
    Get database statistics.

    Returns counts of all major entities in the database.
    """
    doc_count = (await session.execute(select(func.count()).select_from(Document))).scalar_one()
    norm_count = (await session.execute(select(func.count()).select_from(Norm))).scalar_one()
    region_count = (await session.execute(select(func.count()).select_from(Region))).scalar_one()
    tenor_count = (await session.execute(select(func.count()).select_from(Tenor))).scalar_one()
    gruende_count = (await session.execute(select(func.count()).select_from(Grund))).scalar_one()

    return {
        "documents": doc_count,
        "legal_norms": norm_count,
        "regions": region_count,
        "tenor": tenor_count,
        "gruende": gruende_count,
    }


def db_to_response_norms(norms: list[Norm]) -> list[ResponseNorm]:
    """convert DB norm representation to response format"""
    normen = []
    for norm in norms:
        normen.append(
            ResponseNorm(
                name=norm.name,
                name_suffix=norm.name_suffix,
                paragraph=f"§ {norm.paragraph_nr}{norm.paragraph_nr_suffix if norm.paragraph_nr_suffix else ''}"
                if norm.paragraph_nr
                else None,
                absatz=f"Abs {norm.absatz_nr}" if norm.absatz_nr else None,
            )
        )
    return normen


def build_chunks_stmt(query: ChunkRequest) -> SelectOfScalar[Chunk]:
    """Construct the /chunks query with eager loading for async-safe access."""
    return (
        select(Chunk)
        .join(Chunk.document)  # type: ignore[arg-type]
        .options(
            selectinload(Chunk.document),  # type: ignore[arg-type]
            selectinload(Chunk.normen),  # type: ignore[arg-type]
        )
        .where(
            and_(
                Document.aktenzeichen == query.aktenzeichen,
                Chunk.section_number == str(query.section_number),
            )
        )
        .order_by(Chunk.chunk_id.asc())  # type: ignore[union-attr]
    )


def chunk_to_response(chunk: Chunk) -> ResponseChunk:
    """Convert a loaded DB chunk to the API response model."""
    assert chunk.document is not None
    assert chunk.chunk_id is not None
    return ResponseChunk(
        id=chunk.chunk_id,
        doc_id=chunk.doc_id,
        section_title=chunk.section_title,
        section_number=chunk.section_number,
        section_text=chunk.section_text,
        chunk_index=chunk.chunk_index,
        text=chunk.text,
        start_char=chunk.start_char,
        end_char=chunk.end_char,
        is_complete_section=chunk.is_complete_section,
        is_part_of=chunk.is_part_of,
        section_length=chunk.section_length,
        gericht=chunk.document.gericht,
        datum=chunk.document.entsch_datum,
        aktenzeichen=chunk.document.aktenzeichen,
        dokumenttyp=chunk.document.doktyp,
        normen=db_to_response_norms(chunk.normen or []),
    )


@db_router.post("/chunks")
async def get_chunks_filtered(
    query: ChunkRequest,
    session: SessionDep,
) -> list[ResponseChunk]:
    """get chunks, filtered by norm or aktenzeichen/section_number"""
    result = await session.execute(build_chunks_stmt(query))
    return [chunk_to_response(chunk) for chunk in result.scalars().all()]


async def filter_chunks_with_fallback(
    session: SessionDep,
    base_stmt: SelectOfScalar[Any],
    filter_normen: list[ResponseNorm],
) -> list[int]:
    """Apply norm filters with fallback to partial key matching if no results"""
    conditions_all_keys = []
    for norm in filter_normen:
        conditions_all_keys.append(Norm.name.contains(norm.name))  # type: ignore[attr-defined]
        if norm.name_suffix is not None:
            conditions_all_keys.append(Norm.name_suffix.contains(norm.name_suffix))  # type: ignore[attr-defined, union-attr]
        if norm.paragraph is not None:
            paragraph_nr, paragraph_nr_suffix = split_paragraph_nr_str(
                norm.paragraph.strip("§")
            )
            if paragraph_nr is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"could not parse paragraph nr {norm.paragraph}"
                )
            conditions_all_keys.append(Norm.paragraph_nr == paragraph_nr)
            if paragraph_nr_suffix is not None and paragraph_nr_suffix != "":
                conditions_all_keys.append(
                    Norm.paragraph_nr_suffix == paragraph_nr_suffix
                )
        if norm.absatz is not None:
            conditions_all_keys.append(Norm.absatz_nr.contains(norm.absatz))  # type: ignore[attr-defined, union-attr]

    stmt = base_stmt.where(and_(*conditions_all_keys))

    result = await session.execute(stmt)
    chunk_ids: list[int] = [c for c in result.scalars().all() if c is not None]

    # If no results, filter with partial keys (gesetz + paragraph only)
    if not chunk_ids or chunk_ids == []:
        conditions_partial = [cond for cond in conditions_all_keys if cond.left.name != Norm.absatz_nr.name]  # type: ignore[attr-defined, union-attr]

        stmt = base_stmt.where(and_(*conditions_partial))

        result = await session.execute(stmt)
        chunk_ids = [c for c in result.scalars().all() if c is not None]

    return chunk_ids


@db_router.post("/query_k_results")
async def query_top_k(
    query: SimilarityRequest,
    session: SessionDep,
    model: ModelDep,
) -> list[ResponseChunk]:
    """query for similarity, filtering results by norm citation"""
    # Filter by all norm keys (gesetz + paragraph + absatz)
    # Only select chunk_id to avoid loading 1024-dim embeddings into memory
    filter_normen = query.norms

    stmt_base = select(Chunk.chunk_id).join(Chunk.normen)  # type: ignore[arg-type]
    # Add filter for section_title
    stmt_base = stmt_base.where(
        or_(
            func.lower(Chunk.section_title) == "gruende",
            func.lower(Chunk.section_title) == "entscheidungsgruende",
        )
    )

    chunk_ids: list[int] = []
    if not filter_normen == []:
        chunk_ids = await filter_chunks_with_fallback(session, stmt_base, filter_normen)
        if not chunk_ids or chunk_ids == []:
            return []

    if model is None:
        raise HTTPException(status_code=503, detail="LLM model not initialized")

    # Apply vector similarity on filtered chunks
    try:
        query_embedding = await asyncio.to_thread(model.embed_query, query.query_text)
    except APITimeoutError as e:
        logger.error(f"LLM query timed out ({model.profile.model}), raising HTTPException")
        raise HTTPException(
            status_code=504,
            detail=f"LLM query timed out ({model.profile.model})",
        ) from e
    except Exception as e:
        raise e

    distance = Chunk.embedding.cosine_distance(query_embedding).label("distance")

    stmt = (
        select(Chunk, distance)
        .options(
            selectinload(Chunk.document),  # type: ignore[arg-type]
            selectinload(Chunk.normen),  # type: ignore[arg-type]
        )
    )
    if chunk_ids and chunk_ids != []:
        stmt = stmt.where(Chunk.chunk_id.in_(chunk_ids))  # type: ignore[union-attr]

    stmt = (stmt
        .order_by("distance")
        .limit(query.k)
    )

    result = await session.execute(stmt)
    rows = result.fetchall()

    results: list[ResponseChunk] = []
    for chunk, distance in rows:
        similarity = 1 - distance
        # only return one chunk per section
        if chunk.section_number in [result.section_number for result in results]:
            continue
        if similarity >= query.similarity_threshold:
            results.append(
                ResponseChunk(
                    id=chunk.chunk_id,
                    doc_id=chunk.doc_id,
                    section_title=chunk.section_title,
                    section_number=chunk.section_number,
                    section_length=chunk.section_length,
                    section_text=chunk.section_text,
                    start_char=chunk.start_char,
                    end_char=chunk.end_char,
                    is_complete_section=chunk.is_complete_section,
                    is_part_of=chunk.is_part_of,
                    chunk_index=chunk.chunk_index,
                    text=chunk.text,
                    gericht=chunk.document.gericht,
                    datum=chunk.document.entsch_datum,
                    aktenzeichen=chunk.document.aktenzeichen,
                    dokumenttyp=chunk.document.doktyp,
                    normen=db_to_response_norms(chunk.normen),
                    similarity=round(similarity, 4),
                )
            )

    return results
