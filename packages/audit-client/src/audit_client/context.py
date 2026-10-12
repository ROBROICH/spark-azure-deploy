"""Pure cross-runtime audit context contract and task-local scope."""

from __future__ import annotations

import contextvars
import re
from collections.abc import Iterator, Mapping
from contextlib import contextmanager
from dataclasses import dataclass, fields
from datetime import UTC, datetime
from typing import Protocol
from uuid import UUID

from audit_client.settings import settings

HEADER_ACTOR_USER_ID = "X-Actor-User-Id"
HEADER_TRIGGERED_BY_USER_ID = "X-Triggered-By-User-Id"
HEADER_WORKFLOW_RUN_ID = "X-Workflow-Run-Id"
HEADER_WORKFLOW_TYPE = "X-Workflow-Type"
HEADER_REQUEST_START_TIME = settings.HEADER_REQUEST_START_TIME
HEADER_REQUEST_ID = settings.HEADER_REQUEST_ID

_UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
_ISO_TIMESTAMP_PATTERN = re.compile(
    r"^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d"
    r"(?:\.\d{1,9})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$"
)


@dataclass(frozen=True, slots=True)
class AuditContext:
    """The six incumbent request/workflow attribution values."""

    actor_user_id: UUID | None = None
    triggered_by_user_id: UUID | None = None
    workflow_run_id: str | None = None
    workflow_type: str | None = None
    request_start_time: datetime | None = None
    request_id: str | None = None

    def __post_init__(self) -> None:
        if self.actor_user_id is not None and not isinstance(self.actor_user_id, UUID):
            raise ValueError("actor_user_id must be a UUID")
        if self.triggered_by_user_id is not None and not isinstance(self.triggered_by_user_id, UUID):
            raise ValueError("triggered_by_user_id must be a UUID")
        for value, name in (
            (self.workflow_run_id, "workflow_run_id"),
            (self.workflow_type, "workflow_type"),
        ):
            if value is not None and (not isinstance(value, str) or not value.strip()):
                raise ValueError(f"{name} must be a non-empty string")
            if value is not None:
                object.__setattr__(self, name, value.strip())
        if self.request_start_time is not None and (
            not isinstance(self.request_start_time, datetime)
            or self.request_start_time.tzinfo is None
            or self.request_start_time.utcoffset() is None
        ):
            raise ValueError("request_start_time must include a timezone")
        if self.request_id is not None:
            parsed_request_id = _parse_uuid(self.request_id)
            if parsed_request_id is None:
                raise ValueError("request_id must be a UUID")
            object.__setattr__(self, "request_id", str(parsed_request_id))


@dataclass(frozen=True, slots=True)
class _AuditScope:
    active: AuditContext
    forwarded: AuditContext


class NormalizedIdentity(Protocol):
    """The public normalized-auth surface needed for audit attribution."""

    sub: str


_EMPTY_CONTEXT = AuditContext()
_audit_scope_ctx: contextvars.ContextVar[_AuditScope | None] = contextvars.ContextVar(
    "audit_scope",
    default=None,
)

# Compatibility ContextVars remain public through ``audit_client.forwarding``.
audit_headers_ctx: contextvars.ContextVar[dict[str, str] | None] = contextvars.ContextVar(
    "audit_headers",
    default=None,
)
bearer_token_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "bearer_token",
    default=None,
)
actor_user_id_ctx: contextvars.ContextVar[UUID | None] = contextvars.ContextVar(
    "actor_user_id",
    default=None,
)
request_start_time_ctx: contextvars.ContextVar[datetime | None] = contextvars.ContextVar(
    "request_start_time",
    default=None,
)
request_id_ctx: contextvars.ContextVar[str | None] = contextvars.ContextVar(
    "request_id",
    default=None,
)


def _parse_uuid(value: str | None) -> UUID | None:
    if value is None:
        return None
    normalized = value.strip()
    if not _UUID_PATTERN.fullmatch(normalized):
        return None
    return UUID(normalized)


def _parse_text(value: str | None) -> str | None:
    if value is None:
        return None
    normalized = value.strip()
    return normalized or None


def _parse_timestamp(value: str | None) -> datetime | None:
    normalized = value.strip() if value is not None else ""
    if not normalized:
        return None
    parsed: datetime | None = None
    try:
        if normalized.isdecimal():
            parsed = datetime.fromtimestamp(int(normalized) / 1000, tz=UTC)
        elif _ISO_TIMESTAMP_PATTERN.fullmatch(normalized):
            parsed = datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except (OverflowError, OSError, ValueError):
        pass
    if parsed is None or parsed.tzinfo is None or parsed.utcoffset() is None:
        return None
    return parsed.astimezone(UTC)


def _canonical_timestamp(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def parse_audit_headers(headers: Mapping[str, str]) -> AuditContext:
    """Parse canonical headers independently; malformed optionals become absent."""

    casefolded = {str(name).lower(): str(value) for name, value in headers.items()}

    def get(name: str) -> str | None:
        return casefolded.get(name.lower())

    return AuditContext(
        actor_user_id=_parse_uuid(get(HEADER_ACTOR_USER_ID)),
        triggered_by_user_id=_parse_uuid(get(HEADER_TRIGGERED_BY_USER_ID)),
        workflow_run_id=_parse_text(get(HEADER_WORKFLOW_RUN_ID)),
        workflow_type=_parse_text(get(HEADER_WORKFLOW_TYPE)),
        request_start_time=_parse_timestamp(get(HEADER_REQUEST_START_TIME)),
        request_id=(str(request_id) if (request_id := _parse_uuid(get(HEADER_REQUEST_ID))) is not None else None),
    )


def resolve_audit_context(
    *,
    explicit: AuditContext | None = None,
    active: AuditContext | None = None,
    forwarded: AuditContext | None = None,
) -> AuditContext:
    """Resolve each value using explicit, then active, then forwarded precedence."""

    levels = (explicit or _EMPTY_CONTEXT, active or _EMPTY_CONTEXT, forwarded or _EMPTY_CONTEXT)
    values = {
        field.name: next(
            (value for level in levels if (value := getattr(level, field.name)) is not None),
            None,
        )
        for field in fields(AuditContext)
    }
    return AuditContext(**values)


def audit_context_headers(context: AuditContext) -> dict[str, str]:
    """Serialize only valid present fields using the six canonical spellings."""

    headers: dict[str, str] = {}
    if context.actor_user_id is not None:
        headers[HEADER_ACTOR_USER_ID] = str(context.actor_user_id)
    if context.triggered_by_user_id is not None:
        headers[HEADER_TRIGGERED_BY_USER_ID] = str(context.triggered_by_user_id)
    if context.workflow_run_id is not None:
        headers[HEADER_WORKFLOW_RUN_ID] = context.workflow_run_id
    if context.workflow_type is not None:
        headers[HEADER_WORKFLOW_TYPE] = context.workflow_type
    if context.request_start_time is not None:
        headers[HEADER_REQUEST_START_TIME] = _canonical_timestamp(context.request_start_time)
    if context.request_id is not None:
        headers[HEADER_REQUEST_ID] = context.request_id
    return headers


def current_audit_context(*, explicit: AuditContext | None = None) -> AuditContext:
    """Return the resolved context for this task without exposing mutable storage."""

    scope = _audit_scope_ctx.get()
    scoped_active = scope.active if scope is not None else _EMPTY_CONTEXT
    scoped_forwarded = scope.forwarded if scope is not None else _EMPTY_CONTEXT
    compatibility_active = AuditContext(
        actor_user_id=actor_user_id_ctx.get(),
        request_start_time=request_start_time_ctx.get(),
        request_id=request_id_ctx.get(),
    )
    compatibility_forwarded = parse_audit_headers(audit_headers_ctx.get() or {})
    return resolve_audit_context(
        explicit=explicit,
        active=resolve_audit_context(explicit=compatibility_active, active=scoped_active),
        forwarded=resolve_audit_context(
            explicit=scoped_forwarded,
            active=compatibility_forwarded,
        ),
    )


@contextmanager
def audit_context_scope(
    *,
    active: AuditContext | None = None,
    forwarded: AuditContext | None = None,
) -> Iterator[AuditContext]:
    """Establish a nested task-local scope and guarantee token reset."""

    parent = _audit_scope_ctx.get()
    compatibility_active = AuditContext(
        actor_user_id=actor_user_id_ctx.get(),
        request_start_time=request_start_time_ctx.get(),
        request_id=request_id_ctx.get(),
    )
    compatibility_forwarded = parse_audit_headers(audit_headers_ctx.get() or {})
    if parent is None:
        parent_active = compatibility_active
        parent_forwarded = compatibility_forwarded
    else:
        parent_active = parent.active
        parent_forwarded = parent.forwarded
    scope = _AuditScope(
        active=resolve_audit_context(explicit=active, active=parent_active),
        forwarded=resolve_audit_context(explicit=forwarded, active=parent_forwarded),
    )
    effective = resolve_audit_context(active=scope.active, forwarded=scope.forwarded)

    scope_token = _audit_scope_ctx.set(scope)
    headers_token = audit_headers_ctx.set(audit_context_headers(scope.forwarded) or None)
    actor_token = actor_user_id_ctx.set(effective.actor_user_id)
    start_token = request_start_time_ctx.set(effective.request_start_time)
    request_token = request_id_ctx.set(effective.request_id)
    try:
        yield effective
    finally:
        request_id_ctx.reset(request_token)
        request_start_time_ctx.reset(start_token)
        actor_user_id_ctx.reset(actor_token)
        audit_headers_ctx.reset(headers_token)
        _audit_scope_ctx.reset(scope_token)


@contextmanager
def isolated_audit_context_scope(context: AuditContext) -> Iterator[AuditContext]:
    """Replace all six audit fields and clear compatibility/token state."""

    if not isinstance(context, AuditContext):
        raise ValueError("isolated audit context must be an AuditContext")
    empty = AuditContext()
    scope_token = _audit_scope_ctx.set(_AuditScope(active=context, forwarded=empty))
    headers_token = audit_headers_ctx.set(None)
    bearer_token = bearer_token_ctx.set(None)
    actor_token = actor_user_id_ctx.set(context.actor_user_id)
    start_token = request_start_time_ctx.set(context.request_start_time)
    request_token = request_id_ctx.set(context.request_id)
    try:
        yield context
    finally:
        request_id_ctx.reset(request_token)
        request_start_time_ctx.reset(start_token)
        actor_user_id_ctx.reset(actor_token)
        bearer_token_ctx.reset(bearer_token)
        audit_headers_ctx.reset(headers_token)
        _audit_scope_ctx.reset(scope_token)


def audit_context_from_identity(identity: NormalizedIdentity | None) -> AuditContext:
    """Select only the normalized public subject; no token/private claim can flow."""

    return AuditContext(actor_user_id=_parse_uuid(identity.sub if identity is not None else None))


@contextmanager
def audit_identity_context(identity: NormalizedIdentity | None) -> Iterator[AuditContext]:
    """Overlay normalized authentication attribution for the current task."""

    with audit_context_scope(active=audit_context_from_identity(identity)) as context:
        yield context
