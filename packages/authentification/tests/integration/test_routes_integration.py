from uuid import UUID, uuid4

import pytest
from asgi_lifespan import LifespanManager
from authentification.dependencies import (
    require_permissions,
)
from authentification.enums import Permission, Relation, Resource, Subject
from authentification.models import OidcUserInfo
from authentification.resolver import path_param
from fastapi import Depends, FastAPI
from httpx import ASGITransport, AsyncClient


@pytest.fixture
async def client():
    """FastAPI test client using AsyncClient."""
    app = FastAPI(title="Test Project Service")

    @app.get("/projects/{project_id}")
    async def single(
        project_id: UUID,
        _: OidcUserInfo = Depends(require_permissions((Resource.PROJECT, Permission.READ, path_param("project_id")))),
    ):
        """Dummy route to test auth mechanism."""
        return {"status": "ok", "project_id": str(project_id)}

    async with (
        LifespanManager(app),
        AsyncClient(
            transport=ASGITransport(app=app),
            base_url="http://test",
        ) as client,
    ):
        yield client


@pytest.fixture
async def create_relation_from_sub(integration_auth_client, integration_verifier, oidc_test_user_token):
    """Creates an owner relation on a project from a valid Keycloak sub."""
    project_id = str(uuid4())
    user_info = integration_verifier.resolve_user(oidc_test_user_token).user
    await integration_auth_client.create_relationship(
        resource_type=Resource.PROJECT,
        resource_id=project_id,
        relation=Relation.OWNER,
        subject_type=Subject.USER,
        subject_id=user_info.sub,
    )
    yield project_id


@pytest.mark.asyncio
@pytest.mark.integration
async def test_single_allowed(
    client,
    oidc_test_user_token,
    create_relation_from_sub,
    integration_auth_client,
):
    """Test allowed access using real Keycloak token and SpiceDB relation."""
    headers = {"Authorization": f"Bearer {oidc_test_user_token}"}
    # Make the request
    response = await client.get(f"/projects/{create_relation_from_sub}", headers=headers)

    assert response.status_code == 200
