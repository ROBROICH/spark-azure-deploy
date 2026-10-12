from time import perf_counter_ns
from typing import Any

from event_logging.enums import (
    DatabaseOperation,
    EventAction,
    EventCategory,
    EventOutcome,
    EventType,
    LogEventDefault,
)
from event_logging.event_logger import EventLogger

_STATEMENT_KINDS: dict[str, tuple[DatabaseOperation | None, EventAction, EventType]] = {
    "INSERT": (DatabaseOperation.INSERT, EventAction.WRITE, EventType.CHANGE),
    "UPDATE": (DatabaseOperation.UPDATE, EventAction.CHANGE, EventType.CHANGE),
    "DELETE": (DatabaseOperation.DELETE, EventAction.DELETE, EventType.CHANGE),
    "CREATE": (DatabaseOperation.CREATE, EventAction.WRITE, EventType.CHANGE),
}
_UNCLASSIFIED_STATEMENT = (None, EventAction.READ, EventType.ACCESS)


def _statement_kind(statement: str | None) -> tuple[DatabaseOperation | None, EventAction, EventType]:
    return _STATEMENT_KINDS.get((statement or "").lstrip()[:6].upper(), _UNCLASSIFIED_STATEMENT)


def _extract_sqlstate(exception: BaseException) -> str | None:
    for attr in ("pgcode", "sqlstate"):
        if code := getattr(exception, attr, None):
            return str(code)
    return None


def describe_database_error(error: BaseException) -> str:
    """Name a driver failure by class and SQLSTATE only; driver text such as DETAIL carries row values."""
    sqlstate = _extract_sqlstate(error)
    name = type(error).__name__
    return f"{name} (SQLSTATE {sqlstate})" if sqlstate else name


def setup_db_logging(
    engine: Any,
    service_name: str,
    *,
    logger: EventLogger | None = None,
) -> None:
    """
    Attaches automatic event logging listeners to a SQLAlchemy engine.

    Args:
        engine: The SQLAlchemy Engine or AsyncEngine to attach to.
        service_name: The name of the service (e.g., 'backend', 'auth-service').
    """
    try:
        from sqlalchemy import event  # noqa: PLC0415 - SQLAlchemy is an optional package extra
        from sqlalchemy.orm import Session  # noqa: PLC0415 - SQLAlchemy is an optional package extra
    except ImportError as err:
        raise ImportError(
            "sqlalchemy is required for setup_db_logging. Install with: pip install event-logging[db]"
        ) from err

    event_logger = logger or EventLogger(service_name=service_name)

    sync_engine = engine.sync_engine if hasattr(engine, "sync_engine") else engine

    def emit(method_name: str, **context: Any) -> None:
        """A logging sink must never change the observed database outcome."""
        try:
            getattr(event_logger, method_name)(**context)
        except Exception:
            return

    def session_uses_engine(session: Session) -> bool:
        try:
            bind = session.get_bind()
        except Exception:
            return False
        return bind is sync_engine or getattr(bind, "engine", None) is sync_engine

    @event.listens_for(sync_engine, "before_cursor_execute")
    def before_cursor_execute(
        conn: Any,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: Any,
        executemany: bool,
    ) -> None:
        context._query_start_time_ns = perf_counter_ns()

    @event.listens_for(sync_engine, "after_cursor_execute")
    def log_db_query(
        conn: Any,
        cursor: Any,
        statement: str,
        parameters: Any,
        context: Any,
        executemany: bool,
    ) -> None:
        start_time_ns = getattr(context, "_query_start_time_ns", None)
        duration_ns = max(0, perf_counter_ns() - start_time_ns) if start_time_ns is not None else 0

        operation, action, event_type = _statement_kind(statement)
        rows_affected = context.rowcount if hasattr(context, "rowcount") else 0

        db_event = LogEventDefault.DB_READ if action == EventAction.READ else LogEventDefault.DB_WRITE

        emit(
            "debug",
            action=action,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.DATABASE,
            default_event=db_event,
            event_type=event_type,
            message=f"DB Query: {operation.value if operation else 'EXECUTE'}",
            database_operation=operation,
            database_query=statement,
            database_rows_affected=rows_affected,
            event_duration=duration_ns,
        )

    @event.listens_for(sync_engine, "handle_error")
    def log_db_error(exception_context: Any) -> None:
        execution_context = getattr(exception_context, "execution_context", None)
        start_time_ns = (
            getattr(execution_context, "_query_start_time_ns", None) if execution_context is not None else None
        )
        duration_ns = max(0, perf_counter_ns() - start_time_ns) if start_time_ns is not None else 0

        operation, action, event_type = _statement_kind(exception_context.statement)

        emit(
            "error",
            action=action,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_ERROR,
            event_type=event_type,
            message="Database operation failed",
            error_message=describe_database_error(exception_context.original_exception),
            event_code=_extract_sqlstate(exception_context.original_exception),
            database_operation=operation,
            event_duration=duration_ns,
        )

    @event.listens_for(Session, "after_commit")
    def log_commit(session: Session) -> None:
        if not session_uses_engine(session):
            return
        emit(
            "info",
            action=EventAction.CHANGE,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_COMMIT,
            message="Transaction committed",
        )

    @event.listens_for(Session, "after_rollback")
    def log_rollback(session: Session) -> None:
        if not session_uses_engine(session):
            return
        emit(
            "warn",
            action=EventAction.CHANGE,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.DATABASE,
            default_event=LogEventDefault.DB_ROLLBACK,
            message="Transaction rolled back",
        )
