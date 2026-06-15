import logging
from datetime import datetime
from typing import Any

import httpx
from internal_auth import internal_api_key_headers
from pydantic import BaseModel

logger = logging.getLogger("temporal.tracking_client")


class StatusPayload(BaseModel):
    workflow_id: str
    run_id: str
    status: str
    workflow_type: str
    timestamp: datetime
    project_id: str | None = None
    project_version: int | None = None
    history_s3_key: str | None = None
    failure_message: str | None = None


class TrackingClient:
    def __init__(
        self,
        base_url: str,
        timeout: float = 3.0
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(
            headers=internal_api_key_headers(),
            timeout=timeout,
            transport=httpx.AsyncHTTPTransport(retries=2)
        )

    async def aclose(self) -> None:
        await self._client.aclose()

    async def post_status(self, p: StatusPayload) -> None:
        await self._post("/internal/workflows/status", p.model_dump(mode="json"))

    async def _post(self, path: str, body: dict[str, Any]) -> None:
        url = f"{self._base_url}{path}"
        try:
            resp = await self._client.post(url, json=body)
        except httpx.HTTPError as exc:
            logger.warning("tracking %s failed: %s", path, exc)
            return

        if resp.status_code not in (200, 204):
            logger.warning("tracking %s returned %s: %s", path, resp.status_code, resp.text[:200])
            return
