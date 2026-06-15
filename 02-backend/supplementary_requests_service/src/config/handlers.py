"""Exception handlers for the supplementary requests service."""

from collections.abc import Awaitable, Callable

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from starlette.responses import Response

from src.exceptions import (
    DuplicateSourceBindingError,
    FastAPIError,
    # Third-party exceptions
    ForeignKeyViolationError,
    InvalidSortParameterError,
    PostgresError,
    ProjectNotFoundError,
    RequestValidationError,
    SQLAlchemyError,
    # Custom domain exceptions
    SupplementaryRequestNotFoundError,
)
from src.utils.logger import logger


async def handle_exception(
    request: Request,
    exc: Exception,
    status_code: int,
    message: str,
    action: EventAction | None = None,
    category: EventCategory | None = None,
    default_event: LogEventDefault | None = None,
) -> Response:
    """Generic exception handler that logs the exception and returns a JSON response."""
    if action is None:
        action = EventAction.ACCESS
    if category is None:
        category = EventCategory.API
    if default_event is None:
        default_event = LogEventDefault.GENERAL

    logger.error(
        action=action,
        outcome=EventOutcome.FAILURE,
        category=category,
        default_event=default_event,
        message=f"{message} on {request.url.path}: {exc}",
        error_message=str(exc),
    )
    return JSONResponse(
        status_code=status_code,
        content={"detail": message},
    )


# Map exception classes to status codes, messages, and logging metadata
EXCEPTION_MAP = {
    # Domain exceptions
    SupplementaryRequestNotFoundError: (
        status.HTTP_404_NOT_FOUND,
        "Supplementary request not found",
        EventAction.READ,
        EventCategory.API,
        LogEventDefault.RESOURCE_NOT_FOUND,
    ),
    ProjectNotFoundError: (
        status.HTTP_404_NOT_FOUND,
        "Project not found",
        EventAction.READ,
        EventCategory.API,
        LogEventDefault.RESOURCE_NOT_FOUND,
    ),
    DuplicateSourceBindingError: (
        status.HTTP_409_CONFLICT,
        "Duplicate source binding",
        EventAction.WRITE,
        EventCategory.DATABASE,
        LogEventDefault.DB_ERROR,
    ),
    InvalidSortParameterError: (
        status.HTTP_400_BAD_REQUEST,
        "Invalid sort parameter",
        EventAction.VALIDATE,
        EventCategory.API,
        LogEventDefault.VALIDATION_FAILURE,
    ),
    # Postgres
    ForeignKeyViolationError: (
        status.HTTP_400_BAD_REQUEST,
        "Foreign Key Violation Error",
        EventAction.WRITE,
        EventCategory.DATABASE,
        LogEventDefault.DB_ERROR,
    ),
    PostgresError: (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal DB Error",
        EventAction.ACCESS,
        EventCategory.DATABASE,
        LogEventDefault.DB_ERROR,
    ),
    # SQLAlchemy
    SQLAlchemyError: (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal Database Error",
        EventAction.ACCESS,
        EventCategory.DATABASE,
        LogEventDefault.DB_ERROR,
    ),
    # FastAPI
    FastAPIError: (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal FastAPI Error",
        EventAction.ACCESS,
        EventCategory.API,
        LogEventDefault.GENERAL,
    ),
    RequestValidationError: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Invalid request payload",
        EventAction.VALIDATE,
        EventCategory.API,
        LogEventDefault.VALIDATION_FAILURE,
    ),
    # Python generic
    FileNotFoundError: (
        status.HTTP_404_NOT_FOUND,
        "File Not Found Error",
        EventAction.READ,
        EventCategory.FILE,
        LogEventDefault.RESOURCE_NOT_FOUND,
    ),
    Exception: (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal Server Error",
        EventAction.ACCESS,
        EventCategory.API,
        LogEventDefault.GENERAL,
    ),
}


def make_handler(
    status_code: int,
    message: str | None,
    action: EventAction,
    category: EventCategory,
    default_event: LogEventDefault,
) -> Callable[[Request, Exception], Awaitable[Response]]:
    """Factory function that creates an async exception handler for FastAPI."""

    async def handler(request: Request, exc: Exception) -> Response:
        return await handle_exception(
            request=request,
            exc=exc,
            status_code=status_code,
            message=message or str(exc),
            action=action,
            category=category,
            default_event=default_event,
        )

    return handler


def register_exception_handlers(app: FastAPI) -> None:
    """Registers all application-wide exception handlers defined in EXCEPTION_MAP."""
    for exc_class, (
        status_code,
        message,
        action,
        category,
        default_event,
    ) in EXCEPTION_MAP.items():
        app.add_exception_handler(
            exc_class,
            make_handler(status_code, message, action, category, default_event),
        )
