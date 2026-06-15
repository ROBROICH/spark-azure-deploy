import uuid
from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select

from src.models.db_models import VaeNode, VaeTemplate, VaeTemplateNode
from src.models.schemas.template_schemas import AssignTemplateRequest, TopicModel
from src.models.topic_enums import TopicEnum
from src.services.template_service import TemplateService


@pytest.fixture(autouse=True)
def mock_project_versions(monkeypatch):
    latest_version = AsyncMock(return_value=1)
    validate_version = AsyncMock(side_effect=lambda _project_id, project_version: project_version)
    monkeypatch.setattr("src.services.template_service._get_latest_project_version", latest_version)
    monkeypatch.setattr("src.services.template_service._validate_project_write_version", validate_version)
    return latest_version


@pytest.mark.asyncio
async def test_create_and_activate_template(integration_client):
    project_type_id = str(uuid.uuid4())

    # 1. Create template
    res = await integration_client.post(
        "/templates",
        json={
            "name": "Test Template",
            "project_type_id": project_type_id,
        },
    )
    assert res.status_code == 200

    template = res.json()
    template_id = template["id"]

    assert template["name"] == "Test Template"
    assert template["project_type_id"] == project_type_id
    assert template["is_active"] is False

    # 2. Add nodes
    node_id = str(uuid.uuid4())
    res = await integration_client.post(
        f"/templates/{template_id}/nodes",
        json=[
            {
                "id": node_id,
                "topic": TopicEnum.ARTENSCHUTZRECHT,
                "title": "1. Main Section",
                "order": 1,
                "parent_id": None,
                "can_add_child": False,
            },
            {
                "id": str(uuid.uuid4()),
                "topic": TopicEnum.ARTENSCHUTZRECHT,
                "title": "1.1 Sub Section",
                "order": 2,
                "parent_id": node_id,
                "can_add_child": False,
            },
        ],
    )
    assert res.status_code == 200

    # 3. Activate template
    res = await integration_client.post(f"/templates/{template_id}/activate")
    assert res.status_code == 200

    # 4. Verify activation
    res = await integration_client.get(f"/templates/{template_id}")
    assert res.status_code == 200

    template = res.json()
    assert template["is_active"] is True

    # 5. Ensure listing works
    res = await integration_client.get(f"/templates?project_type_id={project_type_id}")
    assert res.status_code == 200

    templates = res.json()
    assert len(templates) == 1
    assert templates[0]["id"] == template_id

    # 6. List template nodes
    res = await integration_client.get(f"/templates/{template_id}/nodes")
    assert res.status_code == 200

    templates_nodes = res.json()
    assert len(templates_nodes) == 2

    # 6. Assign template to new project
    project_id = uuid.uuid4()
    topic_id = str(uuid.uuid4())
    res = await integration_client.post(
        f"/templates/{project_id}/assign-template/{project_type_id}",
        json={"topics": [{"id": topic_id, "name": TopicEnum.ARTENSCHUTZRECHT.value}]},
    )
    assert res.status_code == 200

    # 7. Ensure listing for project works
    res = await integration_client.get(f"/{project_id}/nodes?project_version=1")
    assert res.status_code == 200
    assert len(res.json()["nodes"]) == 2
    ids = [node["id"] for node in res.json()["nodes"]]

    # 8. Check topic id
    res = await integration_client.post(
        f"/{project_id}/batch-nodes?project_version=1",
        json={"nodes": [{"node_type": "vae_node", "id": node_id} for node_id in ids]},
    )
    assert res.status_code == 200
    result_json = res.json()["results"]
    assert result_json[0]["topic_id"] == topic_id
    assert result_json[1]["topic_id"] == topic_id
    assert result_json[1]["parent_vae_node_id"] == result_json[0]["id"]


@pytest.mark.asyncio
async def test_assign_template_uses_latest_project_version(db_session, mock_project_versions):
    mock_project_versions.return_value = 2
    project_id = uuid.uuid4()
    project_type_id = uuid.uuid4()
    topic_id = uuid.uuid4()
    template = VaeTemplate(name="Test Template", project_type_id=project_type_id, is_active=True)
    db_session.add(template)
    await db_session.flush()
    db_session.add(
        VaeTemplateNode(
            template_id=template.id,
            title="Template Node",
            text="Template text",
            topic=TopicEnum.ARTENSCHUTZRECHT,
            order=1,
            can_add_child=False,
            is_hidden=False,
        )
    )
    db_session.add(
        VaeNode(
            project_id=project_id,
            project_version=2,
            title="Deleted latest node",
            text="Deleted latest text",
            is_deleted=True,
        )
    )
    await db_session.commit()

    await TemplateService(db_session).assign_template(
        project_id=project_id,
        project_type_id=project_type_id,
        data=AssignTemplateRequest(topics=[TopicModel(id=topic_id, name=TopicEnum.ARTENSCHUTZRECHT.value)]),
    )

    nodes = (
        (
            await db_session.execute(
                select(VaeNode)
                .where(VaeNode.project_id == project_id, VaeNode.is_deleted.is_(False))
                .order_by(VaeNode.created_at)
            )
        )
        .scalars()
        .all()
    )
    assert len(nodes) == 1
    assert nodes[0].project_version == 2
    assert nodes[0].topic_id == topic_id
