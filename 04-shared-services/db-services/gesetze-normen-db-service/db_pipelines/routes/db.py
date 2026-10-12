"""db call routes"""

import re
from typing import Annotated

from db_pipelines.config import app_config
from db_pipelines.constants import DESTATIS_TO_LEGAL, BundeslandParam
from db_pipelines.schemas.api import AbsatzFull, DocumentFull, LegaldefinitionRead, Norm, NormSimple, NormFull, TechnischeNormRead
from db_pipelines.schemas.db import TOC, Absatz, Anlage, Document, Legaldefinition, TechnischeNorm
from db_pipelines.schemas.db import Norm as DBNorm
from db_services_shared.models.db.database import get_db_session
from db_services_shared.utils.logging import get_logger
from db_services_shared.utils.parsing import split_paragraph_nr_str
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from authentification.dependencies import require_role
from authentification.enums import OidcRoles
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import Integer, cast
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload, selectinload
from sqlmodel import and_, distinct, func, or_, select

logger = get_logger(app_config.SERVICE_NAME)

db_router = APIRouter(
    dependencies=[
        Depends(require_role(allowed_roles=[OidcRoles.SERVICE])),
    ],
    responses={404: {"description": "No results found for given criteria"}},
)

SessionDep = Annotated[AsyncSession, Depends(get_db_session)]


async def resolve_jurabk(session: AsyncSession, jurabk: str, bundesland: BundeslandParam | None = None) -> str | None:
    """
    Resolve a potentially ambiguous jurabk to the actual stored jurabk.

    Lookup order:
    1. Exact match (case-insensitive), filtered by bundesland if given
    2. If bundesland given and no exact match: try with legal suffix
       (e.g. "LNatSchG" + "RhPf" -> "LNatSchG RhPf")
    3. If ambiguous (multiple states): raise 422
    4. Fallback: return input as-is (let caller handle not-found)
    """
    bl_name = bundesland.value if bundesland else None

    # 1. Exact match
    stmt = select(Document.jurabk).where(func.lower(Document.jurabk) == jurabk.lower())
    if bl_name:
        stmt = stmt.where(Document.bundesland == bl_name)
    result = (await session.execute(stmt)).scalars().first()
    if result is not None:
        return result

    # 2. Try with legal suffix (e.g. "LNatSchG" -> "LNatSchG RhPf")
    if bl_name:
        legal_suffix = DESTATIS_TO_LEGAL.get(bl_name)
        if legal_suffix:
            suffixed = f"{jurabk} {legal_suffix}"
            stmt = (
                select(Document.jurabk)
                .where(func.lower(Document.jurabk) == suffixed.lower())
                .where(Document.bundesland == bl_name)
            )
            result = (await session.execute(stmt)).scalars().first()
            if result is not None:
                return result

    # 3. Check for ambiguity: jurabk exists in multiple states without bundesland specified
    if not bl_name:
        stmt = (
            select(distinct(Document.bundesland))
            .where(func.lower(Document.jurabk) == jurabk.lower())
            .where(Document.bundesland.is_not(None))
        )
        states = (await session.execute(stmt)).scalars().all()
        if len(states) > 1:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Ambiguous jurabk '{jurabk}': exists in multiple states ({', '.join(sorted(states))}). "
                    f"Please specify the 'bundesland' query parameter."
                ),
            )

    return jurabk


@db_router.get("/bundeslaender/", response_model=list[str])
async def list_bundeslaender(session: SessionDep) -> list[str]:
    """Return all distinct Bundesland values currently loaded in the database."""
    result = await session.execute(select(distinct(Document.bundesland)).where(Document.bundesland.is_not(None)))
    return result.scalars().all()


@db_router.get("/documents/", response_model=list[Document])
async def read_documents(
    session: SessionDep,
    bundesland: BundeslandParam | None = Query(
        None, description="Filter by federal state (destatis abbreviation, e.g. BY, NW)"
    ),
) -> list[Document]:
    """
    Return all document entries in the database.
    Optionally filter by bundesland.
    """
    stmt = select(Document)
    if bundesland:
        stmt = stmt.where(Document.bundesland == bundesland.value)
    result = await session.execute(stmt)
    return result.scalars().all()


@db_router.get("/documents/{jurabk}", response_model=DocumentFull)
async def get_document(
    session: SessionDep,
    jurabk: str = "",
    bundesland: BundeslandParam | None = Query(
        None, description="Federal state to disambiguate (destatis abbreviation)"
    ),
):
    """
    Get a specific legal document by jurabk.
    Use `bundesland` to disambiguate when the same generic abbreviation
    exists in multiple states (e.g. LNatSchG).
    """
    resolved = await resolve_jurabk(session, jurabk, bundesland)
    stmt = (
        select(Document)
        .where(func.lower(Document.jurabk) == resolved.lower())
        .options(selectinload(Document.standangaben))
    )
    if bundesland:
        stmt = stmt.where(Document.bundesland == bundesland.value)
    result = (await session.execute(stmt)).scalars().first()
    if result is not None:
        return result
    else:
        raise HTTPException(status_code=404, detail="No Documents found for given criteria")


@db_router.get("/documents/search/{search_term}", response_model=list[Document])
async def search_documents(
    session: SessionDep,
    search_term: str = "",
    bundesland: BundeslandParam | None = Query(None, description="Filter by federal state (destatis abbreviation)"),
):
    """
    Search for legal documents by match on jurabk, kurzue or langue.
    Matching is case insensitive. Optionally filter by bundesland.
    """
    stmt = select(Document).where(
        or_(
            Document.jurabk.ilike(f"%{search_term}%"),
            Document.kurzue.ilike(f"%{search_term}%"),
            Document.langue.ilike(f"%{search_term}%"),
        )
    )
    if bundesland:
        stmt = stmt.where(Document.bundesland == bundesland.value)
    result = await session.execute(stmt)
    return result.scalars().all()


@db_router.get("/legaldefinitionen/{jurabk}", response_model=list[LegaldefinitionRead])
async def get_legaldefinitionen(
    session: SessionDep,
    jurabk: str,
    titel: str | None = Query(None, description="Optional exact title filter"),
    bundesland: BundeslandParam | None = Query(
        None, description="Federal state to disambiguate (destatis abbreviation)"
    ),
) -> list[Legaldefinition]:
    """Return legal definitions for a given jurabk, optionally filtered by title."""
    resolved = await resolve_jurabk(session, jurabk, bundesland)
    stmt = select(Legaldefinition).where(func.lower(Legaldefinition.jurabk) == resolved.lower())

    if titel is not None:
        stmt = stmt.where(Legaldefinition.titel == titel)

    result = await session.execute(
        stmt.order_by(
            cast(func.regexp_replace(Legaldefinition.paragraph_nr, r"\D.*$", ""), Integer),
            Legaldefinition.paragraph_nr,
            Legaldefinition.begriff,
        )
    )
    return result.scalars().all()


@db_router.get(
    "/technische-normen/{dokument}",
    response_model=TechnischeNormRead,
    responses={404: {"description": "No technische Norm found for given dokument"}},
)
async def get_technische_norm(
    session: SessionDep,
    dokument: str,
) -> TechnischeNorm:
    stmt = select(TechnischeNorm).where(func.lower(TechnischeNorm.dokument) == dokument.lower())
    result = await session.execute(stmt)
    norm = result.scalars().first()
    if norm is None:
        raise HTTPException(status_code=404, detail=f"No technische Norm found for dokument '{dokument}'")
    return norm


def sort_absaetze(absaetze: list[AbsatzFull]) -> list[AbsatzFull]:
    """
    sorts absaezte list by custom key:
    (paragraph_nr, sub_paragraph_nr, _absatz_nr, sub_absatz_nr)
    """

    def custom_sort_key(entry):
        def split_alpha_numeric(text):
            return re.split("([0-9]+)([a-z]+)", text)

        _absatz_nr, sub_absatz_nr = split_paragraph_nr_str(entry.absatz_nr)
        return (_absatz_nr, sub_absatz_nr)

    # sort saetze in case they aren't already
    for absatz in absaetze:
        absatz.saetze.sort(key=lambda s: s.satz_nr)

    return sorted(absaetze, key=custom_sort_key)


@db_router.get("/absatz/{jurabk}", response_model=list[AbsatzFull])
async def get_absaetze(
    session: SessionDep,
    jurabk: str,
    paragraph_nr: str | None = Query(None, description="Paragraph number (including alphabetic additions)"),
    absatz_nr: str | None = Query(None, description="absatz nr (including alphabetic additions)"),
    bundesland: BundeslandParam | None = Query(
        None, description="Federal state to disambiguate (destatis abbreviation)"
    ),
) -> list[AbsatzFull]:
    """Return all Absätze linked to the legal document referenced by `jurabk`.
    Use `bundesland` to disambiguate ambiguous abbreviations."""
    resolved = await resolve_jurabk(session, jurabk, bundesland)
    stmt = select(Absatz).where(Absatz.jurabk == resolved).options(joinedload(Absatz.saetze))

    if paragraph_nr is not None:
        _paragraph_nr, sub_paragraph_nr = split_paragraph_nr_str(paragraph_nr.strip())
        stmt = stmt.where(Absatz.paragraph_nr == _paragraph_nr)
        stmt = stmt.where(Absatz.sub_paragraph_nr == sub_paragraph_nr)

    if absatz_nr is not None:
        stmt = stmt.where(Absatz.absatz_nr == absatz_nr.strip())

    result = await session.execute(stmt.order_by(Absatz.paragraph_nr, Absatz.sub_paragraph_nr, Absatz.absatz_nr))
    results = result.scalars().unique().all()

    if not results:
        raise HTTPException(status_code=404, detail="No norms found for given criteria")

    return sort_absaetze(results)


def get_norms_search_query(jurabk: str, paragraph_nr: str, include_absaetze: bool, doknr: str | None = None) -> Query:
    """construct the sqlalchemy query for fetching norms"""
    stmt = select(DBNorm)

    if doknr:
        stmt = stmt.where(DBNorm.doknr == doknr)
    if jurabk:
        stmt = stmt.where(func.lower(DBNorm.jurabk) == jurabk.lower())

    if paragraph_nr:
        _paragraph_nr, sub_paragraph_nr = split_paragraph_nr_str(paragraph_nr)

        # find prev/next entries ordering properly
        order_by_list = [DBNorm.paragraph_nr, DBNorm.sub_paragraph_nr]
        windowed_cte = (
            select(
                DBNorm.jurabk,
                DBNorm.paragraph_nr,
                DBNorm.sub_paragraph_nr,
                func.lag(DBNorm.paragraph_nr).over(order_by=order_by_list).label("prev_nr"),
                func.lag(DBNorm.sub_paragraph_nr).over(order_by=order_by_list).label("prev_sub_nr"),
                func.lead(DBNorm.paragraph_nr).over(order_by=order_by_list).label("next_nr"),
                func.lead(DBNorm.sub_paragraph_nr).over(order_by=order_by_list).label("next_sub_nr"),
            )
            .where(func.lower(DBNorm.jurabk) == jurabk.lower())
            .cte("windowed")
        )

        # filter relevant rows, including prev/next
        filtered_cte = (
            select(windowed_cte.c)
            .where(
                and_(
                    func.lower(windowed_cte.c.jurabk) == jurabk.lower(),
                    or_(
                        and_(
                            windowed_cte.c.paragraph_nr == _paragraph_nr,
                            windowed_cte.c.sub_paragraph_nr == sub_paragraph_nr,
                        ),
                        and_(
                            windowed_cte.c.prev_nr == _paragraph_nr,
                            windowed_cte.c.prev_sub_nr == sub_paragraph_nr,
                        ),
                        and_(
                            windowed_cte.c.next_nr == _paragraph_nr,
                            windowed_cte.c.next_sub_nr == sub_paragraph_nr,
                        ),
                    ),
                )
            )
            .order_by(windowed_cte.c.paragraph_nr, windowed_cte.c.sub_paragraph_nr)
            .cte("filtered")
        )

        # Main query
        stmt = select(DBNorm).where(
            and_(
                func.lower(DBNorm.jurabk) == jurabk.lower(),
                DBNorm.paragraph_nr.in_(select(filtered_cte.c.paragraph_nr)),
                DBNorm.sub_paragraph_nr.in_(select(filtered_cte.c.sub_paragraph_nr)),
            )
        )

    # Add eager loading for absaetze if requested
    if include_absaetze:
        stmt = stmt.options(selectinload(DBNorm.absaetze).selectinload(Absatz.saetze))

    return stmt


def create_norm_result(query_result, paragraph_nr: str | None = None) -> list[Norm | NormFull]:
    """
    creates an api return object from a db output result
    """
    result = []

    if paragraph_nr:
        if len(query_result) == 1:
            entry = query_result[0]
        elif len(query_result) == 2:
            main = filter(
                lambda x: x.paragraph_nr == paragraph_nr,
                query_result,
            ).__next__()
            main.prev = query_result[0].paragraph_nr if query_result.index(main) == 1 else None
            main.next = query_result[1].paragraph_nr if query_result.index(main) == 0 else None
            entry = main
        elif len(query_result) == 3:
            entry = query_result[1]
            entry.prev = query_result[0].paragraph_nr
            entry.next = query_result[2].paragraph_nr
        elif len(query_result) >= 4:  # happens when prev hast alphabeic part
            logger.warn(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.UNKNOWN,
                category=EventCategory.DATABASE,
                default_event=LogEventDefault.DB_READ,
                message="more than 3 neighbouring entries found:"
                + f"{query_result[0].jurabk} {paragraph_nr} - "
                + f"{[(paragraph_nr) for x in query_result]}",
            )
            main = filter(
                lambda x: x.paragraph_nr == paragraph_nr,
                query_result,
            ).__next__()
            main.prev = query_result[query_result.index(main) - 1].paragraph_nr
            main.next = query_result[query_result.index(main) + 1].paragraph_nr
            entry = main
        else:
            logger.error(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.DATABASE,
                default_event=LogEventDefault.DB_READ,
                message="no neighbouring entries:" + f"{[(x.paragraph_nr, x.sub_paragraph_nr) for x in query_result]}",
            )
            raise Exception(f"no neighbouring entries found in\n {query_result}")
        result.append(entry)
    else:
        for i, norm in enumerate(query_result):
            entry = norm
            entry.prev = query_result[i - 1].paragraph_nr if i > 0 else None
            entry.next = query_result[i + 1].paragraph_nr if i < len(query_result) - 1 else None
            result.append(entry)

    return result


@db_router.get("/norms/{jurabk}/{paragraph_nr}", response_model=NormSimple)
async def get_norm(
    session: SessionDep,
    jurabk: str,
    paragraph_nr: str,
) -> NormSimple:
    """Return a single norm (including its Absätze) by jurabk and paragraph_nr."""
    _paragraph_nr, sub_paragraph_nr = split_paragraph_nr_str(paragraph_nr.strip())

    stmt = (
        select(DBNorm)
        .where(func.lower(DBNorm.jurabk) == jurabk.lower())
        .where(DBNorm.paragraph_nr == _paragraph_nr)
        .where(DBNorm.sub_paragraph_nr == sub_paragraph_nr)
        .options(selectinload(DBNorm.absaetze).selectinload(Absatz.saetze))
    )
    norm = (await session.execute(stmt)).scalars().first()

    if norm is None:
        raise HTTPException(status_code=404, detail="No norm found for given criteria")

    norm_dict = norm.model_dump(by_alias=True)
    norm_dict["paragraph_nr"] = "".join([str(norm.paragraph_nr), norm.sub_paragraph_nr])
    norm_dict["absaetze"] = [
        {**absatz.model_dump(), "saetze": [satz.model_dump() for satz in absatz.saetze]}
        for absatz in norm.absaetze
    ]

    result = NormSimple.model_validate(norm_dict)
    result.absaetze = sort_absaetze(result.absaetze)
    return result


@db_router.get("/norms/search", response_model=list[Norm | NormFull])
async def search_norms(
    session: SessionDep,
    paragraph_nr: str | None = Query(None, description="Paragraph number (including alphabetic additions)"),
    jurabk: str | None = Query(None, description="Case insensitive match on jurabk"),
    doknr: str | None = Query(None, description="Exact match on doknr"),
    include_absaetze: bool | None = Query(False, description="Whether to include absaetze in response"),
    bundesland: BundeslandParam | None = Query(
        None, description="Federal state to disambiguate (destatis abbreviation)"
    ),
) -> list[Norm | NormFull]:
    """
    Search all norms by jurabk and/or doknr and return each norm with its
    previous and next norms (by paragraph_nr order, skipping missing ones).

    At least one of `jurabk` or `doknr` must be provided. `jurabk` is not case sensitive.
    Use `bundesland` to disambiguate ambiguous abbreviations.
    returns empty list in case no norms are found.
    """
    if not (jurabk or doknr):
        raise HTTPException(
            status_code=400,
            detail="At least one of 'jurabk' or 'doknr' must be provided",
        )

    # fetch jurabk if not provided
    if doknr is not None and jurabk is None:
        jurabk = (await session.execute(select(Document.jurabk).where(Document.doknr == doknr))).scalar_one_or_none()
        if jurabk is None:
            return []

    # resolve ambiguous jurabk using bundesland context
    if jurabk and bundesland:
        jurabk = await resolve_jurabk(session, jurabk, bundesland)

    stmt = get_norms_search_query(jurabk, paragraph_nr, include_absaetze, doknr)

    logger.debug(
        action=EventAction.NOTIFY,
        outcome=EventOutcome.UNKNOWN,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_READ,
        message="fetching norms, query:\n" + str(stmt),
    )

    result = await session.execute(stmt.order_by(DBNorm.paragraph_nr, DBNorm.sub_paragraph_nr))
    results = result.scalars().all()

    if not results:
        return []

    # reconstruct paragraph_nr string
    # to keep same input/output types
    # and include absaetze if requested
    all_norms = []
    for norm in results:
        curr_norm_dict = norm.model_dump(by_alias=True)
        curr_norm_dict["paragraph_nr"] = "".join([str(norm.paragraph_nr), norm.sub_paragraph_nr])
        if include_absaetze:
            curr_norm_dict["absaetze"] = []
            for absatz in norm.absaetze:
                absatz_dict = absatz.model_dump()
                absatz_dict["saetze"] = [satz.model_dump() for satz in absatz.saetze]
                curr_norm_dict["absaetze"].append(absatz_dict)
            curr_norm_obj = NormFull.model_validate(curr_norm_dict)
        else:
            curr_norm_obj = Norm.model_validate(curr_norm_dict)
        all_norms.append(curr_norm_obj)

    if include_absaetze:
        all_norms = [NormFull.model_validate(norm) for norm in all_norms]
        for norm in all_norms:
            norm.absaetze = sort_absaetze(norm.absaetze)

    result = create_norm_result(all_norms, paragraph_nr)

    return result


@db_router.get("/toc/", response_model=list[TOC])
async def read_toc(
    session: SessionDep,
    doknr: str | None = Query(None, description="Filter TOC entries by document number"),
) -> list[TOC]:
    """
    Get Table of Contents (TOC) entries.

    Optionally filter by `doknr` to get TOC entries for a specific document.

    Example:
        GET /toc/                  -> returns all TOC entries
        GET /toc/?doknr=123456     -> returns TOC entries for that document
    """
    stmt = select(TOC)
    if doknr:
        stmt = stmt.where(TOC.doknr == doknr)
    results = (await session.execute(stmt)).scalars().all()

    if not results:
        raise HTTPException(status_code=404, detail="No TOC entries found")

    # TOC.paragraph_nr is stored as string; sort numerically (+ alphabetic
    # suffix) so §§ inserted out of order don't surface as "§39, §1, §2, …".
    # Non-§ rows (sections, Anlagen without a number) keep insertion order
    # at the end.
    def _sort_key(t: TOC) -> tuple[int, int, str, int]:
        nr, sub = split_paragraph_nr_str(t.paragraph_nr or "")
        if isinstance(nr, int):
            return (0, nr, sub or "", t.id or 0)
        return (1, 0, "", t.id or 0)

    return sorted(results, key=_sort_key)


@db_router.get("/anlagen/", response_model=list[Anlage])
async def read_anlagen(
    session: SessionDep,
    doknr: str = Query(description="Exact match on doknr"),
) -> list[Anlage]:
    """
    Return all Anlage (attachments) linked to the legal document referenced by `doknr`.

    These are typically annexes like technical tables or additional legal texts.
    Example Schema:
    {
        "title": "string",
        "content": "string",
        "doknr": "string"
    }
    """
    result = await session.execute(select(Anlage).where(Anlage.doknr == doknr))
    return result.scalars().all()
