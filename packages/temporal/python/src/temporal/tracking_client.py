import logging
from typing import Any

import httpx

from temporal.contracts import WorkflowStatusEvent

logger = logging.getLogger("temporal.tracking_client")


class TrackingClient:
    def __init__(self, base_url: str, timeout: float = 3.0) -> None:
        self._base_url = base_url.rstrip("/")
        self._client = httpx.AsyncClient(timeout=timeout, transport=httpx.AsyncHTTPTransport(retries=2))

    async def aclose(self) -> None:
        await self._client.aclose()

    async def post_status(self, event: WorkflowStatusEvent) -> None:
        await self._post(
            "/internal/workflows/status",
            event.model_dump(mode="json", by_alias=True),
        )

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
