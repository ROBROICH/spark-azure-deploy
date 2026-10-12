from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from authentification.auth import AuthClient, RelationshipItem
from authentification.enums import Permission, Relation, Resource, Subject
from authzed.api.v1 import (
    CheckBulkPermissionsPair,
    CheckBulkPermissionsRequestItem,
    CheckBulkPermissionsResponse,
    CheckBulkPermissionsResponseItem,
    CheckPermissionResponse,
    Consistency,
    LookupResourcesResponse,
    ObjectReference,
    ReadRelationshipsResponse,
    Relationship,
    RelationshipUpdate,
    SubjectReference,
    WriteRelationshipsRequest,
)


@pytest.fixture
def mock_async_client():
    client = AsyncMock()
    client.CheckPermission = AsyncMock()
    client.LookupResources = AsyncMock()
    client.WriteRelationships = AsyncMock()
    client.CheckBulkPermissions = AsyncMock()
    return client


@pytest.fixture
def auth_client(mock_async_client):
    with (
        patch("authentification.auth.AsyncClient", return_value=mock_async_client),
        patch("authentification.auth.AsyncInsecureClient", return_value=mock_async_client),
    ):
        client = AuthClient(
            endpoint="localhost:50051",
            token="test-token",
            consistency=Consistency(at_least_as_fresh={}),
            insecure=False,
        )
        yield client


@pytest.fixture
def user_subject():
    return {"subject_type": Resource.USER, "subject_id": "user_123"}


@pytest.fixture
def project_resource():
    return {"resource_type": Resource.PROJECT, "resource_id": "proj_abc123"}


@pytest.mark.asyncio
async def test_check_permission_returns_true_when_has_permission(auth_client, mock_async_client):
    mock_response = MagicMock()
    mock_response.permissionship = CheckPermissionResponse.PERMISSIONSHIP_HAS_PERMISSION
    mock_async_client.CheckPermission.return_value = mock_response

    allowed = await auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id="proj_abc123",
        permission=Permission.READ,
        subject_type=Subject.USER,
        subject_id="user_123",
    )

    assert allowed is True
    mock_async_client.CheckPermission.assert_called_once()


@pytest.mark.asyncio
async def test_check_permission_returns_false_when_no_permission(auth_client, mock_async_client):
    mock_response = MagicMock()
    mock_response.permissionship = CheckPermissionResponse.PERMISSIONSHIP_NO_PERMISSION
    mock_async_client.CheckPermission.return_value = mock_response

    allowed = await auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id="proj_def456",
        permission="update",
        subject_type=Subject.USER,
        subject_id="user_789",
    )

    assert allowed is False


@pytest.mark.asyncio
async def test_check_permission_handles_enum_and_string_uniformly(auth_client, mock_async_client):
    mock_response = MagicMock()
    mock_response.permissionship = CheckPermissionResponse.PERMISSIONSHIP_NO_PERMISSION
    mock_async_client.CheckPermission.return_value = mock_response

    # All combinations should work the same
    cases = [
        (Resource.PROJECT, Permission.READ, Resource.USER),
        ("project", "read", "user"),
        (Resource.PROJECT, "read", Resource.USER),
        ("project", Permission.READ, "user"),
    ]

    for rt, perm, st in cases:
        await auth_client.check_permission(
            resource_type=rt,
            resource_id="x",
            permission=perm,
            subject_type=st,
            subject_id="alice",
        )

    assert mock_async_client.CheckPermission.call_count == 4


@pytest.mark.asyncio
async def test_list_resources_with_permission(auth_client, mock_async_client):
    # Simulate streaming response
    fake_responses = [
        LookupResourcesResponse(
            resource_object_id="p1",
            permissionship=CheckPermissionResponse.PERMISSIONSHIP_HAS_PERMISSION,
        ),
        LookupResourcesResponse(
            resource_object_id="p7",
            permissionship=CheckPermissionResponse.PERMISSIONSHIP_HAS_PERMISSION,
        ),
        LookupResourcesResponse(
            resource_object_id="p19",
            permissionship=CheckPermissionResponse.PERMISSIONSHIP_HAS_PERMISSION,
        ),
    ]

    mock_stream = AsyncMock()
    mock_stream.__aiter__.return_value = fake_responses
    mock_async_client.LookupResources = MagicMock(return_value=mock_stream)

    resources = await auth_client.list_resources_with_permission(
        resource_type=Resource.PROJECT,
        permission=Permission.READ,
        subject_id="user_z999",
    )

    assert resources == ["p1", "p7", "p19"]


@pytest.mark.asyncio
async def test_list_resources_empty_result(auth_client, mock_async_client):
    mock_stream = AsyncMock()
    mock_stream.__aiter__.return_value = []
    mock_async_client.LookupResources = MagicMock(return_value=mock_stream)

    resources = await auth_client.list_resources_with_permission(
        resource_type=Resource.PROJECT,
        permission=Permission.READ,
        subject_id="user_z999",
    )

    assert resources == []


@pytest.mark.asyncio
async def test_create_relationship_calls_write_with_touch(auth_client, mock_async_client):
    await auth_client.create_relationship(
        resource_type=Resource.PROJECT,
        resource_id="proj_777",
        relation=Relation.OWNER,
        subject_type=Subject.USER,
        subject_id="user_kate",
    )

    mock_async_client.WriteRelationships.assert_called_once()
    call_args = mock_async_client.WriteRelationships.call_args[0][0]

    assert len(call_args.updates) == 1
    update = call_args.updates[0]
    assert update.operation == RelationshipUpdate.Operation.OPERATION_TOUCH

    rel = update.relationship
    assert rel.resource.object_type == Resource.PROJECT.value
    assert rel.resource.object_id == "proj_777"
    assert rel.relation == Relation.OWNER.value
    assert rel.subject.object.object_type == Resource.USER.value
    assert rel.subject.object.object_id == "user_kate"


@pytest.mark.asyncio
async def test_create_relationship_with_subject_relation(auth_client, mock_async_client):
    await auth_client.create_relationship(
        resource_type="organization",
        resource_id="org_42",
        relation="member",
        subject_type=Subject.GROUP,
        subject_id="team_alpha",
        subject_relation="parent",
    )

    rel = mock_async_client.WriteRelationships.call_args[0][0].updates[0].relationship
    assert rel.subject.optional_relation == "parent"


@pytest.mark.asyncio
async def test_check_bulk_permissions(auth_client, mock_async_client):
    checks = [
        {
            "resource_type": Resource.PROJECT,
            "resource_id": "p1",
            "permission": Permission.READ,
        },
        {
            "resource_type": Resource.PROJECT,
            "resource_id": "p2",
            "permission": Permission.UPDATE,
        },
        {
            "resource_type": "file",
            "resource_id": "doc99",
            "permission": Permission.DELETE,
        },
    ]

    mock_items = []
    for check in checks:
        item = CheckBulkPermissionsPair(
            request=CheckBulkPermissionsRequestItem(
                resource=ObjectReference(
                    object_type=check["resource_type"],
                    object_id=check["resource_id"],
                ),
                permission=check["permission"],
                subject=SubjectReference(
                    object=ObjectReference(
                        object_type=Resource.USER,
                        object_id="user_101",
                    )
                ),
            ),
            item=CheckBulkPermissionsResponseItem(permissionship=CheckPermissionResponse.PERMISSIONSHIP_HAS_PERMISSION),
        )
        mock_items.append(item)

    mock_response = CheckBulkPermissionsResponse(pairs=mock_items)
    mock_async_client.CheckBulkPermissions.return_value = mock_response

    result = await auth_client.bulk_check_permissions(
        subject_type=Subject.USER,
        subject_id="user_101",
        checks=checks,
    )

    assert result == {
        ("file", "doc99", Permission.DELETE.value): True,
        ("project", "p1", Permission.READ.value): True,
        ("project", "p2", Permission.UPDATE.value): True,
    }


@pytest.mark.asyncio
async def test_delete_relationship_calls_write_with_delete_operation(
    auth_client: AuthClient,
    mock_async_client: AsyncMock,
):
    """Basic happy path: correct delete update is sent"""
    await auth_client.delete_relationship(
        resource_type=Resource.PROJECT,
        resource_id="proj_abc-1234",
        relation=Relation.OWNER,
        subject_type=Subject.USER,
        subject_id="user_alice_42",
        subject_relation=None,
    )

    mock_async_client.WriteRelationships.assert_called_once()
    request: WriteRelationshipsRequest = mock_async_client.WriteRelationships.call_args[0][0]

    assert len(request.updates) == 1
    update = request.updates[0]

    assert update.operation == RelationshipUpdate.OPERATION_DELETE

    rel: Relationship = update.relationship
    assert rel.resource.object_type == "project"
    assert rel.resource.object_id == "proj_abc-1234"
    assert rel.relation == "owner"
    assert rel.subject.object.object_type == "user"
    assert rel.subject.object.object_id == "user_alice_42"
    assert rel.subject.optional_relation == ""


@pytest.mark.asyncio
async def test_bulk_write_relationships(auth_client: AuthClient, mock_async_client: AsyncMock):
    """Test that bulk_write_relationships sends a single WriteRelationshipsRequest
    with multiple TOUCH updates."""
    items: list[RelationshipItem] = [
        RelationshipItem(
            resource_type=Resource.PROJECT,
            resource_id="proj_100",
            relation=Relation.OWNER,
            subject_type=Subject.USER,
            subject_id="alice",
        ),
        RelationshipItem(
            resource_type=Resource.PROJECT,
            resource_id="proj_200",
            relation="viewer",
            subject_type=Subject.USER,
            subject_id="bob",
        ),
        RelationshipItem(
            resource_type="file",
            resource_id="doc_999",
            relation="editor",
            subject_type=Subject.USER,
            subject_id="charlie",
            subject_relation=None,
        ),
    ]

    await auth_client.bulk_write_relationships(items=items)

    # Verify WriteRelationships was called exactly once (even with multiple items)
    mock_async_client.WriteRelationships.assert_called_once()

    request: WriteRelationshipsRequest = mock_async_client.WriteRelationships.call_args[0][0]

    assert isinstance(request, WriteRelationshipsRequest)
    assert len(request.updates) == 3  # one for each item

    # Check first update
    update1 = request.updates[0]
    assert update1.operation == RelationshipUpdate.Operation.OPERATION_TOUCH
    assert update1.relationship.resource.object_type == "project"
    assert update1.relationship.resource.object_id == "proj_100"
    assert update1.relationship.relation == "owner"
    assert update1.relationship.subject.object.object_id == "alice"

    # Check third update has subject_relation = ""
    update3 = request.updates[2]
    assert update3.relationship.subject.optional_relation == ""


@pytest.mark.asyncio
async def test_bulk_delete_relationships(auth_client: AuthClient, mock_async_client: AsyncMock):
    """Test that bulk_delete_relationships sends a single WriteRelationshipsRequest
    with multiple DELETE updates."""
    items: list[RelationshipItem] = [
        RelationshipItem(
            resource_type=Resource.PROJECT,
            resource_id="proj_100",
            relation=Relation.OWNER,
            subject_type=Subject.USER,
            subject_id="alice",
        ),
        RelationshipItem(
            resource_type=Resource.GROUP,
            resource_id="admins",
            relation=Relation.MEMBER,
            subject_type=Subject.USER,
            subject_id="bob",
            subject_relation=None,
        ),
    ]

    await auth_client.bulk_delete_relationships(items=items)

    mock_async_client.WriteRelationships.assert_called_once()

    request: WriteRelationshipsRequest = mock_async_client.WriteRelationships.call_args[0][0]

    assert len(request.updates) == 2

    # All updates should use DELETE operation
    for update in request.updates:
        assert update.operation == RelationshipUpdate.Operation.OPERATION_DELETE

    # Verify content of first update
    rel1 = request.updates[0].relationship
    assert rel1.resource.object_type == "project"
    assert rel1.resource.object_id == "proj_100"
    assert rel1.relation == "owner"
    assert rel1.subject.object.object_id == "alice"


@pytest.mark.asyncio
async def test_bulk_update_relationships_sends_mixed_operations(auth_client: AuthClient, mock_async_client: AsyncMock):
    touch_items = [
        RelationshipItem(
            resource_type=Resource.PROJECT,
            resource_id="proj_100",
            relation=Relation.OWNER,
            subject_type=Subject.USER,
            subject_id="alice",
        ),
    ]
    delete_items = [
        RelationshipItem(
            resource_type=Resource.PROJECT,
            resource_id="proj_100",
            relation=Relation.MEMBER,
            subject_type=Subject.USER,
            subject_id="bob",
        ),
    ]

    await auth_client.bulk_update_relationships(
        touch_items=touch_items,
        delete_items=delete_items,
    )

    mock_async_client.WriteRelationships.assert_called_once()
    request: WriteRelationshipsRequest = mock_async_client.WriteRelationships.call_args[0][0]

    assert len(request.updates) == 2
    assert request.updates[0].operation == RelationshipUpdate.Operation.OPERATION_DELETE
    assert request.updates[0].relationship.relation == "member"
    assert request.updates[0].relationship.subject.object.object_id == "bob"
    assert request.updates[1].operation == RelationshipUpdate.Operation.OPERATION_TOUCH
    assert request.updates[1].relationship.relation == "owner"
    assert request.updates[1].relationship.subject.object.object_id == "alice"


@pytest.mark.asyncio
async def test_list_resource_relations_bulk(auth_client, mock_async_client):
    def make_rel(resource_id, relation, subject_id, subject_type=Subject.USER):
        return ReadRelationshipsResponse(
            relationship=Relationship(
                resource=ObjectReference(
                    object_type=Resource.PROJECT,
                    object_id=resource_id,
                ),
                relation=relation,
                subject=SubjectReference(
                    object=ObjectReference(
                        object_type=subject_type,
                        object_id=subject_id,
                    )
                ),
            )
        )

    fake_stream = AsyncMock()
    fake_stream.__aiter__.return_value = [
        make_rel("p1", Relation.OWNER, "u1"),
        make_rel("p1", Relation.MEMBER, "u2"),
        make_rel("p2", Relation.OWNER, "u3"),
        make_rel("p2", Relation.MEMBER, "g1", subject_type=Subject.GROUP),
    ]

    mock_async_client.ReadRelationships = MagicMock(return_value=fake_stream)

    result = await auth_client.list_resource_relations_bulk(
        resource_type=Resource.PROJECT,
        resource_ids=["p1", "p2"],
        relations=[Relation.OWNER, Relation.MEMBER],
        subject_type=Subject.USER,
    )

    assert result == {
        "p1": {
            "owner": ["u1"],
            "member": ["u2"],
        },
        "p2": {
            "owner": ["u3"],
            "member": [],
        },
    }

    # called once per relation
    assert mock_async_client.ReadRelationships.call_count == 2


@pytest.mark.asyncio
async def test_list_resource_relations_bulk_fast_empty(auth_client, mock_async_client):
    result = await auth_client.list_resource_relations_bulk(
        resource_type=Resource.PROJECT,
        resource_ids=[],
        relations=[Relation.OWNER],
        subject_type=Subject.USER,
    )

    assert result == {}
    mock_async_client.ReadRelationships.assert_not_called()


# Optional: Extra test for empty list behavior
@pytest.mark.asyncio
async def test_bulk_write_empty_list_does_nothing(auth_client: AuthClient, mock_async_client: AsyncMock):
    """Passing an empty list should not call the gRPC method."""
    await auth_client.bulk_write_relationships(items=[])

    mock_async_client.WriteRelationships.assert_not_called()


@pytest.mark.asyncio
async def test_bulk_delete_empty_list_does_nothing(auth_client: AuthClient, mock_async_client: AsyncMock):
    """Passing an empty list should not call the gRPC method."""
    await auth_client.bulk_delete_relationships(items=[])

    mock_async_client.WriteRelationships.assert_not_called()


def test_auth_client_init_insecure_mode():
    with patch("authentification.auth.AsyncInsecureClient") as mock_insecure:
        AuthClient("localhost:50051", "token123", insecure=True)
        mock_insecure.assert_called_once()


def test_auth_client_init_secure_mode():
    with patch("authentification.auth.AsyncClient") as mock_async:
        AuthClient("localhost:50051", "token123", insecure=False)
        mock_async.assert_called_once()
