"""Integration tests for OMS generated node endpoint validation."""

from uuid import uuid4

import httpx
import pytest
from fastapi import status

pytestmark = pytest.mark.integration


def gen_id() -> str:
    """Generate a node ID."""
    return str(uuid4())


async def insert_beteiligungs_eingang(
    api_client: httpx.AsyncClient,
    project_id: str,
) -> str:
    """Create the parent Beteiligungseingang node through the generated node API."""
    beteiligungs_eingang_id = gen_id()
    response = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "beteiligungs_eingang",
                    "id": beteiligungs_eingang_id,
                    "payload": {
                        "beteiligung_typ": "stellungnahme",
                        "file_id": gen_id(),
                        "filename": "integration-test.md",
                        "beteiligungs_eingang_markdown_id": None,
                        "extraction_status": "success",
                        "classification_status": "loading",
                    },
                }
            ],
            "updates": [],
            "deletes": [],
        },
    )
    response.raise_for_status()
    return beteiligungs_eingang_id


async def insert_argument(
    api_client: httpx.AsyncClient,
    project_id: str,
    beteiligungs_eingang_id: str,
) -> str:
    """Create an Argument node through the generated node API."""
    argument_id = gen_id()
    response = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [
                {
                    "node_type": "argument",
                    "id": argument_id,
                    "payload": {
                        "beteiligungs_eingang_id": beteiligungs_eingang_id,
                        "text": "This is an extracted argument.",
                        "start_idx": 0,
                        "end_idx": 30,
                        "erwiderung": "Draft response",
                        "einordnung": "Topic classification",
                        "context": "Context for the extracted argument.",
                        "status": "open",
                        "in_vae": False,
                        "is_valid_argument": True,
                    },
                }
            ],
            "updates": [],
            "deletes": [],
        },
    )
    response.raise_for_status()
    return argument_id


async def test_update_argument_status_accepts_all_snake_case_values(
    api_client: httpx.AsyncClient,
    project_id: str,
) -> None:
    beteiligungs_eingang_id = await insert_beteiligungs_eingang(api_client, project_id)
    argument_id = await insert_argument(api_client, project_id, beteiligungs_eingang_id)

    for argument_status in ["open", "subtopic_reviewed", "done"]:
        update_response = await api_client.post(
            f"/{project_id}/update",
            json={
                "inserts": [],
                "updates": [
                    {
                        "node_type": "argument",
                        "id": argument_id,
                        "payload": {"status": argument_status},
                    }
                ],
                "deletes": [],
            },
        )

        assert update_response.status_code == status.HTTP_200_OK
        assert update_response.json()["updated"][0]["status"] == argument_status

        batch_response = await api_client.post(
            f"/{project_id}/batch-nodes",
            json={"nodes": [{"node_type": "argument", "id": argument_id}]},
        )

        assert batch_response.status_code == status.HTTP_200_OK
        assert batch_response.json()["results"][0]["status"] == argument_status


async def test_update_argument_status_rejects_camel_case_value(
    api_client: httpx.AsyncClient,
    project_id: str,
) -> None:
    beteiligungs_eingang_id = await insert_beteiligungs_eingang(api_client, project_id)
    argument_id = await insert_argument(api_client, project_id, beteiligungs_eingang_id)

    response = await api_client.post(
        f"/{project_id}/update",
        json={
            "inserts": [],
            "updates": [
                {
                    "node_type": "argument",
                    "id": argument_id,
                    "payload": {"status": "subtopicReviewed"},
                }
            ],
            "deletes": [],
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY
