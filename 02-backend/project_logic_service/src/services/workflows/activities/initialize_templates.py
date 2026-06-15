from uuid import UUID

import httpx
from audit_client import merge_audit_headers
from authentification.internal_api_key import internal_api_key_headers, merge_internal_api_key_header
from temporalio import activity

from src.config.settings import settings
from src.models.db.database import AsyncSessionLocal, _init_engine
from src.models.schemas.topic_schemas import TopicResponse
from src.services.api_clients import VaeTemplateApiClient
from src.utils.service_utils import create_topic_service


@activity.defn
async def initialize_fcs_required_document_types(
    project_id: UUID,
    project_type_id: UUID,
    project_version: int,
) -> None:
    """Initializes the FCS required-document baseline for a project version."""
    url = f"{settings.API.FCS_BASE_URL.rstrip('/')}/{project_id}/required-document-types/initialize"
    headers = merge_internal_api_key_header(merge_audit_headers(None))
    async with httpx.AsyncClient(timeout=settings.API.TIMEOUT, headers=internal_api_key_headers()) as client:
        response = await client.post(
            url,
            params={"project_version": project_version},
            json={"project_type_id": str(project_type_id)},
            headers=headers,
        )
        response.raise_for_status()


@activity.defn
async def assign_vae_template(project_id: UUID, project_type_id: UUID) -> None:
    """
    Initializes the vae template for a project.
    """
    _init_engine()
    async with AsyncSessionLocal() as session:
        topic_service = await create_topic_service(db=session)
        topics = await topic_service.list_topics(project_id=project_id, page_size=10000)
        topic_models = [TopicResponse(**topic.__dict__) for topic in topics]

    async with VaeTemplateApiClient() as client:
        await client.assign_template(
            project_id=project_id,
            project_type_id=project_type_id,
            topics=topic_models,
        )
