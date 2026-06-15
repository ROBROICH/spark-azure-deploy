"""Unit tests for supplementary request API routes."""

import uuid

import pytest
from httpx import AsyncClient

TOPIC_ID = str(uuid.uuid4())
DOCUMENT_ID = str(uuid.uuid4())


@pytest.mark.asyncio
async def test_create_supplementary_request(client: AsyncClient):
    """Test creating a supplementary request via API."""
    project_id = uuid.uuid4()
    payload = {
        "title": "Forstrechtliche Unterlage fehlt",
        "reason": "Bitte nachreichen.",
        "priority": "must",
        "included_in_letter": True,
        "topic_id": TOPIC_ID,
        "document_id": DOCUMENT_ID,
    }

    response = await client.post(f"/projects/{project_id}/supplementary-requests", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["title"] == payload["title"]
    assert data["reason"] == payload["reason"]
    assert data["priority"] == "must"
    assert "process_step" not in data
    assert data["included_in_letter"] is True
    assert data["source_ref"] is None
    assert data["project_id"] == str(project_id)
    assert "id" in data


@pytest.mark.asyncio
async def test_create_with_source_ref(client: AsyncClient):
    """Test creating a request with source_ref."""
    project_id = uuid.uuid4()
    payload = {
        "title": "Document missing",
        "reason": "",
        "priority": "should",
        "source_ref": {"type": "requiredDocuments", "item_id": "doc-42"},
        "topic_id": TOPIC_ID,
        "document_id": DOCUMENT_ID,
    }

    response = await client.post(f"/projects/{project_id}/supplementary-requests", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["source_ref"] == {"type": "requiredDocuments", "item_id": "doc-42"}


@pytest.mark.asyncio
async def test_create_source_ref_missing_item_id_returns_422(client: AsyncClient):
    """Test create validation when source_ref.item_id is missing."""
    project_id = uuid.uuid4()
    payload = {
        "title": "Document missing",
        "priority": "must",
        "source_ref": {"type": "requiredDocuments"},
        "topic_id": TOPIC_ID,
        "document_id": DOCUMENT_ID,
    }

    response = await client.post(f"/projects/{project_id}/supplementary-requests", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_without_source_ref(client: AsyncClient):
    """Test creating a request without source_ref results in null."""
    project_id = uuid.uuid4()
    payload = {
        "title": "Manual entry",
        "priority": "must",
        "topic_id": TOPIC_ID,
        "document_id": DOCUMENT_ID,
    }

    response = await client.post(f"/projects/{project_id}/supplementary-requests", json=payload)

    assert response.status_code == 201
    data = response.json()
    assert data["source_ref"] is None
    assert data["reason"] == ""
    assert data["included_in_letter"] is False


@pytest.mark.asyncio
async def test_create_duplicate_source_binding_returns_409(client: AsyncClient):
    """Test that duplicate source binding returns 409."""
    project_id = uuid.uuid4()
    payload = {
        "title": "First entry",
        "priority": "must",
        "source_ref": {"type": "requiredDocuments", "item_id": "doc-1"},
        "topic_id": TOPIC_ID,
        "document_id": DOCUMENT_ID,
    }

    response1 = await client.post(f"/projects/{project_id}/supplementary-requests", json=payload)
    assert response1.status_code == 201

    payload["title"] = "Duplicate entry"
    response2 = await client.post(f"/projects/{project_id}/supplementary-requests", json=payload)
    assert response2.status_code == 409


@pytest.mark.asyncio
async def test_list_supplementary_requests(client: AsyncClient, create_test_supplementary_request):
    """Test listing requests via API."""
    request = create_test_supplementary_request

    response = await client.get(f"/projects/{request.project_id}/supplementary-requests")

    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 1
    assert data[0]["id"] == str(request.id)


@pytest.mark.asyncio
async def test_list_filter_by_source_type(client: AsyncClient):
    """Test filtering list by source_type."""
    project_id = uuid.uuid4()

    await client.post(
        f"/projects/{project_id}/supplementary-requests",
        json={
            "title": "Required docs",
            "priority": "must",
            "source_ref": {"type": "requiredDocuments", "item_id": "doc-1"},
            "topic_id": TOPIC_ID,
            "document_id": DOCUMENT_ID,
        },
    )
    await client.post(
        f"/projects/{project_id}/supplementary-requests",
        json={
            "title": "Manual source",
            "priority": "must",
            "source_ref": {"type": "manual", "item_id": "manual-1"},
            "topic_id": TOPIC_ID,
            "document_id": DOCUMENT_ID,
        },
    )

    response = await client.get(
        f"/projects/{project_id}/supplementary-requests",
        params={"source_type": "requiredDocuments"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["source_ref"]["type"] == "requiredDocuments"


@pytest.mark.asyncio
async def test_list_ignores_legacy_process_step_query(client: AsyncClient):
    """Legacy process_step query input is accepted but no longer filters results."""
    project_id = uuid.uuid4()

    for title in ["First", "Second"]:
        await client.post(
            f"/projects/{project_id}/supplementary-requests",
            json={
                "title": title,
                "priority": "must",
                "process_step": "legalReview",
                "topic_id": TOPIC_ID,
                "document_id": DOCUMENT_ID,
            },
        )

    response = await client.get(
        f"/projects/{project_id}/supplementary-requests",
        params={"process_step": "legalReview"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert {item["title"] for item in data} == {"First", "Second"}
    assert all("process_step" not in item for item in data)


@pytest.mark.asyncio
async def test_list_ignores_multiple_legacy_process_step_queries(client: AsyncClient):
    """Legacy process_step query values are ignored after removal from the public API."""
    project_id = uuid.uuid4()

    for step in [
        "formalCompletenessCheck",
        "legalReview",
        "plausibilityCheck",
    ]:
        await client.post(
            f"/projects/{project_id}/supplementary-requests",
            json={
                "title": f"Request {step}",
                "priority": "must",
                "process_step": step,
                "topic_id": TOPIC_ID,
                "document_id": DOCUMENT_ID,
            },
        )

    response = await client.get(
        f"/projects/{project_id}/supplementary-requests",
        params=[
            ("process_step", "formalCompletenessCheck"),
            ("process_step", "legalReview"),
        ],
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 3
    assert all("process_step" not in item for item in data)


@pytest.mark.asyncio
async def test_list_filter_by_included_in_letter(client: AsyncClient):
    """Test filtering by included_in_letter."""
    project_id = uuid.uuid4()

    await client.post(
        f"/projects/{project_id}/supplementary-requests",
        json={
            "title": "Included",
            "priority": "must",
            "process_step": "formalCompletenessCheck",
            "included_in_letter": True,
            "topic_id": TOPIC_ID,
            "document_id": DOCUMENT_ID,
        },
    )
    await client.post(
        f"/projects/{project_id}/supplementary-requests",
        json={
            "title": "Not included",
            "priority": "must",
            "process_step": "formalCompletenessCheck",
            "included_in_letter": False,
            "topic_id": TOPIC_ID,
            "document_id": DOCUMENT_ID,
        },
    )

    response = await client.get(
        f"/projects/{project_id}/supplementary-requests",
        params={"included_in_letter": "true"},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 1
    assert data[0]["included_in_letter"] is True


@pytest.mark.asyncio
async def test_list_with_limit_offset(client: AsyncClient):
    """Test pagination with limit and offset."""
    project_id = uuid.uuid4()

    for i in range(5):
        await client.post(
            f"/projects/{project_id}/supplementary-requests",
            json={
                "title": f"Request {i}",
                "priority": "must",
                "process_step": "formalCompletenessCheck",
                "topic_id": TOPIC_ID,
                "document_id": DOCUMENT_ID,
            },
        )

    response = await client.get(
        f"/projects/{project_id}/supplementary-requests",
        params={"limit": 2, "offset": 1},
    )

    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert [item["title"] for item in data] == ["Request 1", "Request 2"]


@pytest.mark.asyncio
async def test_list_sort_created_at_desc_returns_latest_first(client: AsyncClient):
    """Test valid sort parameter orders results as expected."""
    project_id = uuid.uuid4()

    await client.post(
        f"/projects/{project_id}/supplementary-requests",
        json={
            "title": "First",
            "priority": "must",
            "process_step": "formalCompletenessCheck",
            "topic_id": TOPIC_ID,
            "document_id": DOCUMENT_ID,
        },
    )
    await client.post(
        f"/projects/{project_id}/supplementary-requests",
        json={
            "title": "Second",
            "priority": "must",
            "process_step": "formalCompletenessCheck",
            "topic_id": TOPIC_ID,
            "document_id": DOCUMENT_ID,
        },
    )

    response = await client.get(
        f"/projects/{project_id}/supplementary-requests",
        params={"sort": "created_at:desc"},
    )

    assert response.status_code == 200
    data = response.json()
    assert [item["title"] for item in data] == ["Second", "First"]


@pytest.mark.asyncio
async def test_list_invalid_sort_returns_400(client: AsyncClient):
    """Test invalid sort parameter returns 400."""
    project_id = uuid.uuid4()

    response = await client.get(
        f"/projects/{project_id}/supplementary-requests",
        params={"sort": "unknown:asc"},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_list_invalid_sort_direction_returns_400(client: AsyncClient):
    """Test invalid sort direction returns 400."""
    project_id = uuid.uuid4()

    response = await client.get(
        f"/projects/{project_id}/supplementary-requests",
        params={"sort": "created_at:invalid"},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_list_invalid_sort_missing_direction_returns_400(client: AsyncClient):
    """Test missing sort direction returns 400."""
    project_id = uuid.uuid4()

    response = await client.get(
        f"/projects/{project_id}/supplementary-requests",
        params={"sort": "created_at"},
    )

    assert response.status_code == 400


@pytest.mark.asyncio
async def test_update_supplementary_request(client: AsyncClient, create_test_supplementary_request):
    """Test updating a request via API."""
    request = create_test_supplementary_request
    payload = {
        "title": "Updated Title",
        "priority": "should",
    }

    response = await client.patch(
        f"/projects/{request.project_id}/supplementary-requests/{request.id}",
        json=payload,
    )

    assert response.status_code == 200
    data = response.json()
    assert data["title"] == "Updated Title"
    assert data["priority"] == "should"
    assert data["reason"] == request.reason  # Unchanged


@pytest.mark.asyncio
async def test_update_source_ref_missing_item_id_returns_422(client: AsyncClient, create_test_supplementary_request):
    """Test update validation when source_ref.item_id is missing."""
    request = create_test_supplementary_request
    payload = {"source_ref": {"type": "requiredDocuments"}}

    response = await client.patch(
        f"/projects/{request.project_id}/supplementary-requests/{request.id}",
        json=payload,
    )

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_update_clear_source_ref(client: AsyncClient):
    """Test updating with source_ref null clears nested source_ref in response."""
    project_id = uuid.uuid4()
    create_response = await client.post(
        f"/projects/{project_id}/supplementary-requests",
        json={
            "title": "With source",
            "priority": "must",
            "process_step": "formalCompletenessCheck",
            "source_ref": {"type": "requiredDocuments", "item_id": "doc-clear"},
            "topic_id": TOPIC_ID,
            "document_id": DOCUMENT_ID,
        },
    )
    assert create_response.status_code == 201
    request_id = create_response.json()["id"]

    response = await client.patch(
        f"/projects/{project_id}/supplementary-requests/{request_id}",
        json={"source_ref": None},
    )

    assert response.status_code == 200
    assert response.json()["source_ref"] is None


@pytest.mark.asyncio
async def test_update_duplicate_source_binding_returns_409(client: AsyncClient):
    """Test update path returns 409 for duplicate source binding."""
    project_id = uuid.uuid4()
    first = await client.post(
        f"/projects/{project_id}/supplementary-requests",
        json={
            "title": "First",
            "priority": "must",
            "process_step": "formalCompletenessCheck",
            "source_ref": {"type": "requiredDocuments", "item_id": "doc-dup"},
            "topic_id": TOPIC_ID,
            "document_id": DOCUMENT_ID,
        },
    )
    second = await client.post(
        f"/projects/{project_id}/supplementary-requests",
        json={
            "title": "Second",
            "priority": "must",
            "process_step": "formalCompletenessCheck",
            "source_ref": {"type": "manual", "item_id": "manual-dup"},
            "topic_id": TOPIC_ID,
            "document_id": DOCUMENT_ID,
        },
    )
    assert first.status_code == 201
    assert second.status_code == 201

    second_id = second.json()["id"]
    response = await client.patch(
        f"/projects/{project_id}/supplementary-requests/{second_id}",
        json={"source_ref": {"type": "requiredDocuments", "item_id": "doc-dup"}},
    )

    assert response.status_code == 409


@pytest.mark.asyncio
async def test_delete_supplementary_request(client: AsyncClient, create_test_supplementary_request):
    """Test deleting a request via API."""
    request = create_test_supplementary_request

    response = await client.delete(f"/projects/{request.project_id}/supplementary-requests/{request.id}")

    assert response.status_code == 200
    data = response.json()
    assert data["id"] == str(request.id)

    # Verify it's gone from list
    list_response = await client.get(f"/projects/{request.project_id}/supplementary-requests")
    assert list_response.status_code == 200
    assert len(list_response.json()) == 0


@pytest.mark.asyncio
async def test_create_validation_missing_required_fields(client: AsyncClient):
    """Test that missing required fields return 422."""
    project_id = uuid.uuid4()
    payload = {"title": "Only title"}

    response = await client.post(f"/projects/{project_id}/supplementary-requests", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_validation_title_too_long(client: AsyncClient):
    """Test that title exceeding max length returns 422."""
    project_id = uuid.uuid4()
    payload = {
        "title": "x" * 2001,
        "priority": "must",
        "process_step": "formalCompletenessCheck",
        "topic_id": TOPIC_ID,
        "document_id": DOCUMENT_ID,
    }

    response = await client.post(f"/projects/{project_id}/supplementary-requests", json=payload)

    assert response.status_code == 422


@pytest.mark.asyncio
async def test_create_validation_title_at_max_length(client: AsyncClient):
    """Test that title at max length is accepted."""
    project_id = uuid.uuid4()
    payload = {
        "title": "x" * 2000,
        "priority": "must",
        "process_step": "formalCompletenessCheck",
        "topic_id": TOPIC_ID,
        "document_id": DOCUMENT_ID,
    }

    response = await client.post(f"/projects/{project_id}/supplementary-requests", json=payload)

    assert response.status_code == 201


@pytest.mark.asyncio
async def test_create_validation_invalid_priority(client: AsyncClient):
    """Test that invalid priority returns 422."""
    project_id = uuid.uuid4()
    payload = {
        "title": "Test",
        "priority": "invalid",
        "process_step": "formalCompletenessCheck",
        "topic_id": TOPIC_ID,
        "document_id": DOCUMENT_ID,
    }

    response = await client.post(f"/projects/{project_id}/supplementary-requests", json=payload)

    assert response.status_code == 422
