from http import HTTPStatus

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.exceptions.exception_handlers import register_exception_handlers


def test_generic_exception_returns_original_detail() -> None:
    app = FastAPI()
    register_exception_handlers(app)

    @app.get("/boom")
    async def boom() -> None:
        raise RuntimeError("exploded")

    client = TestClient(app, raise_server_exceptions=False)

    response = client.get("/boom")

    assert response.status_code == HTTPStatus.INTERNAL_SERVER_ERROR
    assert response.json() == {"detail": "exploded"}
