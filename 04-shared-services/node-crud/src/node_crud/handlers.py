from event_logging import EventLogger
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse

from node_crud.exceptions import (
    InvalidParentTypeError,
    InvalidPayloadError,
    NodeNotFoundError,
    ProjectVersionLockedError,
    UnknownNodeTypeError,
    VersionNotLatestError,
)

EXCEPTION_MAP = {
    NodeNotFoundError: (
        status.HTTP_404_NOT_FOUND,
        "Node not found",
    ),
    UnknownNodeTypeError: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Unknown node type",
    ),
    InvalidParentTypeError: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Invalid parent type",
    ),
    InvalidPayloadError: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Invalid payload",
    ),
    VersionNotLatestError: (
        status.HTTP_409_CONFLICT,
        "Project version is not latest",
    ),
    ProjectVersionLockedError: (
        status.HTTP_409_CONFLICT,
        "Project version is locked",
    ),
}


def register_node_crud_handlers(app: FastAPI, logger: EventLogger) -> None:
    """Register FastAPI handlers for every node-crud exception.

    Each handler logs via the supplied ``EventLogger`` and returns
    ``{"detail": <message>}`` with the mapped status code. ``NodeNotFoundError``
    logs as ``READ`` / ``RESOURCE_NOT_FOUND``; the validation-family exceptions
    log as ``VALIDATE`` / ``VALIDATION_FAILURE``. Both log at ``warn`` level.
    """
    for exc_class, (status_code, message) in EXCEPTION_MAP.items():
        app.add_exception_handler(
            exc_class, _make_handler(exc_class, status_code, message, logger)
        )


def _make_handler(
    exc_class: type[Exception],
    status_code: int,
    message: str,
    logger: EventLogger,
):
    is_not_found = exc_class is NodeNotFoundError
    action = EventAction.READ if is_not_found else EventAction.VALIDATE
    default_event = (
        LogEventDefault.RESOURCE_NOT_FOUND
        if is_not_found
        else LogEventDefault.VALIDATION_FAILURE
    )

    async def handler(request: Request, exc: Exception) -> JSONResponse:
        logger.warn(
            action=action,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.API,
            default_event=default_event,
            message=f"{exc_class.__name__} on {request.url.path}: {exc}",
        )
        return JSONResponse(
            status_code=status_code,
            content={"detail": str(exc).strip() or message},
        )

    return handler
