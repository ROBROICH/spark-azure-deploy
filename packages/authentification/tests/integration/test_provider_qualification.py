from uuid import UUID

import pytest
from authentification.auth import AuthClient
from authentification.enums import OidcRoles, Permission, Relation, Resource, Subject
from authentification.verifier import KeycloakVerifier
from conftest import TEST_OIDC_USER

QUALIFIED_PROJECT_ID = "auth-test-qualified-project"
DENIED_SUBJECT_ID = "00000000-0000-0000-0000-000000000099"
QUALIFICATION_SCHEMA = """
definition user {}

definition project {
  relation owner: user
  permission read = owner
}
"""


@pytest.mark.integration
@pytest.mark.asyncio
async def test_real_oidc_and_spicedb_provider_qualification(
    integration_verifier: KeycloakVerifier,
    oidc_test_user_token: str,
    integration_auth_client: AuthClient,
) -> None:
    resolution = integration_verifier.resolve_user(oidc_test_user_token)

    assert resolution.status == "verified"
    assert resolution.user is not None
    assert UUID(resolution.user.sub)
    assert resolution.user.preferred_username == TEST_OIDC_USER
    assert resolution.user.role == OidcRoles.USER

    await integration_auth_client.write_schema(QUALIFICATION_SCHEMA)
    await integration_auth_client.create_relationship(
        resource_type=Resource.PROJECT,
        resource_id=QUALIFIED_PROJECT_ID,
        relation=Relation.OWNER,
        subject_type=Subject.USER,
        subject_id=resolution.user.sub,
    )

    assert await integration_auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id=QUALIFIED_PROJECT_ID,
        permission=Permission.READ,
        subject_type=Subject.USER,
        subject_id=resolution.user.sub,
    )
    assert not await integration_auth_client.check_permission(
        resource_type=Resource.PROJECT,
        resource_id=QUALIFIED_PROJECT_ID,
        permission=Permission.READ,
        subject_type=Subject.USER,
        subject_id=DENIED_SUBJECT_ID,
    )
    assert await integration_auth_client.list_resources_with_permission(
        resource_type=Resource.PROJECT,
        permission=Permission.READ,
        subject_type=Subject.USER,
        subject_id=resolution.user.sub,
    ) == [QUALIFIED_PROJECT_ID]
