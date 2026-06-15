"""Exception handlers for the objections management service."""

import traceback
from collections.abc import Awaitable, Callable

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from node_crud import register_node_crud_handlers
from sqlalchemy.exc import IntegrityError

from src.exceptions.exceptions import ExternalServiceError
from src.utils.logger import logger


async def handle_exception(
    request: Request,
    exc: Exception,
    status_code: int,
    message: str,
    action: EventAction | None = None,
    category: EventCategory | None = None,
    default_event: LogEventDefault | None = None,
    error_message: str | None = None,
) -> JSONResponse:
    """Log the exception and return a structured JSON response."""
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
        error_message=error_message if error_message is not None else str(exc),
    )
    return JSONResponse(status_code=status_code, content={"detail": str(exc).strip() or message})


EXCEPTION_MAP = {
    IntegrityError: (
        status.HTTP_409_CONFLICT,
        "Resource conflict during database operation",
        EventAction.WRITE,
        EventCategory.DATABASE,
        LogEventDefault.DB_ERROR,
    ),
    ValueError: (
        status.HTTP_400_BAD_REQUEST,
        "Invalid request",
        EventAction.VALIDATE,
        EventCategory.API,
        LogEventDefault.VALIDATION_FAILURE,
    ),
    ExternalServiceError: (
        status.HTTP_502_BAD_GATEWAY,
        "External service request failed",
        EventAction.ACCESS,
        EventCategory.API,
        LogEventDefault.EXTERNAL_SERVICE_INTERACTION,
    ),
}


def make_handler(
    status_code: int,
    message: str,
    action: EventAction,
    category: EventCategory,
    default_event: LogEventDefault,
) -> Callable[[Request, Exception], Awaitable[JSONResponse]]:
    """Create an async exception handler for FastAPI."""

    async def handler(request: Request, exc: Exception) -> JSONResponse:
        return await handle_exception(
            request=request,
            exc=exc,
            status_code=status_code,
            message=message,
            action=action,
            category=category,
            default_event=default_event,
        )

    return handler


def register_exception_handlers(app: FastAPI) -> None:
    """Register application-wide exception handlers."""
    register_node_crud_handlers(app, logger)

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

    async def handle_generic_exception(request: Request, exc: Exception) -> JSONResponse:
        return await handle_exception(
            request=request,
            exc=exc,
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            message="Internal server error",
            action=EventAction.ACCESS,
            category=EventCategory.API,
            default_event=LogEventDefault.GENERAL,
            error_message=traceback.format_exc(),
        )

    app.add_exception_handler(Exception, handle_generic_exception)
