from __future__ import annotations

from importlib import import_module
from typing import TYPE_CHECKING, Any

from audit_client.changes import AuditChange, build_audit_change, build_audit_changes
from audit_client.context import (
    AuditContext,
    audit_context_from_identity,
    audit_context_scope,
    audit_identity_context,
    current_audit_context,
    isolated_audit_context_scope,
    parse_audit_headers,
    resolve_audit_context,
)
from audit_client.dependencies import audit_actor_dependency
from audit_client.enums import ChangeType
from audit_client.forwarding import (
    actor_user_id_ctx,
    audit_headers,
    audit_headers_ctx,
    bearer_token_ctx,
    current_audit_headers,
    merge_audit_headers,
    set_audit_headers_context,
)
from audit_client.middleware import AuditContextMiddleware, audit_context_kwargs
from audit_client.workflow import workflow_propagation_values

if TYPE_CHECKING:
    from audit_client.client import AuditEntry

_LAZY_CLIENT_EXPORTS = {"AuditEntry", "record_audit_entries", "record_audit_entry"}


def __getattr__(name: str) -> Any:
    """Keep persistence compatibility exports without importing SQLAlchemy eagerly."""

    if name in _LAZY_CLIENT_EXPORTS:
        return getattr(import_module("audit_client.client"), name)
    if name == "audit_log_table":
        return getattr(import_module("audit_client.models"), name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "AuditChange",
    "AuditContext",
    "AuditContextMiddleware",
    "AuditEntry",
    "ChangeType",
    "actor_user_id_ctx",
    "audit_actor_dependency",
    "audit_context_from_identity",
    "audit_context_kwargs",
    "audit_context_scope",
    "audit_headers",
    "audit_headers_ctx",
    "audit_identity_context",
    "audit_log_table",
    "bearer_token_ctx",
    "build_audit_change",
    "build_audit_changes",
    "current_audit_context",
    "current_audit_headers",
    "isolated_audit_context_scope",
    "merge_audit_headers",
    "parse_audit_headers",
    "record_audit_entries",
    "record_audit_entry",
    "resolve_audit_context",
    "set_audit_headers_context",
    "workflow_propagation_values",
]
