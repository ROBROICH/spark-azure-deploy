from unittest.mock import MagicMock, patch

import pytest
from event_logging.context import project_id_var
from event_logging.enums import EventAction, EventCategory, EventOutcome, LogEventDefault
from event_logging.middleware import EventLoggingMiddleware
from fastapi import FastAPI
from fastapi.testclient import TestClient
from starlette import status


@pytest.fixture
def app():
    app = FastAPI()

    @app.get("/users/{user_id}")
    async def get_user(user_id: str, project_id: str | None = None):
        return {"user_id": user_id, "project_id": project_id}

    @app.get("/healthz")
    async def health():
        return {"status": "ok"}

    # Add the middleware
    app.add_middleware(EventLoggingMiddleware, service_name="test-service", skip_paths=["/healthz", "/metrics"])

    return app


@pytest.fixture
def client(app):
    return TestClient(app)


@pytest.fixture
def mock_logger():
    with patch("event_logging.middleware.EventLogger") as mock_logger_class:
        mock_instance = MagicMock()
        mock_logger_class.return_value = mock_instance
        yield mock_instance


def test_middleware_skips_healthz_endpoint(client, mock_logger):
    response = client.get("/healthz")
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"status": "ok"}

    # Logger should NOT have been called
    mock_logger.info.assert_not_called()


def test_middleware_logs_successful_get_with_path_param(client, mock_logger):
    response = client.get("/users/123?project_id=proj-abc-456&access_token=secret-token")

    assert response.status_code == status.HTTP_200_OK
    assert response.json()["user_id"] == "123"

    mock_logger.info.assert_called_once()

    call_args = mock_logger.info.call_args[1]  # keyword arguments

    assert call_args["action"] == EventAction.READ
    assert call_args["outcome"] == EventOutcome.SUCCESS
    assert call_args["category"] == EventCategory.API
    assert call_args["default_event"] == LogEventDefault.API_REQUEST
    assert "GET 200" in call_args["message"]
    assert "/users/123" in call_args["message"]
    assert "access_token" not in call_args["message"]
    assert "secret-token" not in call_args["message"]
    assert call_args["project_id"] == "proj-abc-456"
    assert call_args["source_ip"] == "testclient"
    assert isinstance(call_args["event_duration"], int)
    assert call_args["event_duration"] > 0


def test_middleware_sets_contextvar_and_resets_it(client, mock_logger):
    project_id_var.set("should-be-overwritten")

    client.get("/users/777?project_id=proj-temp-123")

    # After request → context should be reset
    assert project_id_var.get() == "should-be-overwritten"

    # During request the value should have been set (indirectly tested via logger call)
    mock_logger.info.assert_called_once()
    assert mock_logger.info.call_args[1]["project_id"] == "proj-temp-123"


def test_middleware_marks_4xx_as_failure(client, mock_logger):
    # Create a 404 route that doesn't exist
    response = client.get("/this-route-does-not-exist")

    assert response.status_code == status.HTTP_404_NOT_FOUND

    mock_logger.info.assert_called_once()
    call_args = mock_logger.info.call_args[1]

    assert call_args["outcome"] == EventOutcome.FAILURE
    assert "GET 404" in call_args["message"]


def test_middleware_does_not_log_raw_query_string(client, mock_logger):
    response = client.get("/users/123?token=secret-token&email=user@example.test")

    assert response.status_code == status.HTTP_200_OK

    mock_logger.info.assert_called_once()
    message = mock_logger.info.call_args[1]["message"]

    assert message == "GET 200: /users/123 executed."
    assert "token=" not in message
    assert "secret-token" not in message
    assert "user@example.test" not in message
