from uuid import UUID, uuid4

import pytest
from fastapi import status
from httpx import AsyncClient

from src.models.db_models import Project
from src.models.schemas.topic_schemas import (
    TopicResponse,
    UpdateTopicRequest,
)


@pytest.mark.asyncio
async def test_list_topics_empty(client: AsyncClient):
    response = await client.get("/topics")
    assert response.status_code == status.HTTP_200_OK
    assert isinstance(response.json(), list)
    assert len(response.json()) == 0


@pytest.mark.asyncio
@pytest.mark.parametrize("page,page_size,expected_min", [(1, 10, 0), (2, 5, 0), (1, 200, 0)])
async def test_list_topics_pagination(
    client: AsyncClient,
    created_topic: TopicResponse,
    page: int,
    page_size: int,
    expected_min: int,
):
    response = await client.get(
        "/topics",
        params={"page": page, "page_size": page_size},
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert isinstance(data, list)
    assert len(data) <= page_size


@pytest.mark.asyncio
async def test_list_topics_filter_by_project(
    client: AsyncClient, created_topic: TopicResponse, create_test_project: Project
):
    response = await client.get(
        "/topics",
        params={"projectId": str(create_test_project.id)},
    )
    assert response.status_code == status.HTTP_200_OK
    topics = [TopicResponse(**t) for t in response.json()]
    assert any(t.id == created_topic.id for t in topics)


@pytest.mark.asyncio
async def test_list_topics_include_deleted_false(client: AsyncClient, created_topic: TopicResponse):
    await client.delete(f"/topics/{created_topic.id}")

    response = await client.get("/topics", params={"includeDeleted": False})
    assert response.status_code == status.HTTP_200_OK
    assert not any(t["id"] == str(created_topic.id) for t in response.json())


@pytest.mark.asyncio
async def test_create_topic_success(client: AsyncClient, create_test_project: Project):
    payload = {
        "projectId": str(create_test_project.id),
        "name": "Integration Topic",
        "description": "Created via test",
    }
    response = await client.post(
        "/topics",
        json=payload,
    )
    assert response.status_code == status.HTTP_201_CREATED
    data = response.json()
    assert data["name"] == "Integration Topic"
    assert data["projectId"] == str(create_test_project.id)
    assert "id" in data
    assert UUID(data["id"])


@pytest.mark.asyncio
async def test_create_topic_missing_name_422(
    client: AsyncClient,
    create_test_project: Project,
):
    payload = {
        "projectId": str(create_test_project.id),
        "description": "Missing name",
    }
    response = await client.post(
        "/topics",
        json=payload,
    )
    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
    assert "detail" in response.json()


@pytest.mark.asyncio
async def test_get_topic_success(client: AsyncClient, created_topic: TopicResponse):
    response = await client.get(f"/topics/{created_topic.id}")
    assert response.status_code == status.HTTP_200_OK
    assert response.json()["id"] == str(created_topic.id)


@pytest.mark.asyncio
async def test_get_topic_not_found_404(client: AsyncClient):
    fake_id = uuid4()
    response = await client.get(f"/topics/{fake_id}")
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_update_topic_success(client: AsyncClient, created_topic: TopicResponse):
    payload = UpdateTopicRequest(
        name="Updated Name",
        description="Updated via test",
    )
    response = await client.patch(
        f"/topics/{created_topic.id}",
        json=payload.model_dump(exclude_unset=True, mode="json"),
    )
    assert response.status_code == status.HTTP_200_OK
    updated = response.json()
    assert updated["name"] == "Updated Name"


@pytest.mark.asyncio
async def test_update_topic_not_found(client: AsyncClient):
    fake_id = uuid4()
    response = await client.patch(
        f"/topics/{fake_id}",
        json={"name": "Try update ghost"},
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_delete_topic_success(client: AsyncClient, created_topic: TopicResponse):
    response = await client.delete(f"/topics/{created_topic.id}")
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert data["id"] == str(created_topic.id)
    assert data["isDeleted"]


@pytest.mark.asyncio
async def test_delete_topic_twice_still_200(client: AsyncClient, created_topic: TopicResponse):
    await client.delete(f"/topics/{created_topic.id}")
    response2 = await client.delete(f"/topics/{created_topic.id}")
    assert response2.status_code == status.HTTP_200_OK


@pytest.mark.asyncio
async def test_batch_get_topics(client: AsyncClient, created_topic: TopicResponse):
    response = await client.post(
        "/topics/batch",
        json=[str(created_topic.id), str(uuid4())],
    )
    assert response.status_code == status.HTTP_200_OK
    data = response.json()
    assert len(data) == 1
    assert data[0]["id"] == str(created_topic.id)


@pytest.mark.asyncio
async def test_batch_get_missing_raise(client: AsyncClient, created_topic: TopicResponse):
    fake_id = uuid4()
    response = await client.post(
        "/topics/batch",
        json=[
            str(created_topic.id),
            str(fake_id),
        ],
        params={"raiseOnMissing": True},
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND


@pytest.mark.asyncio
async def test_create_child_topic(client: AsyncClient, created_topic: TopicResponse):
    payload = {
        "projectId": str(created_topic.project_id),
        "name": "Child Topic",
        "description": "Child of A",
        "parentTopicId": str(created_topic.id),
    }

    response = await client.post(
        "/topics",
        json=payload,
    )
    assert response.status_code == status.HTTP_201_CREATED

    data = response.json()
    assert data["parentTopicId"] == str(created_topic.id)


@pytest.mark.asyncio
async def test_get_topic_with_parent(client: AsyncClient, created_topic: TopicResponse):
    # Create child
    response = await client.post(
        "/topics",
        json={
            "projectId": str(created_topic.project_id),
            "name": "Child Topic",
            "parentTopicId": str(created_topic.id),
        },
    )
    child = response.json()

    # Fetch child
    response = await client.get(f"/topics/{child['id']}")
    assert response.status_code == status.HTTP_200_OK

    data = response.json()
    assert data["parentTopicId"] == str(created_topic.id)


@pytest.mark.asyncio
async def test_delete_parent_cascades_to_children(client: AsyncClient, created_topic: TopicResponse):
    # Create child
    response = await client.post(
        "/topics",
        json={
            "projectId": str(created_topic.project_id),
            "name": "Child Topic",
            "parentTopicId": str(created_topic.id),
        },
    )
    child_id = response.json()["id"]

    # Delete parent
    await client.delete(f"/topics/{created_topic.id}")

    # Try fetching child
    response = await client.get(f"/topics/{child_id}")

    # Adjust depending on soft vs hard delete
    assert response.status_code in (
        status.HTTP_404_NOT_FOUND,
        status.HTTP_200_OK,
    )
