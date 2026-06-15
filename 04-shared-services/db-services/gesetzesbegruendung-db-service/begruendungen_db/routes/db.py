"""db call routes"""
import re
import logging
from typing import Optional, Annotated, AsyncGenerator

from db_services_shared.llm.embeddings import EmbeddingClient
from langchain_core.embeddings import Embeddings
from db_services_shared.models.db.database import get_db_session
from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload
from sqlmodel import func, or_, select, tuple_

from begruendungen_db.schemas.api import FullDocument, ResponseChunk, SimilarityRequest
from begruendungen_db.schemas.db import (
    AutorenAnzeige,
    Chunk,
    Document,
    Drucksachetyp,
    Fundstelle,
    Herausgeber,
    Rolle,
    Urheber,
    UrheberDokLink,
    Vorgangsbezug,
)

# from event_logging.enums import (
#     EventAction,
#     EventCategory,
#     EventOutcome,
#     LogEventDefault,
# )
# from db_services_shared.utils.logger import logger

db_router = APIRouter(
    dependencies=[
        Depends(require_role(allowed_roles=[OidcRoles.SERVICE])),
    ],
    responses={404: {"description": "No results found for given criteria"}},
)

embedding_client: EmbeddingClient | None = None

async def get_model() -> AsyncGenerator[Embeddings, None]:
    global embedding_client
    if embedding_client is None:
        raise HTTPException(status_code=503, detail="Embedding model not available")
    yield embedding_client.model


SessionDep = Annotated[AsyncSession, Depends(get_db_session)]
ModelDep = Annotated[Embeddings, Depends(get_model)]



@db_router.get("/document", response_model=FullDocument)
async def get_document(session: SessionDep, doknr: int) -> FullDocument:
    """return a single document by doknr, including full text"""
    result = await session.execute(
        select(Document).where(Document.doknr == doknr).options(selectinload(Document.text))
    )
    doc = result.scalars().first()
    if doc:
        return FullDocument(text=doc.text.text, **doc.model_dump())
    else:
        raise HTTPException(status_code=404, detail=f"could not find doknr: {doknr}")


@db_router.get("/documents", response_model=list[Document])
async def get_documents(session: SessionDep, full_text: bool = False) -> list[Document]:
    """
    Return all document entries in the database.

    These include metatdata about Gesetzbegründungen
    Example Schema:
    {
        "jurabk": "string",
        "aktualisiert": "2025-08-19T12:12:44.246Z",
        "autoren_anzahl": 0,
        "datum": "2025-08-19",
        "doknr": 0,
        "dokumentart": "string",
        "dokumentnummer": "string",
        "drucksachetyp": "Antrag",
        "herausgeber": "string",
        "titel": "string",
        "typ": "string",
        "text": [
        "string"
        ],
        "vorgangsbezug_anzahl": 0,
        "wahlperiode": 0
    }
    """
    result = await session.execute(select(Document))
    return result.scalars().all()



@db_router.get("/documents/search", response_model=list[Optional[Document]])
async def search_documents(
    session: SessionDep,
    jurabk: Annotated[
        str | None, Query(description="All documents for a jurabk")
    ] = None,
    dokumentnummer: Annotated[
        str | None, Query(description="Document with specific dokumentnummer")
    ] = None,
    drucksachetyp: Annotated[
        Drucksachetyp | None,
        Query(description="All documents of a specific drucksachetyp"),
    ] = None,
    herausgeber: Annotated[
        Herausgeber | None, Query(description="Get documents by a specific herausgeber")
    ] = None,
    doknr: Annotated[
        int | None, Query(description="Get document with specific doknr")
    ] = None,
) -> list[Optional[Document]]:
    """Search functionality over documents"""

    stmt = select(Document)

    if jurabk:
        stmt = stmt.where(func.lower(Document.jurabk) == jurabk.lower())
    if dokumentnummer:
        stmt = stmt.where(Document.dokumentnummer == dokumentnummer)
    if drucksachetyp:
        stmt = stmt.where(Document.drucksachetyp == drucksachetyp)
    if herausgeber:
        stmt = stmt.where(Document.herausgeber == herausgeber)
    if doknr:
        stmt = stmt.where(Document.doknr == doknr)

    logging.debug(str(stmt))

    result = await session.execute(stmt)
    return result.scalars().all()


@db_router.get("/urheber/", response_model=list[Urheber])
async def get_urheber(session: SessionDep) -> list[Urheber]:
    """
    Return all urheber entries in the database.

    Urheber are characterized by (einbringer, rolle, bezeichnung)
    Example Schema:

    """
    result = await session.execute(select(Urheber))
    return result.scalars().all()


@db_router.get("/urheber/search", response_model=list[Optional[Urheber]])
async def search_urheber(
    session: SessionDep,
    einbringer: Annotated[
        bool | None,
        Query(description="Urheber which are/aren't einbringer"),
    ] = None,
    rolle: Annotated[
        Rolle | None,
        Query(description="Urheber which have a specific role"),
    ] = None,
    bezeichnung: Annotated[
        str | None, Query(description="Explicitly search for a Urheber bei Bezeichnung")
    ] = None,
) -> list[Optional[Urheber]]:
    """Search functionality over Urheber"""

    stmt = select(Urheber)

    if einbringer:
        stmt = stmt.where(Urheber.einbringer == einbringer)
    if rolle:
        stmt = stmt.where(Urheber.rolle == rolle)
    if bezeichnung:
        stmt = stmt.where(Urheber.bezeichnung == bezeichnung)

    logging.debug(str(stmt))

    result = await session.execute(stmt)
    return result.scalars().all()


@db_router.get("/urheber_for_document/", response_model=list[Urheber])
async def get_urheber_for_documents(
    session: SessionDep,
    doknr: Annotated[
        int | None, Query(description="Documents for which urheber might be available")
    ] = None,
) -> list[Urheber]:
    """Returns the Urheber for the specified document"""

    stmt = select(UrheberDokLink)
    if doknr:
        stmt = stmt.where(UrheberDokLink.doknr == doknr)

    result = await session.execute(stmt)
    relevant_urheber = result.scalars().all()
    rel_urheber_pks = set(
        [(u.einbringer, u.rolle, u.bezeichnung) for u in relevant_urheber]
    )
    result = await session.execute(
        select(Urheber).where(
            tuple_(Urheber.einbringer, Urheber.rolle, Urheber.bezeichnung).in_(
                rel_urheber_pks
            )
        )
    )
    return result.scalars().all()


@db_router.get("/documents_for_urheber/", response_model=list[Document])
async def get_documents_for_urheber(
    session: SessionDep,
    einbringer: Annotated[
        bool | None,
        Query(
            description="Only documents where the herausgeber was / was not einbringer"
        ),
    ] = None,
    rolle: Annotated[
        Rolle | None,
        Query(description="Only documents where the herausgeber has a specific role"),
    ] = None,
    bezeichnung: Annotated[
        str | None, Query(description="Explicitly search for a Urheber")
    ] = None,
) -> list[Document]:
    """Returns the documents created by a current urheber"""

    stmt = select(UrheberDokLink)
    if einbringer:
        stmt = stmt.where(UrheberDokLink.einbringer == einbringer)
    if rolle:
        stmt = stmt.where(UrheberDokLink.rolle == rolle)
    if bezeichnung:
        stmt = stmt.where(UrheberDokLink.bezeichnung == bezeichnung)

    logging.debug(str(stmt))

    result = await session.execute(stmt)
    relevant_documents = result.scalars().all()
    rel_doc_ids = set([r.doknr for r in relevant_documents])
    result = await session.execute(
        select(Document).where(Document.doknr.in_(rel_doc_ids))
    )
    return result.scalars().all()


@db_router.get("/fundstelle/", response_model=list[Fundstelle])
async def get_fundstellen(session: SessionDep) -> list[Fundstelle]:
    """
    Return all <> entries in the database.

    Urheber are characterized by <>
    Example Schema:

    """
    result = await session.execute(select(Fundstelle))
    return result.scalars().all()


@db_router.get("/fundstelle/search", response_model=list[Optional[Fundstelle]])
async def search_fundstellen(
    session: SessionDep,
    dokumentnummer: Annotated[
        str | None,
        Query(description="Dokumentnummer the Fundstelle refers to"),
    ] = None,
    herausgeber: Annotated[
        Herausgeber | None, Query(description="Herausgeber of the refered to document")
    ] = None,
    urheber: Annotated[
        str | None, Query(description="Urheber of the document refered to")
    ] = None,  # testen
    drucksachetyp: Annotated[
        Drucksachetyp | None,
        Query(description="Drucksachetyp of th document refered to"),
    ] = None,
    doknr: Annotated[
        int | None, Query(description="Get document with specific doknr")
    ] = None,
) -> list[Optional[Fundstelle]]:
    """Search functionality over documents"""
    stmt = select(Fundstelle)

    if dokumentnummer:
        stmt = stmt.where(Fundstelle.dokumentnummer == dokumentnummer)
    if herausgeber:
        stmt = stmt.where(Fundstelle.herausgeber == herausgeber)
    if urheber:
        stmt = stmt.where(Fundstelle.urheber == urheber)
    if drucksachetyp:
        stmt = stmt.where(Fundstelle.drucksachetyp == drucksachetyp)
    if doknr:
        stmt = stmt.where(Fundstelle.doknr == doknr)

    logging.debug(str(stmt))

    result = await session.execute(stmt)
    return result.scalars().all()


@db_router.get("/vorgangsbezug/", response_model=list[Vorgangsbezug])
async def get_vorgangsbezug(session: SessionDep) -> list[Vorgangsbezug]:
    """
    Return all <> entries in the database.

    Urheber are characterized by <>
    Example Schema:

    """
    result = await session.execute(select(Vorgangsbezug))
    return result.scalars().all()


@db_router.get("/vorgangsbezug/search", response_model=list[Optional[Vorgangsbezug]])
async def search_vorgangsbezug(
    session: SessionDep,
    doknr: Annotated[
        int | None, Query(description="Get Vorgangsbezug with specific doknr")
    ] = None,
    vb_id: Annotated[int | None, Query(description="Id of the autor")] = None,
) -> list[Optional[Vorgangsbezug]]:
    """Search functionality over Vorgangsbezug"""
    stmt = select(Vorgangsbezug)

    if doknr:
        stmt = stmt.where(Vorgangsbezug.doknr == doknr)
    if vb_id:
        stmt = stmt.where(Vorgangsbezug.vb_id == vb_id)

    logging.debug(str(stmt))

    result = await session.execute(stmt)
    return result.scalars().all()


@db_router.get("/autoren_anzeige/", response_model=list[AutorenAnzeige])
async def get_autoren_anzeige(session: SessionDep) -> list[AutorenAnzeige]:
    """
    Return all <> entries in the database.

    Urheber are characterized by <>
    Example Schema:

    """
    result = await session.execute(select(AutorenAnzeige))
    return result.scalars().all()


@db_router.get("/autoren_anzeige/search", response_model=list[Optional[AutorenAnzeige]])
async def search_autoren_anzeige(
    session: SessionDep,
    doknr: Annotated[
        int | None, Query(description="Get document with specific doknr")
    ] = None,
    id: Annotated[int | None, Query(description="Id of the autor")] = None,
) -> list[Optional[AutorenAnzeige]]:
    """Search functionality over Autoren"""
    stmt = select(AutorenAnzeige)

    if doknr:
        stmt = stmt.where(AutorenAnzeige.doknr == doknr)
    if id:
        stmt = stmt.where(AutorenAnzeige.id == id)

    logging.debug(str(stmt))

    result = await session.execute(stmt)
    return list(result.scalars().all())


@db_router.post("/query_top_k")
async def query_top_k(
    query: SimilarityRequest,
    session: SessionDep,
    model: ModelDep,
) -> list[ResponseChunk]:
    """query for similarity, filtering results by jurabk/section text"""
    query_vec = await model.aembed_query(query.query_text)

    distance = Chunk.embedding.cosine_distance(query_vec).label("distance")

    # Subquery: select Chunk.id and distance, with row_number partitioned by section_text
    subq = select(
        Chunk.id.label("chunk_id"),
        distance,
        func.row_number()
            .over(
                partition_by=(Chunk.dokumentnummer, Chunk.section_title),
                order_by=distance
            )
            .label("rn")
    ).where(func.lower(Chunk.jurabk) == query.jurabk.lower())

    # Filter by section_title substrings if provided
    if (query.section_substrings is not None
        and query.section_substrings != []):
        # Build regex patterns with negative lookahead for letters/digits
        # patterns = [rf"{s}(?![a-zA-Z0-9])" for s in query.section_substrings]
        patterns = [f"(?<![a-zA-Z0-9]){re.escape(s)}(?![a-zA-Z0-9])" for s in query.section_substrings]

        # Apply OR regex filter on section_title
        subq = subq.where(or_(*[Chunk.section_title.op("~*")(p) for p in patterns]))

    # Turn into subquery for filtering rows
    subq = subq.subquery()

    # Outer query: join Chunk on id, eager load document, filter rn==1, order by distance
    stmt = (
        select(Chunk, subq.c.distance)
        .join(subq, Chunk.id == subq.c.chunk_id)
        .options(joinedload(Chunk.document))
        .where(subq.c.rn == 1)
        .order_by(subq.c.distance.asc())
        .limit(query.k)
    )

    result = await session.execute(stmt)
    # return only one chunk per section
    top_chunks = result.all() 

    # Return dict with similarity
    out_chunks = []
    for chunk, distance in top_chunks:
        out_chunks.append(ResponseChunk(
            similarity=1 - distance,
            datum=chunk.document.datum,
            dokumentart=chunk.document.dokumentart,
            drucksachetyp=chunk.document.drucksachetyp,
            herausgeber=chunk.document.herausgeber,
            titel=chunk.document.titel,
            **chunk.model_dump(),
        ))
    return out_chunks
