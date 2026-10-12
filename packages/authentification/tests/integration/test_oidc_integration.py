import pytest
from authentification.oidc import KeycloakClient
from conftest import TEST_OIDC_USER


@pytest.mark.integration
async def test_keycloak_client_list_users_functionality(
    integration_oidc_client: KeycloakClient,
):
    """Comprehensive test for Keycloak user listing capabilities."""

    # Basic list
    users = await integration_oidc_client.list_users(max_results=20)
    assert len(users) > 0
    assert any(u.name == TEST_OIDC_USER for u in users)

    # Search
    searched = await integration_oidc_client.list_users(search=TEST_OIDC_USER)
    assert len(searched) >= 1 and searched[0].name == TEST_OIDC_USER

    # All users via pagination
    all_users = await integration_oidc_client.list_all_users()
    assert len(all_users) >= len(users)
    assert TEST_OIDC_USER in [u.name for u in all_users]
