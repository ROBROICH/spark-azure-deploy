from event_logging.enums import (  # type: ignore[import-not-found]
    EventAction,
    EventCategory,
    EventOutcome,
)
from fastapi import FastAPI, Request, status
from fastapi.responses import JSONResponse
from node_crud import register_node_crud_handlers
from temporalio.client import WorkflowFailureError

from src.exceptions import (
    DeadlineNotFoundError,
    DuplicateProjectError,
    DuplicateProjectTypeError,
    FastAPIError,
    ForeignKeyViolationError,
    InvalidStatusError,
    InvalidStatusTransitionError,
    InvalidTopicForProjectTypeError,
    PostgresError,
    ProcessStepNotFoundError,
    ProjectNotFoundError,
    ProjectTypeNotFoundError,
    RequestValidationError,
    SQLAlchemyError,
    TopicAlreadyAssignedError,
    TopicAlreadyExistsError,
    TopicNotAssignedError,
    TopicNotFoundError,
)
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
        exc_info=True,
    )
    return JSONResponse(
        status_code=status_code,
        content={"detail": str(exc).strip() or message},
    )


# Map exception classes to status codes and optional custom messages
EXCEPTION_MAP = {
    # Domain exceptions (from src.exceptions)
    DeadlineNotFoundError: (
        status.HTTP_404_NOT_FOUND,
        "Deadline not found",
    ),
    TopicNotFoundError: (
        status.HTTP_404_NOT_FOUND,
        "Topic not found",
    ),
    TopicAlreadyExistsError: (
        status.HTTP_409_CONFLICT,
        "Topic already exists",
    ),
    TopicAlreadyAssignedError: (
        status.HTTP_409_CONFLICT,
        "Topic already exists for the project",
    ),
    InvalidTopicForProjectTypeError: (
        status.HTTP_400_BAD_REQUEST,
        "Invalid topic for project type",
    ),
    TopicNotAssignedError: (
        status.HTTP_400_BAD_REQUEST,
        "Topic not assigned to the project",
    ),
    ProjectNotFoundError: (
        status.HTTP_404_NOT_FOUND,
        "Project not found",
    ),
    ProjectTypeNotFoundError: (
        status.HTTP_404_NOT_FOUND,
        "ProjectType not found",
    ),
    ProcessStepNotFoundError: (
        status.HTTP_404_NOT_FOUND,
        "ProcessStep not found",
    ),
    DuplicateProjectTypeError: (
        status.HTTP_409_CONFLICT,
        "ProjectType with this name already exists",
    ),
    DuplicateProjectError: (
        status.HTTP_409_CONFLICT,
        "Project with same internal project number already exists",
    ),
    InvalidStatusError: (
        status.HTTP_400_BAD_REQUEST,
        "Invalid project status",
    ),
    InvalidStatusTransitionError: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Invalid status transition",
    ),
    # Postgres
    ForeignKeyViolationError: (
        status.HTTP_400_BAD_REQUEST,
        "Foreign Key Violation Error",
    ),
    PostgresError: (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal DB Error",
    ),
    # SQLAlchemy
    SQLAlchemyError: (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal Database Error",
    ),
    # FastAPI
    FastAPIError: (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal FastAPI Error",
    ),
    RequestValidationError: (
        status.HTTP_422_UNPROCESSABLE_CONTENT,
        "Invalid request payload",
    ),
    # Python generic
    FileNotFoundError: (
        status.HTTP_404_NOT_FOUND,
        "File Not Found Error",
    ),
    Exception: (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Internal Server Error",
    ),
    # Temporal
    WorkflowFailureError: (
        status.HTTP_500_INTERNAL_SERVER_ERROR,
        "Workflow execution failed",
    ),
}


def make_handler(status_code: int, message: str | None):
    """
    Factory function that creates an async exception handler for FastAPI.

    Args:
        status_code (int): The HTTP status code to return in the response.
        message (str | None): Optional custom error message to include in the
            response. If None, the exception's string representation is used.

    Returns:
        Callable[[Request, Exception], Awaitable[JSONResponse]]:
            An async handler function that can be registered with FastAPI via
            `app.add_exception_handler`.
    """

    async def handler(request: Request, exc: Exception):
        return await handle_exception(
            request=request,
            exc=exc,
            status_code=status_code,
            message=message,
        )

    return handler


def register_exception_handlers(app: FastAPI):
    """
    Registers all application-wide exception handlers defined in `EXCEPTION_MAP`.

    Each exception type is mapped to a corresponding HTTP status code and an
    optional custom error message. When an exception occurs, the generated handler
    will log the exception and return a structured JSON response.

    Args:
        app (FastAPI): The FastAPI application instance where handlers should be
            registered.

    Example:
        >>> app = FastAPI()
        >>> register_exception_handlers(app)
    """
    register_node_crud_handlers(app, logger)
    for exc_class, (status_code, message) in EXCEPTION_MAP.items():
        app.add_exception_handler(exc_class, make_handler(status_code, message))
