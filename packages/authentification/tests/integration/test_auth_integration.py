import uuid

import pytest
from authentification.auth import AuthClient, RelationshipItem
from authentification.enums import Permission, Relation, Resource, Subject

SPICEDB_ADMIN_GROUP = "admins"
SPICEDB_ALICE = "alice"
SPICEDB_BOB = "bob"
SPICEDB_MANTIS = "mantis"


@pytest.fixture(autouse=True)
async def write_spicedb_migrations(integration_auth_client: AuthClient) -> None:
    file_path = """
    // Users
    definition user {}

    // Groups
    definition group {
        relation member: user | group#member
    }

    // Projects
    definition project {
      relation owner: user | group#member
      relation editor: user | group#member
      relation viewer: user | group#member

      permission read    = viewer + editor + owner
      permission create  = editor + owner
      permission update  = editor + owner
      permission execute = editor + owner
      permission delete  = owner
      permission assign = owner
    }
    """
    await integration_auth_client.write_schema(file_path)


@pytest.fixture
async def create_relations(integration_auth_client: AuthClient):
    """Creates relations from test users and a project."""
    project_id = str(uuid.uuid4())
    # Assign single user alice to project as owner
    await integration_auth_client.create_relationship(
        resource_type=Resource.PROJECT,
        resource_id=project_id,
        relation=Relation.OWNER,
        subject_type=Subject.USER,
        subject_id=SPICEDB_ALICE,
    )

    # Assign single user mantis to project as viewer
    await integration_auth_client.create_relationship(
        resource_type=Resource.PROJECT,
        resource_id=project_id,
        relation="viewer",
        subject_type=Subject.USER,
        subject_id=SPICEDB_MANTIS,
    )

    # Assign bob to admin group
    await integration_auth_client.create_relationship(
        resource_type=Resource.GROUP,
        resource_id=SPICEDB_ADMIN_GROUP,
        relation=Relation.MEMBER,
        subject_type=Subject.USER,
        subject_id=SPICEDB_BOB,
    )

    # Assign project to admin group
    await integration_auth_client.create_relationship(
        resource_type=Resource.PROJECT,
        resource_id=project_id,
        relation=Relation.OWNER,
        subject_type=Subject.GROUP,
        subject_id=SPICEDB_ADMIN_GROUP,
        subject_relation=Relation.MEMBER,
    )
    yield project_id


@pytest.mark.asyncio
@pytest.mark.integration
async def test_check_permission_alice(
    integration_auth_client,
    create_relations,
):
    """Test relations for alice"""

    # Test alice has read as owner
    assert await integration_auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id=create_relations,
        permission=Permission.READ,
        subject_type=Subject.USER,
        subject_id=SPICEDB_ALICE,
    )

    # Test alice has create as owner
    assert await integration_auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id=create_relations,
        permission=Permission.CREATE,
        subject_type=Subject.USER,
        subject_id=SPICEDB_ALICE,
    )

    # Test alice has update as owner
    assert await integration_auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id=create_relations,
        permission=Permission.UPDATE,
        subject_type=Subject.USER,
        subject_id=SPICEDB_ALICE,
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_check_permission_mantis(
    integration_auth_client,
    create_relations,
):
    """Test relations for mantis"""
    # Test mantis has read as viewer
    assert await integration_auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id=create_relations,
        permission=Permission.READ,
        subject_type=Subject.USER,
        subject_id=SPICEDB_MANTIS,
    )

    # Test mantis has create not as viewer
    assert (
        await integration_auth_client.check_permission(
            resource_type=Resource.PROJECT,
            resource_id=create_relations,
            permission=Permission.CREATE,
            subject_type=Subject.USER,
            subject_id=SPICEDB_MANTIS,
        )
        is False
    )

    # Test mantis has update not as viewer
    assert (
        await integration_auth_client.check_permission(
            resource_type=Resource.PROJECT,
            resource_id=create_relations,
            permission=Permission.UPDATE,
            subject_type=Subject.USER,
            subject_id=SPICEDB_MANTIS,
        )
        is False
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_check_permission_bob(
    integration_auth_client,
    create_relations,
):
    """Test relations for bob via admin group"""
    # Test bob has read member of group#admins
    assert await integration_auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id=create_relations,
        permission=Permission.READ,
        subject_type=Subject.USER,
        subject_id=SPICEDB_BOB,
    )

    # Test bob has create member of group#admins
    assert await integration_auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id=create_relations,
        permission=Permission.CREATE,
        subject_type=Subject.USER,
        subject_id=SPICEDB_BOB,
    )

    # Test bob has update member of group#admins
    assert await integration_auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id=create_relations,
        permission=Permission.UPDATE,
        subject_type=Subject.USER,
        subject_id=SPICEDB_BOB,
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_relation_ship(
    integration_auth_client,
    create_relations,
):
    """Test deletion of relationships."""
    assert await integration_auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id=create_relations,
        permission=Permission.DELETE,
        subject_type=Subject.USER,
        subject_id=SPICEDB_ALICE,
    )

    await integration_auth_client.delete_relationship(
        resource_type=Resource.PROJECT,
        resource_id=create_relations,
        relation=Relation.OWNER,
        subject_type=Subject.USER,
        subject_id=SPICEDB_ALICE,
    )

    assert (
        await integration_auth_client.check_permission(
            resource_type=Resource.PROJECT,
            resource_id=create_relations,
            permission=Permission.DELETE,
            subject_type=Subject.USER,
            subject_id=SPICEDB_ALICE,
        )
        is False
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_resources_with_permission(
    integration_auth_client,
    create_relations,
):
    """Test listing of resources with permission."""
    resource_list = await integration_auth_client.list_resources_with_permission(
        resource_type=Resource.PROJECT,
        permission=Permission.READ,
        subject_type=Subject.USER,
        subject_id=SPICEDB_ALICE,
    )
    assert create_relations in resource_list


@pytest.mark.asyncio
@pytest.mark.integration
async def test_check_bulk_permissions(
    integration_auth_client,
    create_relations,
):
    """Test bulk checking of permissions."""
    resource_list = await integration_auth_client.bulk_check_permissions(
        checks=[
            {
                "resource_type": Resource.PROJECT,
                "resource_id": create_relations,
                "permission": Permission.READ,
            },
            {
                "resource_type": Resource.PROJECT,
                "resource_id": create_relations,
                "permission": Permission.UPDATE,
            },
        ],
        subject_type=Subject.USER,
        subject_id=SPICEDB_MANTIS,
    )

    expected = {
        ("project", create_relations, Permission.READ.value): True,
        ("project", create_relations, Permission.UPDATE.value): False,
    }

    assert resource_list == expected


@pytest.mark.asyncio
@pytest.mark.integration
async def test_check_bulk_permissions_error(
    integration_auth_client,
    create_relations,
):
    """Test bulk checking of permissions with errors."""
    resource_list = await integration_auth_client.bulk_check_permissions(
        checks=[
            {
                "resource_type": "not_existent_resource",
                "resource_id": "not_existing_id",
                "permission": Permission.READ,
            },
            {
                "resource_type": Resource.PROJECT,
                "resource_id": create_relations,
                "permission": Permission.UPDATE,
            },
        ],
        subject_type=Subject.USER,
        subject_id=SPICEDB_MANTIS,
    )

    expected = {
        ("not_existent_resource", "not_existing_id", Permission.READ.value): False,
        ("project", create_relations, Permission.UPDATE.value): False,
    }

    assert resource_list == expected


@pytest.mark.asyncio
@pytest.mark.integration
async def test_bulk_write_then_bulk_delete(
    integration_auth_client: AuthClient,
):
    """Test bulk write followed by bulk delete in sequence."""
    project_id = str(uuid.uuid4())

    write_items = [
        RelationshipItem(
            resource_type=Resource.PROJECT,
            resource_id=project_id,
            relation="viewer",
            subject_type=Subject.USER,
            subject_id=SPICEDB_ALICE,
        ),
        RelationshipItem(
            resource_type=Resource.PROJECT,
            resource_id=project_id,
            relation="viewer",
            subject_type=Subject.USER,
            subject_id=SPICEDB_MANTIS,
        ),
    ]

    await integration_auth_client.bulk_write_relationships(items=write_items)

    # Both should now have READ permission
    for user in (SPICEDB_ALICE, SPICEDB_MANTIS):
        assert await integration_auth_client.check_permission(
            resource_type=Resource.PROJECT,
            resource_id=project_id,
            permission=Permission.READ,
            subject_type=Subject.USER,
            subject_id=user,
        )

    # Now bulk delete both
    await integration_auth_client.bulk_delete_relationships(items=write_items)

    # Both should lose the permission
    for user in (SPICEDB_ALICE, SPICEDB_MANTIS):
        assert (
            await integration_auth_client.check_permission(
                resource_type=Resource.PROJECT,
                resource_id=project_id,
                permission=Permission.READ,
                subject_type=Subject.USER,
                subject_id=user,
            )
            is False
        )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_resource_relations_bulk_real_spicedb(
    integration_auth_client: AuthClient,
):
    """
    Integration test for list_resource_relations_bulk.
    """

    project_id = str(uuid.uuid4())

    await integration_auth_client.create_relationship(
        resource_type=Resource.PROJECT,
        resource_id=project_id,
        relation="viewer",
        subject_type=Subject.USER,
        subject_id="u1",
    )

    await integration_auth_client.create_relationship(
        resource_type=Resource.PROJECT,
        resource_id=project_id,
        relation="editor",
        subject_type=Subject.USER,
        subject_id="u2",
    )

    await integration_auth_client.create_relationship(
        resource_type=Resource.PROJECT,
        resource_id=project_id,
        relation="editor",
        subject_type=Subject.GROUP,
        subject_id="g1",
        subject_relation="member",
    )

    result = await integration_auth_client.list_resource_relations_bulk(
        resource_type=Resource.PROJECT,
        resource_ids=[project_id],
        relations=["editor", "viewer"],
        subject_type=Subject.USER,
    )

    assert result == {
        project_id: {
            "editor": ["u2"],
            "viewer": ["u1"],
        }
    }
