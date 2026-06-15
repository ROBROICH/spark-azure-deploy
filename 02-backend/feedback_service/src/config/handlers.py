"""Exception handlers for the feedback service."""

import traceback
from collections.abc import Callable, Coroutine
from typing import Any

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from node_crud.exceptions import NodeNotFoundError
from node_crud.handlers import EXCEPTION_MAP as NODE_CRUD_EXCEPTION_MAP
from sqlalchemy.exc import IntegrityError

from src.utils.logger import logger


async def handle_exception(
    request: Request,
    exc: Exception,
    status_code: int,
    message: str,
    action: EventAction = EventAction.ACCESS,
    category: EventCategory = EventCategory.API,
    default_event: LogEventDefault = LogEventDefault.GENERAL,
    error_message: str | None = None,
) -> JSONResponse:
    """Generic exception handler that logs the exception and returns a JSON response."""
    logger.error(
        action=action,
        outcome=EventOutcome.FAILURE,
        category=category,
        default_event=default_event,
        message=f"{message} on {request.url.path}: {exc}",
        error_message=error_message if error_message is not None else str(exc),
    )
    return JSONResponse(status_code=status_code, content={"detail": str(exc).strip() or message})


def _node_crud_exception_tuple(
    exc_class: type[Exception], status_code: int, message: str
) -> tuple[int, str, EventAction, EventCategory, LogEventDefault]:
    """Attach service logging metadata to node-crud exceptions."""
    if exc_class is NodeNotFoundError:
        return (
            status_code,
            message,
            EventAction.READ,
            EventCategory.API,
            LogEventDefault.RESOURCE_NOT_FOUND,
        )

    return (
        status_code,
        message,
        EventAction.VALIDATE,
        EventCategory.API,
        LogEventDefault.VALIDATION_FAILURE,
    )


EXCEPTION_MAP = {
    **{
        exc_class: _node_crud_exception_tuple(exc_class, status_code, message)
        for exc_class, (status_code, message) in NODE_CRUD_EXCEPTION_MAP.items()
    },
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
}


def make_handler(
    status_code: int,
    message: str,
    action: EventAction,
    category: EventCategory,
    default_event: LogEventDefault,
) -> Callable[[Request, Exception], Coroutine[Any, Any, JSONResponse]]:
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
    """Register application-wide exception handlers from EXCEPTION_MAP.

    Registers a separate handler for ``Exception`` with traceback in logs.
    """
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
