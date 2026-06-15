"""Service layer for supplementary requests."""

from typing import Any, Literal, cast
from uuid import UUID

from audit_client import ChangeType, record_audit_entry
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from sqlalchemy import Column, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from src.exceptions import (
    DuplicateSourceBindingError,
    InvalidSortParameterError,
    SupplementaryRequestNotFoundError,
)
from src.models.db.db_models import SupplementaryRequest
from src.models.db.enums import SourceType
from src.models.schemas.supplementary_request_schemas import (
    CreateSupplementaryRequestRequest,
    SourceRef,
    UpdateSupplementaryRequestRequest,
)
from src.utils.logger import logger

SortDirection = Literal["asc", "desc"]
_SORTABLE_COLUMNS = {
    "created_at": SupplementaryRequest.created_at,
    "updated_at": SupplementaryRequest.updated_at,
}


def _decompose_source_ref(data: dict[str, Any], source_ref: SourceRef | None) -> dict[str, Any]:
    """Extract source_ref into flat source_type/source_item_id columns."""
    if source_ref is not None:
        data["source_type"] = source_ref.type
        data["source_item_id"] = source_ref.item_id
    else:
        data["source_type"] = None
        data["source_item_id"] = None
    return data


def _get_sort_column_and_direction(
    sort: str,
) -> tuple[Column[Any], SortDirection]:
    """Validate sort parameter and return matching column and direction."""
    sort_field, separator, sort_direction = sort.partition(":")
    if separator == "" or sort_field not in _SORTABLE_COLUMNS or sort_direction not in ("asc", "desc"):
        raise InvalidSortParameterError(sort)
    return _SORTABLE_COLUMNS[sort_field], cast(SortDirection, sort_direction)


async def _source_binding_exists(
    db: AsyncSession,
    project_id: UUID,
    source_type: SourceType,
    source_item_id: str,
    exclude_request_id: UUID | None = None,
) -> bool:
    """Check whether a source binding already exists for a project."""
    query = select(SupplementaryRequest.id).where(
        SupplementaryRequest.project_id == project_id,
        SupplementaryRequest.source_type == source_type,
        SupplementaryRequest.source_item_id == source_item_id,
    )
    if exclude_request_id is not None:
        query = query.where(SupplementaryRequest.id != exclude_request_id)

    result = await db.execute(query)
    return result.scalar_one_or_none() is not None


def _raise_duplicate_source_binding_error(
    project_id: UUID,
    source_ref: SourceRef,
) -> None:
    raise DuplicateSourceBindingError(
        project_id=str(project_id),
        source_type=str(source_ref.type),
        source_item_id=source_ref.item_id,
    )


async def _commit_with_duplicate_fallback(
    db: AsyncSession,
    project_id: UUID,
    source_ref: SourceRef | None,
    exclude_request_id: UUID | None = None,
) -> None:
    """Commit and map race-condition duplicates to domain error."""
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        if source_ref and await _source_binding_exists(
            db=db,
            project_id=project_id,
            source_type=source_ref.type,
            source_item_id=source_ref.item_id,
            exclude_request_id=exclude_request_id,
        ):
            _raise_duplicate_source_binding_error(project_id, source_ref)
        raise


async def create_supplementary_request(
    db: AsyncSession,
    project_id: UUID,
    request_data: CreateSupplementaryRequestRequest,
    audit_context: dict[str, Any] | None = None,
) -> SupplementaryRequest:
    """Create a new supplementary request."""
    source_ref = request_data.source_ref
    if source_ref and await _source_binding_exists(
        db=db,
        project_id=project_id,
        source_type=source_ref.type,
        source_item_id=source_ref.item_id,
    ):
        _raise_duplicate_source_binding_error(project_id, source_ref)

    request_dict = request_data.model_dump(exclude={"source_ref"})
    request_dict["project_id"] = project_id
    _decompose_source_ref(request_dict, source_ref)

    supplementary_request = SupplementaryRequest(**request_dict)
    db.add(supplementary_request)
    await db.flush()

    if audit_context is not None:
        await record_audit_entry(
            db,
            project_id=project_id,
            entity_type="supplementary_request",
            change_type=ChangeType.CREATE,
            entity_id=cast(UUID, supplementary_request.id),
            **audit_context,
        )

    await _commit_with_duplicate_fallback(
        db=db,
        project_id=project_id,
        source_ref=source_ref,
    )

    await db.refresh(supplementary_request)

    logger.info(
        action=EventAction.WRITE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=(f"Created supplementary request {supplementary_request.id} for project {project_id}"),
    )

    return supplementary_request


async def get_supplementary_request_for_project(
    db: AsyncSession,
    project_id: UUID,
    request_id: UUID,
) -> SupplementaryRequest:
    """Get a supplementary request and validate it belongs to the specified project."""
    result = await db.execute(
        select(SupplementaryRequest).where(
            SupplementaryRequest.id == request_id,
            SupplementaryRequest.project_id == project_id,
        )
    )
    supplementary_request = result.scalar_one_or_none()
    if not supplementary_request:
        raise SupplementaryRequestNotFoundError(str(request_id))

    return supplementary_request


async def list_supplementary_requests_for_project(
    db: AsyncSession,
    project_id: UUID,
    source_types: list[SourceType] | None = None,
    included_in_letter: bool | None = None,
    sort: str = "created_at:asc",
    limit: int | None = None,
    offset: int | None = None,
) -> list[SupplementaryRequest]:
    """List supplementary requests for a project with optional filtering and pagination."""
    query = select(SupplementaryRequest).where(SupplementaryRequest.project_id == project_id)

    if source_types:
        query = query.where(SupplementaryRequest.source_type.in_(source_types))
    if included_in_letter is not None:
        query = query.where(SupplementaryRequest.included_in_letter == included_in_letter)

    column, sort_direction = _get_sort_column_and_direction(sort)
    query = query.order_by(column.desc() if sort_direction == "desc" else column.asc())

    if offset is not None:
        query = query.offset(offset)
    if limit is not None:
        query = query.limit(limit)

    result = await db.execute(query)
    requests = list(result.scalars().all())

    logger.info(
        action=EventAction.READ,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_READ,
        message=(f"Retrieved {len(requests)} supplementary requests for project {project_id}"),
    )

    return requests


async def update_supplementary_request_for_project(
    db: AsyncSession,
    project_id: UUID,
    request_id: UUID,
    update_data: UpdateSupplementaryRequestRequest,
    audit_context: dict[str, Any] | None = None,
) -> SupplementaryRequest:
    """Update a supplementary request with project validation."""
    supplementary_request = await get_supplementary_request_for_project(
        db=db, project_id=project_id, request_id=request_id
    )

    update_dict = update_data.model_dump(exclude_unset=True, exclude={"source_ref"})

    target_source_ref: SourceRef | None = None
    # Handle source_ref if it was explicitly set
    if "source_ref" in update_data.model_fields_set:
        _decompose_source_ref(update_dict, update_data.source_ref)
        target_source_ref = update_data.source_ref
        if target_source_ref and await _source_binding_exists(
            db=db,
            project_id=project_id,
            source_type=target_source_ref.type,
            source_item_id=target_source_ref.item_id,
            exclude_request_id=request_id,
        ):
            _raise_duplicate_source_binding_error(project_id, target_source_ref)

    for field, value in update_dict.items():
        setattr(supplementary_request, field, value)

    if audit_context is not None:
        await record_audit_entry(
            db,
            project_id=project_id,
            entity_type="supplementary_request",
            change_type=ChangeType.UPDATE,
            entity_id=cast(UUID, supplementary_request.id),
            **audit_context,
        )

    await _commit_with_duplicate_fallback(
        db=db,
        project_id=project_id,
        source_ref=target_source_ref,
        exclude_request_id=request_id,
    )

    await db.refresh(supplementary_request)

    logger.info(
        action=EventAction.CHANGE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Updated supplementary request {request_id} for project {project_id}",
    )

    return supplementary_request


async def delete_supplementary_request_for_project(
    db: AsyncSession,
    project_id: UUID,
    request_id: UUID,
    audit_context: dict[str, Any] | None = None,
) -> SupplementaryRequest:
    """Delete a supplementary request with project validation."""
    supplementary_request = await get_supplementary_request_for_project(
        db=db, project_id=project_id, request_id=request_id
    )

    await db.delete(supplementary_request)
    if audit_context is not None:
        await record_audit_entry(
            db,
            project_id=project_id,
            entity_type="supplementary_request",
            change_type=ChangeType.DELETE,
            entity_id=request_id,
            **audit_context,
        )
    await db.commit()

    logger.info(
        action=EventAction.DELETE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Deleted supplementary request {request_id} for project {project_id}",
    )

    return supplementary_request
