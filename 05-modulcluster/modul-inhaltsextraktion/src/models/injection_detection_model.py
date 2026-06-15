"""Async client for Text-Classification prompt injection classification models."""

import httpx
from pydantic import BaseModel

from src.config import get_config
from src.env import ENV


class ModelPrediction(BaseModel):
    """Single label/score pair returned by the classifier."""

    score: float
    label: str


class InjectionDetectionModel:
    """Async client for prompt injection detection via a Text-classification API."""

    def __init__(self) -> None:
        """Initialize the client with config-driven endpoint, auth, and timeout."""
        cfg = get_config()
        self._url = f"{ENV.INJECTION_MODEL_URL}"
        self._headers = {"Authorization": f"Bearer {ENV.INJECTION_MODEL_TOKEN}", "Content-Type": "application/json"}
        self._client = httpx.AsyncClient(timeout=cfg.INJECTION_REQUEST_TIMEOUT)

    async def classify(self, texts: list[str]) -> list[list[ModelPrediction]]:
        """Classify a batch of texts, returning predictions per input."""
        if not texts:
            return []
        payload = {"inputs": [[t] for t in texts]}
        response = await self._client.post(self._url, headers=self._headers, json=payload)
        response.raise_for_status()
        return [[ModelPrediction(**item) for item in chunk] for chunk in response.json()]

    async def close(self) -> None:
        """Close the underlying HTTP client and release its connection pool."""
        await self._client.aclose()

    async def __aenter__(self) -> "InjectionDetectionModel":
        """Enter the async context manager and return the client instance."""
        return self

    async def __aexit__(self, *_: object) -> None:
        """Exit the async context manager and close the HTTP client."""
        await self.close()
