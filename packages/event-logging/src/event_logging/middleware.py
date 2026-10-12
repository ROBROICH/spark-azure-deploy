import re
import time
from collections.abc import Callable, Mapping
from typing import Any, ClassVar
from urllib.parse import urlsplit
from uuid import uuid4

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.routing import Match
from starlette.types import ASGIApp

from event_logging.context import project_id_var, trace_id_var
from event_logging.db_logging import describe_database_error
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
    ServiceComponent,
)
from event_logging.event_logger import EventLogger

TRACEPARENT_PARTS = 4
TRACEPARENT_VERSION_LENGTH = 2
TRACE_ID_LENGTH = 32
PARENT_ID_LENGTH = 16
TRACE_FLAGS_LENGTH = 2
HTTP_CLIENT_ERROR_MIN_STATUS = 400
TRACEPARENT_HEX_PATTERN = re.compile(r"[0-9A-Fa-f]+")
SAFE_DATABASE_FAILURE_MESSAGE = "Database operation failed"

METHOD_ACTION_MAP: dict[str, EventAction] = {
    "GET": EventAction.READ,
    "POST": EventAction.WRITE,
    "PUT": EventAction.CHANGE,
    "DELETE": EventAction.DELETE,
    "PATCH": EventAction.CHANGE,
    "OPTIONS": EventAction.ACCESS,
    "HEAD": EventAction.ACCESS,
}


def event_action_for_method(method: str) -> EventAction:
    """Map an HTTP method to the incumbent event action vocabulary."""
    return METHOD_ACTION_MAP.get(method.upper(), EventAction.ACCESS)


def event_outcome_for_status(status_code: int) -> EventOutcome:
    """Classify HTTP status codes using the incumbent 400 failure boundary."""
    return EventOutcome.FAILURE if status_code >= HTTP_CLIENT_ERROR_MIN_STATUS else EventOutcome.SUCCESS


def extract_trace_id(traceparent: str | None) -> str | None:
    """Return a valid W3C trace ID while preserving accepted hexadecimal casing."""
    if not traceparent:
        return None
    parts = traceparent.split("-")
    if len(parts) != TRACEPARENT_PARTS:
        return None
    version, trace_id, parent_id, trace_flags = parts
    if (
        len(version) != TRACEPARENT_VERSION_LENGTH
        or version.lower() == "ff"
        or len(trace_id) != TRACE_ID_LENGTH
        or trace_id == "0" * TRACE_ID_LENGTH
        or len(parent_id) != PARENT_ID_LENGTH
        or parent_id == "0" * PARENT_ID_LENGTH
        or len(trace_flags) != TRACE_FLAGS_LENGTH
    ):
        return None
    if any(
        TRACEPARENT_HEX_PATTERN.fullmatch(part) is None
        for part in (version, trace_id, parent_id, trace_flags)
    ):
        return None
    try:
        int(version, 16)
        int(trace_id, 16)
        int(parent_id, 16)
        int(trace_flags, 16)
    except ValueError:
        return None
    return trace_id


def _project_id_from_mapping(mapping: Mapping[str, Any] | None) -> str | None:
    if mapping is None:
        return None
    for key in ("project_id", "projectId"):
        value = mapping.get(key)
        if value is not None:
            return str(value)
    return None


def resolve_project_id(*sources: Mapping[str, Any] | None) -> str | None:
    """Resolve project identity from path, then query mappings; request bodies are never read."""
    for source in sources:
        project_id = _project_id_from_mapping(source)
        if project_id is not None:
            return project_id
    return None


def request_path(url: str) -> str:
    """Return only the URL path; credentials and query parameters are not observable."""
    return urlsplit(url).path or "/"


def request_message(method: str, status_code: int | None, path: str) -> str:
    status = "" if status_code is None else str(status_code)
    return f"{method.upper()} {status}: {path} executed."


def safe_request_error_message(error: BaseException) -> str:
    """Return a durable-event message that never carries rendered bind values or driver DETAIL text."""
    try:
        original = getattr(error, "orig", None)
        if isinstance(original, BaseException):
            return describe_database_error(original)
        message = str(error)
        if "\nparams:" in message or "\n[parameters:" in message:
            return describe_database_error(error)
        return message
    except Exception:
        return SAFE_DATABASE_FAILURE_MESSAGE


class EventLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware for event ECS logging of HTTP requests.

    Logs request/response details including duration, status,
    and network details in ECS-compatible JSON format.
    """

    METHOD_ACTION_MAP: ClassVar[dict[str, EventAction]] = METHOD_ACTION_MAP

    def __init__(
        self,
        app: ASGIApp,
        service_name: str,
        service_component: str | ServiceComponent | None = None,
        skip_paths: list[str] | None = None,
        logger: EventLogger | None = None,
        trace_id_factory: Callable[[], str] | None = None,
        clock_ns: Callable[[], int] | None = None,
    ):
        super().__init__(app)

        if isinstance(service_component, str):
            service_component = ServiceComponent(service_component)

        self.logger = logger or EventLogger(service_name=service_name, service_component=service_component)
        self.skip_paths = skip_paths or ["/healthz", "/metrics"]
        self.trace_id_factory = trace_id_factory or (lambda: str(uuid4()))
        self.clock_ns = clock_ns or time.perf_counter_ns

    def _resolve_path_params(self, request: Request) -> dict[str, str]:
        """Resolve path params by matching the request against the app's routes."""
        for route in request.app.routes:
            match, scope = route.matches(request.scope)
            if match == Match.FULL:
                return scope.get("path_params", {})
        return {}

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        if any(request.url.path.startswith(path) for path in self.skip_paths):
            return await call_next(request)

        project_id = resolve_project_id(self._resolve_path_params(request), request.query_params)
        project_id_token = project_id_var.set(project_id)

        trace_id = extract_trace_id(request.headers.get("traceparent")) or self.trace_id_factory()
        trace_id_token = trace_id_var.set(trace_id)

        start_time_ns = self.clock_ns()
        outcome = EventOutcome.SUCCESS
        error_message = None
        response = None

        try:
            response = await call_next(request)
            outcome = event_outcome_for_status(response.status_code)
        except Exception as e:
            outcome = EventOutcome.FAILURE
            error_message = safe_request_error_message(e)
            raise
        finally:
            duration_ns = max(0, self.clock_ns() - start_time_ns)

            action = event_action_for_method(request.method)

            source_ip = request.client.host if request.client else None
            destination_ip = None
            if request.scope.get("server"):
                destination_ip = request.scope["server"][0]

            try:
                self.logger.info(
                    action=action,
                    outcome=outcome,
                    category=EventCategory.API,
                    default_event=LogEventDefault.API_REQUEST,
                    message=request_message(request.method, response.status_code if response else None, request.url.path),
                    event_duration=duration_ns,
                    event_code=response.status_code if response else None,
                    url_path=request.url.path,
                    http_request_method=request.method,
                    source_ip=source_ip,
                    destination_ip=destination_ip,
                    error_message=error_message,
                    project_id=project_id,
                    trace_id=trace_id,
                )
            finally:
                trace_id_var.reset(trace_id_token)
                project_id_var.reset(project_id_token)

        return response
