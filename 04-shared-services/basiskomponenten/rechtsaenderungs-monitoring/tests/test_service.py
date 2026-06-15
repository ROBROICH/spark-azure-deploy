"""api endpoint tests"""

from httpx import AsyncClient
from pytest import LogCaptureFixture


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