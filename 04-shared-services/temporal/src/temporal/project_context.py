from __future__ import annotations

import contextvars
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from uuid import UUID

from temporalio.common import (
    SearchAttributeKey,
    SearchAttributePair,
    SearchAttributes,
    TypedSearchAttributes,
)

PROJECT_CONTEXT_HEADER_KEY = "project-context"
PROJECT_ID_SEARCH_ATTRIBUTE = SearchAttributeKey.for_keyword("ProjectId")
PROJECT_VERSION_SEARCH_ATTRIBUTE = SearchAttributeKey.for_int("ProjectVersion")


@dataclass(frozen=True)
class ProjectContext:
    project_id: str
    project_version: int


project_context: contextvars.ContextVar[ProjectContext | None] = contextvars.ContextVar(
    "project_context",
    default=None,
)


def current_project_context() -> ProjectContext | None:
    return project_context.get()


def _normalize_project_id(project_id: str | UUID | None) -> str | None:
    if project_id is None:
        return None
    return str(project_id)


def make_project_context(
    project_id: str | UUID | None,
    project_version: int | None,
) -> ProjectContext | None:
    normalized_project_id = _normalize_project_id(project_id)
    if normalized_project_id is None or project_version is None:
        return None
    return ProjectContext(project_id=normalized_project_id, project_version=project_version)


@contextmanager
def use_project_context(
    project_id: str | UUID | None,
    project_version: int | None,
) -> Iterator[ProjectContext | None]:
    context = make_project_context(project_id, project_version)
    if context is None:
        yield None
        return

    token = project_context.set(context)
    try:
        yield context
    finally:
        project_context.reset(token)


def resolve_project_context(
    project_id: str | UUID | None = None,
    project_version: int | None = None,
) -> tuple[str | None, int | None]:
    explicit_project_id = _normalize_project_id(project_id)
    context = current_project_context()
    resolved_project_id = explicit_project_id or (context.project_id if context else None)

    resolved_project_version = project_version
    if resolved_project_version is None and context is not None:
        if explicit_project_id is None or explicit_project_id == context.project_id:
            resolved_project_version = context.project_version

    return resolved_project_id, resolved_project_version


def project_search_attribute_pairs(
    project_id: str | UUID | None = None,
    project_version: int | None = None,
) -> list[SearchAttributePair]:
    resolved_project_id, resolved_project_version = resolve_project_context(project_id, project_version)
    pairs: list[SearchAttributePair] = []
    if resolved_project_id is not None:
        pairs.append(SearchAttributePair(PROJECT_ID_SEARCH_ATTRIBUTE, resolved_project_id))
    if resolved_project_version is not None:
        pairs.append(SearchAttributePair(PROJECT_VERSION_SEARCH_ATTRIBUTE, resolved_project_version))
    return pairs


def merge_project_search_attributes(
    search_attributes: SearchAttributes | TypedSearchAttributes | None,
    project_id: str | UUID | None = None,
    project_version: int | None = None,
) -> SearchAttributes | TypedSearchAttributes | None:
    pairs = project_search_attribute_pairs(project_id, project_version)
    if not pairs:
        return search_attributes

    if search_attributes is None:
        return TypedSearchAttributes(pairs)

    if isinstance(search_attributes, TypedSearchAttributes):
        return search_attributes.updated(*pairs)

    attrs: dict[str, object] = dict(search_attributes)
    for pair in pairs:
        attrs[pair.key.name] = [pair.value]
    return attrs


def project_scoped_workflow_id(
    workflow_id: str,
    project_id: str | UUID,
    project_version: int | None = None,
    *suffixes: str | UUID,
) -> str:
    resolved_project_id, resolved_project_version = resolve_project_context(project_id, project_version)
    if resolved_project_id is None:
        raise ValueError("project_id is required for a project-scoped workflow id")

    parts = [workflow_id, resolved_project_id]
    if resolved_project_version is not None:
        parts.append(f"v{resolved_project_version}")
    parts.extend(str(suffix) for suffix in suffixes)
    return "-".join(parts)
