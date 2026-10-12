import uuid

import pytest
from conftest import TEST_OIDC_CLIENT, TEST_OIDC_USER


@pytest.mark.integration
def test_get_user_info(
    integration_verifier,
    oidc_test_user_token,
):
    """Test for validating Keycloak user info and token."""
    user_info = integration_verifier.resolve_user(oidc_test_user_token).user
    assert user_info.preferred_username == TEST_OIDC_USER
    assert user_info.azp == TEST_OIDC_CLIENT
    user_id = uuid.UUID(user_info.sub)
    assert isinstance(user_id, uuid.UUID)
