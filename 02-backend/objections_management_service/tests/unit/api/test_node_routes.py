"""Tests for generated node route metadata."""

import pytest
from node_crud.registry import build_registries
from node_crud.schema import build_generated_node_schemas
from pydantic import ValidationError

from src.models.db_models import Base


def test_generated_node_registry_includes_objection_models() -> None:
    """All objection node models are exposed to the generated node API."""
    model_registry, parent_fk_map = build_registries(Base)

    assert set(model_registry) == {
        "argument",
        "beteiligungs_eingang",
        "beteiligungs_eingang_markdown",
    }
    assert parent_fk_map["argument"] == {
        "beteiligungs_eingang_id": "beteiligungs_eingang",
        "topic_id": "topic",
        "sub_topic_id": "subtopic",
    }
    assert parent_fk_map["beteiligungs_eingang"] == {"file_id": "file"}
    assert parent_fk_map["beteiligungs_eingang_markdown"] == {"beteiligungs_eingang_id": "beteiligungs_eingang"}


def test_generated_node_schemas_accept_all_objection_node_types() -> None:
    """Generated request schemas accept inserts for all objection node types."""
    model_registry, parent_fk_map = build_registries(Base)
    schemas = build_generated_node_schemas(model_registry, parent_fk_map)

    payload = schemas.process_node_changes_request.model_validate(
        {
            "inserts": [
                {
                    "node_type": "beteiligungs_eingang",
                    "id": "11111111-1111-4111-8111-111111111111",
                    "payload": {
                        "beteiligung_typ": "stellungnahme",
                        "file_id": "54a412e5-f9d6-4eb1-a5db-cc360df2dc4c",
                        "beteiligungs_eingang_markdown_id": "22222222-2222-4222-8222-222222222222",
                        "extraction_status": "loading",
                    },
                },
                {
                    "node_type": "beteiligungs_eingang_markdown",
                    "id": "22222222-2222-4222-8222-222222222222",
                    "payload": {
                        "beteiligungs_eingang_id": "11111111-1111-4111-8111-111111111111",
                        "text": "# Imported markdown",
                    },
                },
                {
                    "node_type": "argument",
                    "payload": {
                        "beteiligungs_eingang_id": "54a412e5-f9d6-4eb1-a5db-cc360df2dc4c",
                        "text": "This is a test extracted argument",
                        "start_idx": 12,
                        "end_idx": 42,
                        "erwiderung": "This is a draft response",
                        "einordnung": "This is a topic classification",
                        "context": "This is the grounded context for the extracted argument.",
                        "status": "subtopic_reviewed",
                    },
                },
            ],
            "updates": [],
            "deletes": [],
        }
    )

    assert [insert.node_type for insert in payload.inserts] == [
        "beteiligungs_eingang",
        "beteiligungs_eingang_markdown",
        "argument",
    ]


def test_generated_beteiligungs_eingang_schema_rejects_inline_markdown() -> None:
    """Beteiligungseingang node payloads no longer accept the large markdown text field."""
    model_registry, parent_fk_map = build_registries(Base)
    schemas = build_generated_node_schemas(model_registry, parent_fk_map)

    with pytest.raises(ValidationError) as exc_info:
        schemas.process_node_changes_request.model_validate(
            {
                "inserts": [
                    {
                        "node_type": "beteiligungs_eingang",
                        "payload": {
                            "beteiligung_typ": "stellungnahme",
                            "file_id": "54a412e5-f9d6-4eb1-a5db-cc360df2dc4c",
                            "beteiligungs_eingang_markdown": "# Imported markdown",
                            "extraction_status": "loading",
                        },
                    }
                ],
                "updates": [],
                "deletes": [],
            }
        )

    assert "beteiligungs_eingang_markdown" in str(exc_info.value)
