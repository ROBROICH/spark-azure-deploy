"""Global exception handlers for the application.

The protocol service is a read-only aggregator — it does not raise domain-specific
errors. FastAPI handles request validation (422) on its own. Only the catch-all
remains, primarily to route unhandled exceptions through structured logging.
"""

import logging

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from src.utils.logger import logger

_stderr_logger = logging.getLogger(__name__)


def register_exception_handlers(app: FastAPI) -> None:
    """Register global exception handlers."""

    @app.exception_handler(Exception)
    async def handle_generic_exception(request: Request, exc: Exception) -> JSONResponse:
        # Full traceback goes to stderr only; the structured event_logging
        # field carries just the exception type to avoid leaking internal
        # source paths into downstream log dashboards.
        _stderr_logger.exception("Unhandled exception on %s", request.url.path)
        logger.error(
            action=EventAction.ACCESS,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=LogEventDefault.GENERAL,
            message=f"Unhandled exception on {request.url.path}",
            error_message=type(exc).__name__,
        )
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": "Internal server error"},
        )
