"""Smoke tests: app import, OpenAPI schema, and probe endpoints."""

from http import HTTPStatus
from typing import Any, cast

from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient

from src.main import app
from src.models.db_models import Feedback
from src.models.schemas.feedback_schemas import FeedbackRating

FEEDBACK_REASON_MAX_LENGTH = 30
FEEDBACK_TEXT_MAX_LENGTH = 5000


def test_app_imports() -> None:
    assert app.title == "Feedback Service"


def test_openapi_schema(client: TestClient) -> None:
    response = client.get("/openapi.json")
    assert response.status_code == HTTPStatus.OK
    schema = response.json()
    assert schema["info"]["title"] == "Feedback Service"
    paths = list(schema.get("paths", {}).keys())
    assert any("nodes" in p or "batch" in p or "update" in p for p in paths), f"No node-crud paths in schema: {paths}"
    reason_schema = schema["components"]["schemas"]["FeedbackInsertPayload"]["properties"]["reason"]["anyOf"][0]
    assert reason_schema["maxLength"] == FEEDBACK_REASON_MAX_LENGTH
    text_schema = schema["components"]["schemas"]["FeedbackInsertPayload"]["properties"]["text"]["anyOf"][0]
    assert text_schema["maxLength"] == FEEDBACK_TEXT_MAX_LENGTH


def test_probe_startup(client: TestClient) -> None:
    response = client.get("/startup")
    assert response.status_code == HTTPStatus.OK


def test_probe_healthz(client: TestClient) -> None:
    response = client.get("/healthz")
    assert response.status_code == HTTPStatus.OK


def test_probe_ready(client: TestClient) -> None:
    response = client.get("/ready")
    assert response.status_code == HTTPStatus.OK


def test_migration_has_single_head() -> None:
    cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected 1 migration head, got {heads}"


def test_feedback_rating_enum_values() -> None:
    assert FeedbackRating.POSITIVE.value == "positive"
    assert FeedbackRating.NEGATIVE.value == "negative"


def test_feedback_text_db_limit() -> None:
    table = cast(Any, Feedback).__table__
    assert table.c.text.type.length == FEEDBACK_TEXT_MAX_LENGTH


def test_feedback_reason_db_limit() -> None:
    table = cast(Any, Feedback).__table__
    assert table.c.reason.type.length == FEEDBACK_REASON_MAX_LENGTH
