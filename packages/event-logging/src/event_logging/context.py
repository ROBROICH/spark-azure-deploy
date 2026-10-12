from collections.abc import Iterator
from contextlib import contextmanager
from contextvars import ContextVar

project_id_var: ContextVar[str | None] = ContextVar("project_id", default=None)
trace_id_var: ContextVar[str | None] = ContextVar("trace_id", default=None)


@contextmanager
def request_context(*, project_id: str | None, trace_id: str | None) -> Iterator[None]:
    """Establish isolated request context and restore the caller's context afterwards."""
    project_id_token = project_id_var.set(project_id)
    trace_id_token = trace_id_var.set(trace_id)
    try:
        yield
    finally:
        trace_id_var.reset(trace_id_token)
        project_id_var.reset(project_id_token)
