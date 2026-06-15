"""Integration tests for comment API endpoints."""

from uuid import uuid4

from fastapi import status
from fastapi.testclient import TestClient

from tests.conftest import _FakeComment


def test_get_comments_returns_empty_list(client: TestClient) -> None:
    response = client.get(f"/projects/{uuid4()}/comments")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == []


def test_get_comments_with_inconsistent_source_ref_returns_null(
    client_with_inconsistent_source_comment: tuple[TestClient, _FakeComment],
) -> None:
    test_client, comment = client_with_inconsistent_source_comment
    response = test_client.get(f"/projects/{comment.project_id}/comments")

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert len(body) == 1
    assert body[0]["id"] == str(comment.id)
    assert body[0]["source_ref"] is None


def test_create_comment_returns_201(client: TestClient) -> None:
    project_id = uuid4()
    payload = {"title": "Test", "content": "Body", "process_step": "unsorted"}

    response = client.post(f"/projects/{project_id}/comments", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    body = response.json()
    assert body["title"] == "Test"
    assert body["content"] == "Body"
    assert body["process_step"] == "unsorted"
    assert body["project_id"] == str(project_id)
    assert body["source_ref"] is None


def test_create_comment_with_source_ref_returns_201(client: TestClient) -> None:
    project_id = uuid4()
    payload = {
        "title": "Forst",
        "content": "Bitte Fachabteilung einbinden.",
        "process_step": "formalCompletenessCheck",
        "source_ref": {"type": "manual"},
    }

    response = client.post(f"/projects/{project_id}/comments", json=payload)

    assert response.status_code == status.HTTP_201_CREATED
    body = response.json()
    assert body["source_ref"]["type"] == "manual"
    assert body["source_ref"]["item_id"] is None


def test_create_comment_with_invalid_process_step_returns_422(client: TestClient) -> None:
    project_id = uuid4()
    payload = {"title": "Test", "content": "Body", "process_step": "step1"}

    response = client.post(f"/projects/{project_id}/comments", json=payload)

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_CONTENT


def test_update_nonexistent_comment_returns_404(client: TestClient) -> None:
    response = client.patch(
        f"/projects/{uuid4()}/comments/{uuid4()}",
        json={"title": "new title"},
    )
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "detail" in response.json()


def test_update_comment_returns_200(client_with_comment: tuple[TestClient, _FakeComment]) -> None:
    test_client, comment = client_with_comment
    response = test_client.patch(
        f"/projects/{comment.project_id}/comments/{comment.id}",
        json={"title": "Updated title"},
    )
    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["id"] == str(comment.id)
    assert body["project_id"] == str(comment.project_id)


def test_delete_nonexistent_comment_returns_404(client: TestClient) -> None:
    response = client.delete(f"/projects/{uuid4()}/comments/{uuid4()}")
    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert "detail" in response.json()


def test_delete_comment_returns_204(client_with_comment: tuple[TestClient, _FakeComment]) -> None:
    test_client, comment = client_with_comment
    response = test_client.delete(f"/projects/{comment.project_id}/comments/{comment.id}")
    assert response.status_code == status.HTTP_204_NO_CONTENT
    assert response.content == b""
