from __future__ import annotations

from collections import defaultdict
from collections.abc import Iterable
from dataclasses import dataclass, field
from typing import Any
from uuid import UUID

from temporal.workflows.project_versioning.types import FileDiffSummary

BUILD_PROJECT_VERSION_COPY_PLAN = "build_project_version_copy_plan"

DOCUMENT_MANAGEMENT_SERVICE = "document_management_service"
PROJECT_LOGIC_SERVICE = "project_logic_service"
EXAMINATION_SERVICE = "examination_service"

MVP_STATUS_CHECKED = "checked"
MVP_STATUS_NEEDS_REVISION = "needs_revision"
SATZ_STATUS_CHECKED = "checked"
SATZ_STATUS_NEEDS_REVISION = "needs_revision"


@dataclass(frozen=True)
class NodeKey:
    service: str
    node_type: str
    id: UUID


@dataclass(frozen=True)
class ParentRef:
    service: str
    node_type: str
    id: UUID


@dataclass(frozen=True)
class NodeSummary:
    service: str
    id: UUID
    node_type: str
    parents: tuple[ParentRef, ...] = field(default_factory=tuple)
    frontend_parent_ids: tuple[str, ...] = field(default_factory=tuple)

    @property
    def key(self) -> NodeKey:
        return NodeKey(service=self.service, node_type=self.node_type, id=self.id)


@dataclass
class TopicNormRevisionRequests:
    mvp_topic_norm_ids: set[UUID] = field(default_factory=set)
    rpb_satz_ids_by_topic_norm_id: dict[UUID, set[UUID]] = field(default_factory=lambda: defaultdict(set))
    changed_satz_ids: set[UUID] = field(default_factory=set)


@dataclass
class ProjectVersionCopyPlanPreparation:
    summaries: list[NodeSummary]
    deleted_keys: set[NodeKey]
    changed_keys: set[NodeKey]
    renamed_file_names: dict[UUID, str]
    topic_norm_revision_requests: TopicNormRevisionRequests
    deleted_file_ids: set[UUID]


def collect_dependents(
    *,
    roots: Iterable[NodeKey],
    summaries: Iterable[NodeSummary],
) -> set[NodeKey]:
    summaries = list(summaries)
    children_of: dict[NodeKey, list[NodeKey]] = defaultdict(list)
    for summary in summaries:
        for parent in summary.parents:
            children_of[NodeKey(parent.service, parent.node_type, parent.id)].append(summary.key)

    known_keys = {summary.key for summary in summaries}
    visited: set[NodeKey] = set()
    queue: list[NodeKey] = list(roots)
    while queue:
        current = queue.pop()
        if current in visited:
            continue
        visited.add(current)
        for child in children_of.get(current, ()):
            if child not in visited:
                queue.append(child)

    return visited & known_keys


def decode_node_summaries(rows: list[dict[str, Any]]) -> list[NodeSummary]:
    service_by_node_ref = {(row["node_type"], UUID(str(row["id"]))): row["_service"] for row in rows}
    summaries: list[NodeSummary] = []
    for row in rows:
        owning_service = row["_service"]
        parents = tuple(
            ParentRef(
                service=service_by_node_ref[(parent["node_type"], UUID(str(parent["id"])))],
                node_type=parent["node_type"],
                id=UUID(str(parent["id"])),
            )
            for parent in row.get("parents", [])
        )
        summaries.append(
            NodeSummary(
                service=owning_service,
                id=UUID(str(row["id"])),
                node_type=row["node_type"],
                parents=parents,
                frontend_parent_ids=tuple(str(parent_id) for parent_id in row.get("frontend_parent_ids", [])),
            )
        )
    return summaries


def _parent_ids(summary: NodeSummary, *, service: str, node_type: str) -> set[UUID]:
    return {parent.id for parent in summary.parents if parent.service == service and parent.node_type == node_type}


def _first_parent_id(summary: NodeSummary, *, service: str, node_type: str) -> UUID | None:
    return next(iter(_parent_ids(summary, service=service, node_type=node_type)), None)


def _frontend_ref_ids(summary: NodeSummary, node_type: str) -> set[UUID]:
    prefix = f"{node_type}:"
    ids: set[UUID] = set()
    for ref in summary.frontend_parent_ids:
        if ref.startswith(prefix):
            try:
                ids.add(UUID(ref.removeprefix(prefix)))
            except ValueError:
                continue
    return ids


def _file_roots(file_ids: set[UUID]) -> set[NodeKey]:
    return {
        NodeKey(
            service=DOCUMENT_MANAGEMENT_SERVICE,
            node_type="file",
            id=file_id,
        )
        for file_id in file_ids
    }


def _entry_file_ids(entries: Iterable[Any]) -> set[UUID]:
    return {UUID(str(entry.file_id)) for entry in entries}


def _renamed_file_names(file_diff: FileDiffSummary) -> dict[UUID, str]:
    names: dict[UUID, str] = {}
    for entry in file_diff.renamed:
        if entry.target_filename:
            names[UUID(str(entry.file_id))] = entry.target_filename
    return names


def _topic_norm_revision_requests(
    summaries: list[NodeSummary],
    changed_keys: set[NodeKey],
) -> TopicNormRevisionRequests:
    summaries_by_key = {summary.key: summary for summary in summaries}
    requests = TopicNormRevisionRequests()

    changed_topic_ids: set[UUID] = set()
    for summary in summaries:
        if summary.key not in changed_keys:
            continue
        if summary.service == EXAMINATION_SERVICE and summary.node_type == "dokument":
            changed_topic_ids.update(_frontend_ref_ids(summary, "topic"))
        if summary.service == EXAMINATION_SERVICE and summary.node_type == "fundstelle":
            satz_id = _first_parent_id(summary, service=EXAMINATION_SERVICE, node_type="satz")
            norm_id = _first_parent_id(summary, service=EXAMINATION_SERVICE, node_type="norm")
            if satz_id is None or norm_id is None:
                continue
            requests.changed_satz_ids.add(satz_id)
            norm_summary = summaries_by_key.get(NodeKey(EXAMINATION_SERVICE, "norm", norm_id))
            if norm_summary is None:
                continue
            for topic_norm_id in _frontend_ref_ids(norm_summary, "topic_norm"):
                requests.rpb_satz_ids_by_topic_norm_id[topic_norm_id].add(satz_id)

    for summary in summaries:
        if summary.service != PROJECT_LOGIC_SERVICE or summary.node_type != "topic_norm":
            continue
        topic_ids = _parent_ids(summary, service=PROJECT_LOGIC_SERVICE, node_type="topic")
        if topic_ids & changed_topic_ids:
            requests.mvp_topic_norm_ids.add(summary.id)

    return requests


def _topic_norm_payloads_by_id(rows: list[dict[str, Any]]) -> dict[UUID, dict[str, Any]]:
    payloads: dict[UUID, dict[str, Any]] = {}
    for row in rows:
        payload_id = row.get("id")
        if payload_id is not None:
            payloads[UUID(str(payload_id))] = row
    return payloads


def _topic_norm_overrides(
    *,
    topic_norm_id: UUID,
    payloads_by_id: dict[UUID, dict[str, Any]],
    requests: TopicNormRevisionRequests,
) -> dict[str, Any]:
    payload = payloads_by_id.get(topic_norm_id, {})
    overrides: dict[str, Any] = {}

    if topic_norm_id in requests.mvp_topic_norm_ids and payload.get("mvp_status") == MVP_STATUS_CHECKED:
        overrides["mvp_status"] = MVP_STATUS_NEEDS_REVISION

    satz_ids = requests.rpb_satz_ids_by_topic_norm_id.get(topic_norm_id, set())
    if satz_ids:
        satz_statuses = dict(payload.get("satz_statuses") or {})
        changed = False
        for satz_id in satz_ids:
            key = str(satz_id)
            if satz_statuses.get(key) == SATZ_STATUS_CHECKED:
                satz_statuses[key] = SATZ_STATUS_NEEDS_REVISION
                changed = True
        if changed:
            overrides["satz_statuses"] = satz_statuses

    return overrides


def build_copy_nodes_by_service(
    *,
    summaries: list[NodeSummary],
    deleted_keys: set[NodeKey],
    changed_keys: set[NodeKey],
    renamed_file_names: dict[UUID, str],
    topic_norm_payloads_by_id: dict[UUID, dict[str, Any]],
    topic_norm_revision_requests: TopicNormRevisionRequests,
) -> dict[str, list[dict[str, Any]]]:
    nodes_by_service: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for summary in summaries:
        if summary.service == DOCUMENT_MANAGEMENT_SERVICE or summary.key in deleted_keys:
            continue

        overrides: dict[str, Any] = {}
        set_outdated = False
        if summary.service == EXAMINATION_SERVICE:
            if summary.key in changed_keys and summary.node_type in {"dokument", "fundstelle"}:
                set_outdated = True
            if summary.node_type == "bewertung":
                satz_ids = _parent_ids(summary, service=EXAMINATION_SERVICE, node_type="satz")
                set_outdated = bool(satz_ids & topic_norm_revision_requests.changed_satz_ids)
            if summary.node_type == "dokument":
                dms_file_id = _first_parent_id(
                    summary,
                    service=DOCUMENT_MANAGEMENT_SERVICE,
                    node_type="file",
                )
                if dms_file_id in renamed_file_names:
                    overrides["filename"] = renamed_file_names[dms_file_id]

        if summary.service == PROJECT_LOGIC_SERVICE and summary.node_type == "topic_norm":
            overrides.update(
                _topic_norm_overrides(
                    topic_norm_id=summary.id,
                    payloads_by_id=topic_norm_payloads_by_id,
                    requests=topic_norm_revision_requests,
                )
            )

        node: dict[str, Any] = {"node_type": summary.node_type, "id": str(summary.id)}
        if set_outdated:
            node["set_outdated"] = True
        if overrides:
            node["overrides"] = overrides
        nodes_by_service[summary.service].append(node)
    return dict(nodes_by_service)


def _rows_with_service(rows_by_service: dict[str, list[dict[str, Any]]]) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    for service, service_rows in rows_by_service.items():
        for row in service_rows:
            if row.get("_service") == service:
                rows.append(row)
            else:
                rows.append({**row, "_service": row.get("_service", service)})
    return rows


def prepare_project_version_copy_plan(
    *,
    rows_by_service: dict[str, list[dict[str, Any]]],
    file_diff: FileDiffSummary,
) -> ProjectVersionCopyPlanPreparation:
    summaries = decode_node_summaries(_rows_with_service(rows_by_service))
    deleted_file_ids = _entry_file_ids(file_diff.deleted)
    deleted_keys = collect_dependents(
        roots=_file_roots(deleted_file_ids),
        summaries=summaries,
    )
    changed_keys = collect_dependents(
        roots=_file_roots(_entry_file_ids(file_diff.changed)),
        summaries=summaries,
    )
    return ProjectVersionCopyPlanPreparation(
        summaries=summaries,
        deleted_keys=deleted_keys,
        changed_keys=changed_keys,
        renamed_file_names=_renamed_file_names(file_diff),
        topic_norm_revision_requests=_topic_norm_revision_requests(summaries, changed_keys | deleted_keys),
        deleted_file_ids=deleted_file_ids,
    )


def topic_norm_node_refs_for_copy_plan(preparation: ProjectVersionCopyPlanPreparation) -> list[dict[str, str]]:
    topic_norm_ids = set(preparation.topic_norm_revision_requests.mvp_topic_norm_ids)
    topic_norm_ids.update(preparation.topic_norm_revision_requests.rpb_satz_ids_by_topic_norm_id.keys())
    return [{"node_type": "topic_norm", "id": str(topic_norm_id)} for topic_norm_id in sorted(topic_norm_ids, key=str)]


def build_project_version_copy_plan_payload(
    *,
    preparation: ProjectVersionCopyPlanPreparation,
    topic_norm_payload_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "survivors_per_service": build_copy_nodes_by_service(
            summaries=preparation.summaries,
            deleted_keys=preparation.deleted_keys,
            changed_keys=preparation.changed_keys,
            renamed_file_names=preparation.renamed_file_names,
            topic_norm_payloads_by_id=_topic_norm_payloads_by_id(topic_norm_payload_rows),
            topic_norm_revision_requests=preparation.topic_norm_revision_requests,
        ),
        "deleted_file_ids": [str(file_id) for file_id in sorted(preparation.deleted_file_ids, key=str)],
        "deleted_keys_count": len(preparation.deleted_keys),
    }


def build_project_version_copy_plan_payload_from_rows(
    *,
    rows_by_service: dict[str, list[dict[str, Any]]],
    file_diff: FileDiffSummary,
    topic_norm_payload_rows: list[dict[str, Any]],
) -> dict[str, Any]:
    return build_project_version_copy_plan_payload(
        preparation=prepare_project_version_copy_plan(
            rows_by_service=rows_by_service,
            file_diff=file_diff,
        ),
        topic_norm_payload_rows=topic_norm_payload_rows,
    )
