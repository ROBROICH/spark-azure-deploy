"""Exception handlers for the identity management service."""

from collections.abc import Awaitable, Callable

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from src.utils.logger import logger


async def _handle_exception(
    request: Request,
    exc: Exception,
    status_code: int,
    message: str,
    action: EventAction = EventAction.ACCESS,
    category: EventCategory = EventCategory.API,
    default_event: LogEventDefault = LogEventDefault.GENERAL,
) -> JSONResponse:
    """Log the exception and return a JSON error response."""
    logger.error(
        action=action,
        outcome=EventOutcome.FAILURE,
        category=category,
        default_event=default_event,
        message=f"{message} on {request.url.path}: {exc}",
        error_message=str(exc),
    )
    return JSONResponse(status_code=status_code, content={"detail": message})


EXCEPTION_MAP: dict[
    type[Exception],
    tuple[int, str, EventAction, EventCategory, LogEventDefault],
] = {
    RequestValidationError: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Invalid request payload",
        EventAction.VALIDATE,
        EventCategory.API,
        LogEventDefault.VALIDATION_FAILURE,
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
    message: str,
    action: EventAction,
    category: EventCategory,
    default_event: LogEventDefault,
) -> Callable[[Request, Exception], Awaitable[JSONResponse]]:
    """Factory that creates an async exception handler for FastAPI."""

    async def handler(request: Request, exc: Exception) -> JSONResponse:
        return await _handle_exception(
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
    """Register all application-wide exception handlers.

    StarletteHTTPException is registered first so it is always resolved before
    the generic Exception catch-all, regardless of Starlette's lookup order.
    """

    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})

    app.add_exception_handler(StarletteHTTPException, http_exception_handler)  # pyrefly: ignore[bad-argument-type]

    for exc_class, (status_code, message, action, category, default_event) in EXCEPTION_MAP.items():
        app.add_exception_handler(
            exc_class,
            make_handler(status_code, message, action, category, default_event),
        )
