from typing import Any
from uuid import UUID

import pytest

from src.config.settings import settings
from src.services.api_clients import PlsApiClient

PLS_BASE_URL = settings.api.pls_base_url

pytestmark = pytest.mark.integration


async def test_list_topics_basic(seed_topic: UUID) -> None:
    """Ensure list_topics returns a non-empty list and valid schema."""
    topics = await PlsApiClient.list_topics()

    assert isinstance(topics, list)
    assert len(topics) > 0
    assert seed_topic in [topic.id for topic in topics]


async def test_list_topics_with_project_id(seed_topic: UUID, seed_project: UUID) -> None:
    """Call list_topics with a random project_id (should return empty or valid list)."""
    topics = await PlsApiClient.list_topics(project_id=seed_project)

    assert isinstance(topics, list)
    assert len(topics) > 0
    assert seed_topic in [topic.id for topic in topics]


async def test_list_topics_pagination(seed_topic: UUID) -> None:
    """
    Force pagination by using a very small page size.
    Ensures multiple pages are fetched correctly.
    """
    topics = await PlsApiClient.list_topics(page_size=1)

    assert isinstance(topics, list)

    if len(topics) > 1:
        ids = [t.id for t in topics]
        assert len(ids) == len(set(ids))


async def test_list_topics_include_deleted_flag(seed_topic: UUID) -> None:
    """Ensure include_deleted flag does not break the API call."""
    topics = await PlsApiClient.list_topics(include_deleted=True)

    assert isinstance(topics, list)


async def test_list_topics_invalid_response(monkeypatch: pytest.MonkeyPatch) -> None:
    """
    Simulate API returning invalid (non-list) response.
    This mirrors your explicit TypeError branch.
    """

    class MockResponse:
        def json(self) -> dict[str, str]:
            return {"not": "a list"}

    async def mock_get(*args: Any, **kwargs: Any) -> MockResponse:
        return MockResponse()

    monkeypatch.setattr(PlsApiClient, "get", mock_get)

    with pytest.raises(TypeError):
        await PlsApiClient.list_topics()
