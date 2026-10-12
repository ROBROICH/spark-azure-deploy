"""api endpoint tests"""

from httpx import AsyncClient
from pytest import LogCaptureFixture, mark

from authentification.dependencies import get_current_user, get_verifier
from authentification.enums import AuthMode, OidcRoles
from authentification.models import OidcUserInfo
from fastapi import FastAPI
from rechtsaenderungsmonitoring.service import app as ram_app


async def test_get_all_pending_success(api_client: AsyncClient) -> None:
    """should return 200 when changes found"""
    response = await api_client.get("/pending-updates")
    assert response.status_code == 200


async def test_get_pending_none(api_client: AsyncClient) -> None:
    """should return 404 when no changes found"""
    response = await api_client.get("/pending-updates?jurabk=ZZZV")
    assert response.status_code == 404


async def test_get_pending_success(api_client: AsyncClient) -> None:
    """basic smoke test"""
    response = await api_client.get("/pending-updates?jurabk=UTAV")
    assert response.status_code == 200
    assert "affected_norms" in response.json()[0].keys()
    assert response.json()[0]["affected_norms"][0] == "7"


async def test_get_pending_success_detail(api_client: AsyncClient, caplog: LogCaptureFixture) -> None:
    """basic smoke test"""
    caplog.set_level("DEBUG")
    response = await api_client.get("/pending-updates?jurabk=UTAV&detail=true")
    assert response.status_code == 200
    assert "affected_norms" in response.json()[0].keys()
    assert response.json()[0]["affected_norms"][0]["paragraph_nr"] == "7"
    assert (
        "§ 7 Absatz 1 Satz 1 wird wie folgt geändert"
        in response.json()[0]["affected_norms"][0]["change_text"]
    )


class _StrictVerifier:
    auth_mode = AuthMode.STRICT

    @property
    def requires_user(self) -> bool:
        return True


def _override_identity(role: str) -> None:
    ram_app.dependency_overrides[get_current_user] = lambda: OidcUserInfo(
        sub="00000000-0000-4000-8000-000000000001",
        realm_roles=[role],
    )
    ram_app.dependency_overrides[get_verifier] = lambda: _StrictVerifier()


@mark.parametrize("role", [OidcRoles.USER, OidcRoles.ADMIN, OidcRoles.SERVICE])
async def test_pending_updates_detail_allows_user_admin_service(
    fastapi_app: FastAPI,
    api_client: AsyncClient,
    role: str,
) -> None:
    _override_identity(role)
    response = await api_client.get("/pending-updates?detail=true")
    assert response.status_code == 200
    assert response.json()[0]["affected_norms"][0]["paragraph_nr"] == "7"


async def test_pending_updates_detail_denies_unlisted_role(
    fastapi_app: FastAPI,
    api_client: AsyncClient,
) -> None:
    _override_identity("grafana-editor")
    response = await api_client.get("/pending-updates?detail=true")
    assert response.status_code == 403
    assert response.json()["detail"] == "Access denied"
