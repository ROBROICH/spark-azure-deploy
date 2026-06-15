import traceback
from collections.abc import Callable, Coroutine
from typing import Any

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
)
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from node_crud import register_node_crud_handlers
from sqlalchemy.exc import IntegrityError

from src.exceptions.exceptions import NotFoundError
from src.utils.logger import logger


async def handle_exception(
    request: Request,
    exc: Exception,
    status_code: int,
    message: str,
) -> JSONResponse:
    """Log the exception and return a structured JSON response."""
    logger.error(
        action=EventAction.NOTIFY,
        outcome=EventOutcome.FAILURE,
        category=EventCategory.API,
        message=f"Unhandled Exception: {exc}",
        error_message=traceback.format_exc(),
    )
    return JSONResponse(
        status_code=status_code,
        content={"detail": str(exc).strip() or message},
    )


EXCEPTION_MAP = {
    NotFoundError: (status.HTTP_404_NOT_FOUND, "Resource not found"),
    IntegrityError: (
        status.HTTP_409_CONFLICT,
        "Resource conflict during database operation",
    ),
    ValueError: (status.HTTP_422_UNPROCESSABLE_CONTENT, "Validation error"),
    Exception: (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal server error",
    ),
}


def make_handler(status_code: int, message: str) -> Callable[[Request, Exception], Coroutine[Any, Any, JSONResponse]]:
    async def handler(request: Request, exc: Exception) -> JSONResponse:
        return await handle_exception(request, exc, status_code, message)

    return handler


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers so routes can stay lean."""
    register_node_crud_handlers(app, logger)
    for exc_class, (status_code, message) in EXCEPTION_MAP.items():
        app.add_exception_handler(exc_class, make_handler(status_code, message))
