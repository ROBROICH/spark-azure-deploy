import uuid

import httpx
from audit_client import merge_audit_headers
from authentification.internal_api_key import internal_api_key_headers, merge_internal_api_key_header

from src.config.settings import settings
from src.models.schemas.topic_schemas import TopicResponse


class VaeTemplateApiClient:
    """Simple API client for VAE templates."""

    def __init__(self, timeout: float = 10.0):
        self.timeout = timeout
        self.base_url = settings.API.ADMINISTRATIVE_FILE_DRAFT_BASE_URL.rstrip("/")

    async def __aenter__(self):
        self._client = httpx.AsyncClient(timeout=self.timeout, headers=internal_api_key_headers())
        return self

    async def __aexit__(self, *args):
        await self._client.aclose()

    async def assign_template(self, project_id: uuid.UUID, project_type_id: uuid.UUID, topics: list[TopicResponse]):
        """Assign a template to the project."""
        url = f"{self.base_url}/templates/{project_id}/assign-template/{project_type_id}"
        headers = merge_internal_api_key_header(merge_audit_headers(None))
        res = await self._client.post(
            url,
            json={"topics": [topic.model_dump(mode="json") for topic in topics]},
            headers=headers,
        )
        res.raise_for_status()
        return res.json()
