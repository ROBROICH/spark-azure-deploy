from unittest.mock import AsyncMock, patch

import pytest
from authentification.dependencies import get_auth_client
from authentification.enums import Relation, Resource, Subject
from fastapi import status


@pytest.fixture
def mock_auth_client(authenticated_client, app):
    mock = AsyncMock()
    app.dependency_overrides[get_auth_client] = lambda: mock
    yield mock
    app.dependency_overrides.clear()


def assignment_pairs(items):
    return {(item.relation, item.subject_id) for item in items}


async def test_replace_project_assignments_applies_snapshot_diff(authenticated_client, mock_auth_client):
    mock_auth_client.list_resource_relations_bulk.return_value = {
        "project-1": {
            "owner": ["existing-owner", "stale-owner"],
            "member": ["existing-member", "stale-member"],
        }
    }

    response = await authenticated_client.post(
        "/assign/projects/project-1/assignments",
        json={
            "assignments": [
                {"role": "owner", "user_id": "existing-owner"},
                {"role": "owner", "user_id": "new-owner"},
                {"role": "member", "user_id": "existing-member"},
                {"role": "member", "user_id": "new-member"},
            ]
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"success": True}

    mock_auth_client.list_resource_relations_bulk.assert_awaited_once_with(
        resource_type=Resource.PROJECT,
        resource_ids=["project-1"],
        relations=[Relation.OWNER, Relation.MEMBER],
        subject_type=Subject.USER,
    )
    mock_auth_client.bulk_update_relationships.assert_awaited_once()

    kwargs = mock_auth_client.bulk_update_relationships.await_args.kwargs
    assert assignment_pairs(kwargs["touch_items"]) == {
        (Relation.OWNER, "existing-owner"),
        (Relation.OWNER, "new-owner"),
        (Relation.MEMBER, "existing-member"),
        (Relation.MEMBER, "new-member"),
    }
    assert assignment_pairs(kwargs["delete_items"]) == {
        (Relation.OWNER, "stale-owner"),
        (Relation.MEMBER, "stale-member"),
    }


async def test_replace_project_assignments_logs_only_actual_additions(
    authenticated_client,
    mock_auth_client,
):
    mock_auth_client.list_resource_relations_bulk.return_value = {
        "project-1": {
            "owner": ["existing-owner"],
            "member": ["existing-member"],
        }
    }

    with patch("src.api.routes.assignment.logger") as log:
        response = await authenticated_client.post(
            "/assign/projects/project-1/assignments",
            json={
                "assignments": [
                    {"role": "owner", "user_id": "existing-owner"},
                    {"role": "owner", "user_id": "new-owner"},
                    {"role": "member", "user_id": "existing-member"},
                    {"role": "member", "user_id": "new-member"},
                ]
            },
        )

    assert response.status_code == status.HTTP_200_OK

    message = log.info.call_args.kwargs["message"]
    added_message = message.split("Added: ", 1)[1].split(". Deleted:", 1)[0]
    assert "new-owner" in added_message
    assert "new-member" in added_message
    assert "existing-owner" not in added_message
    assert "existing-member" not in added_message


async def test_replace_project_assignments_rejects_empty_list(
    authenticated_client,
    mock_auth_client,
):
    response = await authenticated_client.post(
        "/assign/projects/project-1/assignments",
        json={"assignments": []},
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["detail"] == "At least one project owner is required."
    mock_auth_client.list_resource_relations_bulk.assert_not_awaited()
    mock_auth_client.bulk_update_relationships.assert_not_awaited()


async def test_replace_project_assignments_rejects_member_only_snapshot(
    authenticated_client,
    mock_auth_client,
):
    response = await authenticated_client.post(
        "/assign/projects/project-1/assignments",
        json={"assignments": [{"role": "member", "user_id": "member-1"}]},
    )

    assert response.status_code == status.HTTP_400_BAD_REQUEST
    assert response.json()["detail"] == "At least one project owner is required."
    mock_auth_client.list_resource_relations_bulk.assert_not_awaited()
    mock_auth_client.bulk_update_relationships.assert_not_awaited()


async def test_replace_project_assignments_deduplicates_request_pairs(authenticated_client, mock_auth_client):
    mock_auth_client.list_resource_relations_bulk.return_value = {
        "project-1": {
            "owner": [],
            "member": [],
        }
    }

    response = await authenticated_client.post(
        "/assign/projects/project-1/assignments",
        json={
            "assignments": [
                {"role": "owner", "user_id": "owner-1"},
                {"role": "owner", "user_id": "owner-1"},
                {"role": "member", "user_id": "member-1"},
                {"role": "member", "user_id": "member-1"},
            ]
        },
    )

    assert response.status_code == status.HTTP_200_OK

    kwargs = mock_auth_client.bulk_update_relationships.await_args.kwargs
    assert assignment_pairs(kwargs["touch_items"]) == {
        (Relation.OWNER, "owner-1"),
        (Relation.MEMBER, "member-1"),
    }
    assert kwargs["delete_items"] == []


async def test_replace_project_assignments_accepts_camel_case_user_id(authenticated_client, mock_auth_client):
    mock_auth_client.list_resource_relations_bulk.return_value = {
        "project-1": {
            "owner": [],
            "member": [],
        }
    }

    response = await authenticated_client.post(
        "/assign/projects/project-1/assignments",
        json={"assignments": [{"role": "owner", "userId": "owner-1"}]},
    )

    assert response.status_code == status.HTTP_200_OK

    kwargs = mock_auth_client.bulk_update_relationships.await_args.kwargs
    assert assignment_pairs(kwargs["touch_items"]) == {
        (Relation.OWNER, "owner-1"),
    }


@pytest.mark.parametrize(
    ("method", "path"),
    [
        ("POST", "/assign/projects/project-1/owner/user-1"),
        ("POST", "/assign/projects/project-1/member/user-1"),
        ("DELETE", "/assign/projects/project-1/owner/user-1"),
        ("DELETE", "/assign/projects/project-1/member/user-1"),
    ],
)
async def test_path_user_assignment_routes_are_removed(authenticated_client, method, path):
    response = await authenticated_client.request(method, path)

    assert response.status_code == status.HTTP_404_NOT_FOUND
