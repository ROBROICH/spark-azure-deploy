from typing import Any
from uuid import UUID

from temporalio import activity

from src.models.schemas.files import FileObject, FileUpdateRequest
from src.models.schemas.temporal.fvp import (
    TemplateDocumentTypeResponse,
)
from src.models.schemas.topics import TopicResponse
from src.services.api_clients import ExaminationServiceClient, FilesApiClient, FVPClient, PlsApiClient


@activity.defn
async def get_template_document_types(
    project_id: str,
) -> list[TemplateDocumentTypeResponse]:
    """Gets the list of template document types associated with a project."""
    return await FVPClient.get_template_document_types(project_id)


@activity.defn
async def get_project_files(project_id: str) -> list[FileObject]:
    """Gets all available file objects for a project."""
    return await FilesApiClient.list_files(project_id)


@activity.defn
async def get_formal_completeness_results(project_id: str) -> dict[str, Any]:
    """Gets persisted formal-completeness results for a project."""
    return await FVPClient.get_results(project_id)


async def _fetch_existing_dokument_nodes(project_id: str) -> list[dict[str, Any]]:
    graph = await ExaminationServiceClient.list_nodes(UUID(project_id))
    refs = [
        {"node_type": "dokument", "id": node["id"]}
        for node in graph.get("nodes", [])
        if node.get("node_type") == "dokument"
    ]
    if not refs:
        return []
    result = await ExaminationServiceClient.batch_get_nodes(UUID(project_id), refs)
    return result.get("results", [])


@activity.defn
async def fetch_existing_dokument_nodes(project_id: str) -> list[dict[str, Any]]:
    return await _fetch_existing_dokument_nodes(project_id)


@activity.defn
async def mark_toc_document(project_id: str, dms_file_id: str) -> dict[str, Any]:
    dokumente = await _fetch_existing_dokument_nodes(project_id)
    updates = [
        {
            "node_type": "dokument",
            "id": doc["id"],
            "payload": {"is_toc_document": str(doc.get("dms_file_id")) == str(dms_file_id)},
        }
        for doc in dokumente
    ]
    if not updates:
        return {"updated": []}
    return await ExaminationServiceClient.update_nodes(UUID(project_id), inserts=[], updates=updates)


@activity.defn
async def get_topics(project_id: str) -> list[TopicResponse]:
    """Gets the lowest level of topics for a project."""
    topics = await PlsApiClient.list_topics(project_id=UUID(project_id))
    return [topic for topic in topics if topic.parent_topic_id is None]


@activity.defn
async def update_file_topics(file_id: UUID, topic_ids: list[UUID]) -> FileObject:
    """Updates the topics for a file."""
    return await FilesApiClient.update_file(
        file_id=file_id,
        update_data=FileUpdateRequest(
            topics=topic_ids,
        ),
    )
