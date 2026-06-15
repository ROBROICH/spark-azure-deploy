"""Integration tests for risks service layer (requires PGlite)."""

from unittest.mock import AsyncMock
from uuid import uuid4

import pytest
from sqlalchemy import select

from src.exceptions.exceptions import NotFoundError
from src.models.db_models import Risk, VaeNode
from src.models.schemas.risks_schemas import (
    CreateRisksRequest,
    RiskModel,
    UpdateRiskRequest,
)
from src.services.risks_service import (
    _get_latest_project_version,
    create_risks,
    get_risks,
    update_risk,
)

pytestmark = pytest.mark.integration


@pytest.fixture(autouse=True)
def mock_latest_project_version(monkeypatch):
    latest_version = AsyncMock(return_value=1)
    validate_version = AsyncMock(side_effect=lambda _project_id, project_version: project_version)
    monkeypatch.setattr("src.services.risks_service._get_latest_project_version", latest_version)
    monkeypatch.setattr("src.services.risks_service._validate_project_write_version", validate_version)
    return latest_version


async def _create_vae_nodes(db_session, project_id, count: int = 1, project_version: int = 1) -> list[VaeNode]:
    nodes = [
        VaeNode(
            project_id=project_id,
            project_version=project_version,
            title=f"Chapter {index}",
            text=f"Chapter text {index}",
            order=index,
            parent_vae_node_id=None,
            checked_by_assignee=False,
            checked_by_leader=False,
            is_hidden=False,
            can_add_child=False,
        )
        for index in range(count)
    ]
    db_session.add_all(nodes)
    await db_session.flush()
    return nodes


def _build_risk_payload(vae_node_ids: list) -> CreateRisksRequest:
    """Helper to build a valid CreateRisksRequest payload."""
    risks = [
        RiskModel.model_validate(
            {
                "problem": f"Strukturelle Validierung {index}",
                "severity": 5,
                "implication": f"Begründung für Einstufung {index}",
                "vae_node_id": vae_node_ids[index],
            }
        )
        for index in range(len(vae_node_ids))
    ]
    return CreateRisksRequest(risks=risks)


@pytest.mark.asyncio
async def test_get_latest_project_version_accepts_camel_case_response(monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"latestVersion": 5}

    class Client:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_args):
            return None

        async def get(self, _url):
            return Response()

    monkeypatch.setattr("src.services.risks_service.httpx.AsyncClient", lambda **_kwargs: Client())

    assert await _get_latest_project_version(uuid4()) == 5


@pytest.mark.asyncio
async def test_create_risks_persists_entities(db_session):
    project_id = uuid4()
    nodes = await _create_vae_nodes(db_session, project_id, count=2)
    payload = _build_risk_payload([node.id for node in nodes])

    result = await create_risks(db=db_session, risks_payload=payload, project_id=project_id)

    assert len(result) == 2
    stmt = select(Risk).where(Risk.project_id == project_id)
    stored = (await db_session.execute(stmt)).scalars().all()
    assert len(stored) == 2


@pytest.mark.asyncio
async def test_create_risks_uses_pls_latest_project_version(db_session, mock_latest_project_version):
    project_id = uuid4()
    mock_latest_project_version.return_value = 2
    nodes = await _create_vae_nodes(db_session, project_id, project_version=2)

    result = await create_risks(
        db=db_session,
        risks_payload=_build_risk_payload([nodes[0].id]),
        project_id=project_id,
    )

    assert len(result) == 1
    assert result[0].project_version == 2


@pytest.mark.asyncio
async def test_get_risks_returns_records(db_session):
    project_id = uuid4()
    nodes = await _create_vae_nodes(db_session, project_id, count=2)
    payload = _build_risk_payload([node.id for node in nodes])
    await create_risks(db=db_session, risks_payload=payload, project_id=project_id)

    risks = await get_risks(db=db_session, project_id=project_id)

    assert len(risks) == 2
    assert all(r.project_id == project_id for r in risks)


@pytest.mark.asyncio
async def test_get_risks_returns_pls_latest_version(db_session, mock_latest_project_version):
    project_id = uuid4()
    mock_latest_project_version.return_value = 2
    v1_node = (await _create_vae_nodes(db_session, project_id, project_version=1))[0]
    v2_node = (await _create_vae_nodes(db_session, project_id, project_version=2))[0]
    db_session.add_all(
        [
            Risk(
                project_id=project_id,
                project_version=1,
                vae_node_id=v1_node.id,
                problem="old",
                severity=1,
                implication="old implication",
            ),
            Risk(
                project_id=project_id,
                project_version=2,
                vae_node_id=v2_node.id,
                problem="latest",
                severity=8,
                implication="latest implication",
            ),
        ]
    )
    await db_session.commit()

    risks = await get_risks(db=db_session, project_id=project_id)

    assert [risk.problem for risk in risks] == ["latest"]


@pytest.mark.asyncio
async def test_get_risks_excludes_soft_deleted_records(db_session):
    project_id = uuid4()
    nodes = await _create_vae_nodes(db_session, project_id, count=2)
    created = await create_risks(
        db=db_session,
        risks_payload=_build_risk_payload([node.id for node in nodes]),
        project_id=project_id,
    )
    created[0].is_deleted = True
    await db_session.flush()

    risks = await get_risks(db=db_session, project_id=project_id)

    assert len(risks) == 1
    assert risks[0].id == created[1].id


@pytest.mark.asyncio
async def test_get_risks_returns_empty_list_when_none_exist(db_session):
    project_id = uuid4()

    risks = await get_risks(db=db_session, project_id=project_id)

    assert len(risks) == 0


@pytest.mark.asyncio
async def test_update_risk_returns_updated_entity(db_session):
    project_id = uuid4()
    nodes = await _create_vae_nodes(db_session, project_id)
    created = await create_risks(
        db=db_session,
        risks_payload=_build_risk_payload([nodes[0].id]),
        project_id=project_id,
    )
    risk_id = created[0].id
    payload = UpdateRiskRequest(problem="new problem", severity=8)

    updated = await update_risk(
        db=db_session,
        risk_id=risk_id,
        payload=payload,
    )

    assert isinstance(updated, Risk)
    assert updated.problem == "new problem"
    assert updated.severity == 8


@pytest.mark.asyncio
async def test_update_risk_updates_latest_version(db_session, mock_latest_project_version):
    project_id = uuid4()
    mock_latest_project_version.return_value = 2
    risk_id = uuid4()
    node_id = uuid4()
    db_session.add_all(
        [
            VaeNode(
                id=node_id,
                project_id=project_id,
                project_version=1,
                title="Chapter 1",
                text="Chapter text 1",
                order=1,
            ),
            VaeNode(
                id=node_id,
                project_id=project_id,
                project_version=2,
                title="Chapter 2",
                text="Chapter text 2",
                order=1,
            ),
        ]
    )
    old_risk = Risk(
        id=risk_id,
        project_id=project_id,
        project_version=1,
        vae_node_id=node_id,
        problem="old",
        severity=1,
        implication="old implication",
    )
    latest_risk = Risk(
        id=risk_id,
        project_id=project_id,
        project_version=2,
        vae_node_id=node_id,
        problem="latest",
        severity=5,
        implication="latest implication",
    )
    db_session.add_all([old_risk, latest_risk])
    await db_session.commit()

    updated = await update_risk(db=db_session, risk_id=risk_id, payload=UpdateRiskRequest(problem="new latest"))
    await db_session.refresh(old_risk)
    await db_session.refresh(latest_risk)

    assert updated.project_version == 2
    assert old_risk.problem == "old"
    assert latest_risk.problem == "new latest"


@pytest.mark.asyncio
async def test_update_risk_does_not_fall_back_to_old_version_after_latest_delete(
    db_session,
    mock_latest_project_version,
):
    project_id = uuid4()
    mock_latest_project_version.return_value = 2
    risk_id = uuid4()
    node_id = uuid4()
    db_session.add_all(
        [
            VaeNode(id=node_id, project_id=project_id, project_version=1, title="Chapter 1", text="Text 1", order=1),
            VaeNode(id=node_id, project_id=project_id, project_version=2, title="Chapter 2", text="Text 2", order=1),
        ]
    )
    old_risk = Risk(
        id=risk_id,
        project_id=project_id,
        project_version=1,
        vae_node_id=node_id,
        problem="old",
        severity=1,
        implication="old implication",
    )
    deleted_latest_risk = Risk(
        id=risk_id,
        project_id=project_id,
        project_version=2,
        vae_node_id=node_id,
        problem="deleted latest",
        severity=5,
        implication="latest implication",
        is_deleted=True,
    )
    db_session.add_all([old_risk, deleted_latest_risk])
    await db_session.commit()

    with pytest.raises(NotFoundError):
        await update_risk(db=db_session, risk_id=risk_id, payload=UpdateRiskRequest(problem="must not update old"))
    await db_session.refresh(old_risk)

    assert old_risk.problem == "old"


@pytest.mark.asyncio
async def test_update_risk_does_not_mutate_superseded_version_when_latest_missing(
    db_session,
    mock_latest_project_version,
):
    project_id = uuid4()
    mock_latest_project_version.return_value = 2
    risk_id = uuid4()
    node = (await _create_vae_nodes(db_session, project_id, project_version=1))[0]
    old_risk = Risk(
        id=risk_id,
        project_id=project_id,
        project_version=1,
        vae_node_id=node.id,
        problem="old",
        severity=1,
        implication="old implication",
    )
    db_session.add(old_risk)
    await db_session.commit()

    with pytest.raises(NotFoundError):
        await update_risk(db=db_session, risk_id=risk_id, payload=UpdateRiskRequest(problem="must not update old"))
    await db_session.refresh(old_risk)

    assert old_risk.problem == "old"


@pytest.mark.asyncio
async def test_update_risk_raises_not_found(db_session):
    with pytest.raises(NotFoundError):
        await update_risk(
            db=db_session,
            risk_id=uuid4(),
            payload=UpdateRiskRequest(problem="irrelevant"),
        )


@pytest.mark.asyncio
async def test_update_risk_raises_not_found_for_soft_deleted_risk(db_session):
    project_id = uuid4()
    nodes = await _create_vae_nodes(db_session, project_id)
    created = await create_risks(
        db=db_session,
        risks_payload=_build_risk_payload([nodes[0].id]),
        project_id=project_id,
    )
    created[0].is_deleted = True
    await db_session.flush()

    with pytest.raises(NotFoundError):
        await update_risk(
            db=db_session,
            risk_id=created[0].id,
            payload=UpdateRiskRequest(problem="irrelevant"),
        )
