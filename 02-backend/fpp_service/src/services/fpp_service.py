"""Main business logic for FPP service."""

from typing import Any, TypedDict
from uuid import UUID

from event_logging.enums import EventAction, EventCategory, EventOutcome, LogEventDefault
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from src.config.settings import settings
from src.exceptions.exceptions import NotFoundError, OperationFailedError
from src.models.db_models import FPPFile, FPPRequest, FPPRequestStatus
from src.models.schemas.fpp_schemas import (
    FPPFileResponse,
    FPPProjectRequest,
    FPPProjectResponse,
    FPPRequestDetail,
)
from src.services.agent_orchestration_client import AgentOrchestrationClient
from src.services.project_logic_client import ProjectLogicClient
from src.services.xml_parser import parse_fpp_xml
from src.utils.logger import logger


class ExtractedFPPData(TypedDict):
    """Type definition for extracted FPP XML data."""

    xml_data: dict[str, Any]


async def _check_existing_request(
    request_id: UUID,
    internal_project_id: str,
    db: AsyncSession,
) -> FPPRequest | None:
    """
    Check if request already exists and determine if processing should continue.

    Idempotency rules:
    - COMPLETED: Return existing (no retry needed)
    - PROCESSING/RECEIVED: Return existing (prevent duplicate processing)

    Args:
        request_id: FPP request ID
        internal_project_id: Internal project identifier (Aktenzeichen)
        db: Database session

    Returns:
        FPPRequest if exists and should not be retried, None otherwise
    """
    existing = await db.scalar(
        select(FPPRequest).where(
            or_(
                FPPRequest.request_id == request_id,
                FPPRequest.internal_project_id == internal_project_id,
            )
        )
    )

    if not existing:
        return None

    if existing.status == FPPRequestStatus.RECEIVED.value:
        logger.info(
            action=EventAction.READ,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_READ,
            message=f"Request {request_id} already received, returning existing",
        )
        return existing

    logger.info(
        action=EventAction.READ,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_READ,
        message=f"Request {request_id} is {existing.status}, returning existing",
    )
    return existing


def _extract_and_parse_request_data(request: FPPProjectRequest) -> ExtractedFPPData:
    """
    Extract and parse all data from FPP request and XML.

    Args:
        request: FPP project creation request

    Returns:
        ExtractedFPPData with parsed XML data (all fields already extracted)

    Raises:
        OperationFailedError: If XML parsing fails
    """
    try:
        xml_data = parse_fpp_xml(request.xml)
    except ValueError as e:
        logger.error(
            action=EventAction.VALIDATE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.FILE,
            default_event=LogEventDefault.VALIDATION_FAILURE,
            message=f"Failed to parse XML for request {request.request_id}: {e}",
        )
        raise OperationFailedError(f"Invalid XML data: {e}") from e

    return {"xml_data": xml_data}


async def _persist_fpp_request_and_files(
    request: FPPProjectRequest,
    db: AsyncSession,
) -> FPPRequest:
    """
    Store FPP request and associated files in database.

    Args:
        request: FPP project creation request
        db: Database session

    Returns:
        Created FPPRequest instance

    Raises:
        OperationFailedError: If database operation fails
    """

    fpp_request = FPPRequest(
        request_id=request.request_id,
        internal_project_id=request.internal_project_id,
        name=request.name,
        xml=request.xml,
        status=FPPRequestStatus.RECEIVED.value,
    )

    try:
        db.add(fpp_request)
        await db.flush()

        # Store file URLs
        for file_input in request.files:
            fpp_file = FPPFile(
                request_id=request.request_id,
                file_type=file_input.file_type.value,
                file_url=file_input.file_url,
                file_name=file_input.file_name,
            )
            db.add(fpp_file)

        await db.commit()
        await db.refresh(fpp_request)

        logger.info(
            action=EventAction.WRITE,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_WRITE,
            message=f"Stored FPP request {request.request_id}",
        )

        return fpp_request

    except Exception as e:
        await db.rollback()
        logger.error(
            action=EventAction.WRITE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_WRITE,
            message=f"Failed to store FPP request: {e}",
        )
        raise OperationFailedError(f"Failed to store request: {e}") from e


async def update_request_status(
    fpp_request: FPPRequest,
    status: FPPRequestStatus,
    db: AsyncSession,
    project_id: UUID | None = None,
) -> None:
    """
    Update FPP request status atomically.

    Args:
        fpp_request: FPP request to update
        status: New status
        db: Database session
        project_id: Optional project ID (for IMPORTED status)
    """
    fpp_request.status = status.value

    if project_id:
        fpp_request.project_id = project_id

    await db.commit()
    await db.refresh(fpp_request)

    logger.info(
        action=EventAction.WRITE,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.DATABASE,
        default_event=LogEventDefault.DB_WRITE,
        message=f"Updated request {fpp_request.request_id} to status {status.value}",
    )


async def create_project_from_fpp(
    request: FPPProjectRequest,
    db: AsyncSession,
) -> FPPProjectResponse:
    """
    Create a project from FPP platform request

    This orchestrates the project creation workflow:
    1. Check for existing request
    2. Persist request and files
    3. Extract XML metadata
    4. Call project_logic_service to create project
    5. Update request with project_id and status

    Args:
        request: FPP project creation request
        db: Database session

    Returns:
        FPP project response with status and project ID

    Raises:
        OperationFailedError: If project creation fails
    """
    # Check if request already exists
    existing = await _check_existing_request(request.request_id, request.internal_project_id, db)
    if existing:
        return FPPProjectResponse.model_validate(existing)

    # Persist request and files
    fpp_request = await _persist_fpp_request_and_files(request, db)

    # Parse XML only for fields not available in request object
    extracted_data = _extract_and_parse_request_data(request)
    xml_data = extracted_data["xml_data"]

    # Update status to IMPORTING
    await update_request_status(fpp_request, FPPRequestStatus.IMPORTING, db)

    # Create project via project_logic_service
    try:
        project_logic_client = ProjectLogicClient()

        # Handle state field - take first state if multiple exist
        state = None
        if xml_data.get("state"):
            state_str = xml_data["state"]
            # If comma-separated, take first state
            if "," in state_str:
                state = state_str.split(",")[0].strip()
            else:
                state = state_str

        # Use request object fields when available, fall back to XML only when necessary
        project_response = await project_logic_client.create_project(
            name=request.name,  # From request object (not XML)
            internal_project_number=request.internal_project_id,  # From request object (not XML)
            created_by_id=UUID(settings.SYSTEM_USER_ID),
            entry_date=xml_data["entry_date"],  # From XML (required, not in request)
            project_type_id=settings.project_type_uuid,
            state=state,  # From XML (optional, not in request)
            company=xml_data.get("company"),  # From XML (optional, not in request)
            street=xml_data.get("street"),  # From XML (optional, not in request)
            house_number=xml_data.get("house_number"),  # From XML (optional, not in request)
            plz=xml_data.get("plz"),  # From XML (optional, not in request)
            location=xml_data.get("location"),  # From XML (optional, not in request)
            country=xml_data.get("country"),  # From XML (optional, not in request)
            email=xml_data.get("email"),  # From XML (optional, not in request)
            phone=xml_data.get("phone"),  # From XML (optional, not in request)
            fax=xml_data.get("fax"),  # From XML (optional, not in request)
        )

        # Extract project ID from response
        project_id = UUID(project_response["id"])

        # Update request with project_id and IMPORTED status
        await update_request_status(
            fpp_request,
            FPPRequestStatus.IMPORTED,
            db,
            project_id=project_id,
        )

        logger.info(
            action=EventAction.WRITE,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_WRITE,
            message=f"Successfully created project {project_id} for FPP request {request.request_id}",
        )

        # Trigger download workflows for PLANUNTERLAGEN files
        await db.refresh(fpp_request, ["files"])
        for file in fpp_request.files:
            if file.file_type == "PLANUNTERLAGEN":
                try:
                    await AgentOrchestrationClient.start_fpp_download_workflow(
                        project_id=project_id,
                        file_id=file.id,
                        file_url=file.file_url,
                        file_name=file.file_name or "planunterlagen.zip",
                        file_type=file.file_type,
                    )
                    logger.info(
                        action=EventAction.NOTIFY,
                        outcome=EventOutcome.SUCCESS,
                        category=EventCategory.API,
                        default_event=LogEventDefault.GENERAL,
                        message=f"Started download workflow for file {file.id}",
                    )
                except Exception as workflow_error:
                    # Log but don't fail the entire request if workflow start fails
                    logger.error(
                        action=EventAction.NOTIFY,
                        outcome=EventOutcome.FAILURE,
                        category=EventCategory.API,
                        default_event=LogEventDefault.GENERAL,
                        message=f"Failed to start download workflow for file {file.id}: {workflow_error}",
                    )

    except Exception as e:
        # Update status to FAILED
        await update_request_status(
            fpp_request,
            FPPRequestStatus.FAILED,
            db,
        )

        error_msg = "Failed to create project"
        logger.error(
            action=EventAction.WRITE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_WRITE,
            message=f"Failed to create project for FPP request {request.request_id}: {e}",
            exc_info=True,
        )

        raise OperationFailedError(error_msg) from e

    return FPPProjectResponse.model_validate(fpp_request)


async def get_request(request_id: UUID, db: AsyncSession) -> FPPRequestDetail:
    """
    Get FPP request details by ID.

    Args:
        request_id: Request ID
        db: Database session

    Returns:
        Detailed request information

    Raises:
        NotFoundError: If request not found
    """
    result = await db.execute(
        select(FPPRequest).where(FPPRequest.request_id == request_id).options(selectinload(FPPRequest.files))
    )
    fpp_request = result.scalar_one_or_none()

    if not fpp_request:
        raise NotFoundError(f"Request {request_id} not found")

    # Parse XML to get additional fields
    xml_data = parse_fpp_xml(fpp_request.xml)

    # Combine DB data with parsed XML data
    return FPPRequestDetail(
        request_id=fpp_request.request_id,
        internal_project_id=fpp_request.internal_project_id,
        name=fpp_request.name,
        entry_date=xml_data["entry_date"],
        xml=fpp_request.xml,
        state=xml_data.get("state"),
        company=xml_data.get("company"),
        address_combined=xml_data.get("address_combined"),
        street=xml_data.get("street"),
        house_number=xml_data.get("house_number"),
        plz=xml_data.get("plz"),
        location=xml_data.get("location"),
        country=xml_data.get("country"),
        email=xml_data.get("email"),
        phone=xml_data.get("phone"),
        fax=xml_data.get("fax"),
        project_id=fpp_request.project_id,
        status=FPPRequestStatus(fpp_request.status),
        files=[FPPFileResponse.model_validate(f) for f in fpp_request.files],
        created_at=fpp_request.created_at,
        updated_at=fpp_request.updated_at,
    )


async def get_request_files(request_id: UUID, db: AsyncSession) -> list[FPPFile]:
    """
    Get file URLs for a request.

    Args:
        request_id: Request ID
        db: Database session

    Returns:
        List of file records

    Raises:
        NotFoundError: If request not found
    """
    result = await db.execute(select(FPPFile).where(FPPFile.request_id == request_id))
    files = result.scalars().all()

    if not files:
        # Check if request exists
        request_exists = await db.scalar(select(FPPRequest).where(FPPRequest.request_id == request_id))
        if not request_exists:
            raise NotFoundError(f"Request {request_id} not found")

    return list(files)


async def confirm_file_download(
    file_id: UUID,
    dms_file_id: UUID,
    db: AsyncSession,
) -> None:
    """
    Confirm that a file has been downloaded and uploaded to DMS.

    Args:
        file_id: FPP file ID
        dms_file_id: DMS file ID where the file was uploaded
        db: Database session

    Raises:
        NotFoundError: If file not found
        OperationFailedError: If update fails
    """
    result = await db.execute(select(FPPFile).where(FPPFile.id == file_id))
    fpp_file = result.scalar_one_or_none()

    if not fpp_file:
        raise NotFoundError(f"File {file_id} not found")

    try:
        fpp_file.downloaded = True
        fpp_file.dms_file_id = dms_file_id
        await db.commit()
        await db.refresh(fpp_file)

        logger.info(
            action=EventAction.WRITE,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_WRITE,
            message=f"Confirmed download for file {file_id}, DMS file ID: {dms_file_id}",
        )

    except Exception as e:
        await db.rollback()
        logger.error(
            action=EventAction.WRITE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_WRITE,
            message=f"Failed to confirm file download: {e}",
        )
        raise OperationFailedError(f"Failed to confirm file download: {e}") from e
