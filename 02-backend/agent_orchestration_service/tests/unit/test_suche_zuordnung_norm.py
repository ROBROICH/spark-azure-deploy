from typing import Any
from uuid import UUID, uuid4

import pytest
from temporal.workflows.modul_suche_und_zuordnung.types import Absatz, NormData, Satz

from src.workflows.suche_zuordnung_norm.activity import (
    FetchNormExaminationIdsInput,
    _fetch_norm_examination_ids,
)
from src.workflows.suche_zuordnung_norm.helpers import collect_saetze


def test_collect_saetze_uses_satz_position_for_lookup_metadata() -> None:
    data = NormData(
        gesetz="Bundesnaturschutzgesetz",
        jurabk="BNatSchG",
        paragraph_nr="44",
        paragraph_titel="Titel",
        absaetze=[
            Absatz(
                absatz_nr="1",
                absatz_text="Absatztext",
                saetze=[
                    Satz(satz_nr="1", position=0, satz_text="Satz 1", tatbestandsmerkmale=["a"]),
                    Satz(satz_nr="2", position=1, satz_text="Satz 2", tatbestandsmerkmale=["b"]),
                    Satz(satz_nr="2", position=2, satz_text="Satz 2a", tatbestandsmerkmale=["c"]),
                ],
            )
        ],
    )

    saetze = collect_saetze(data)

    assert [satz["position"] for satz in saetze] == [0, 1, 2]
    assert [satz["satz_key"] for satz in saetze] == ["satz_1_0", "satz_2_1", "satz_2_2"]


@pytest.mark.asyncio
async def test_fetch_norm_examination_ids_uses_position_in_lookup(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    norm_id = str(uuid4())
    absatz_id = str(uuid4())
    satz_id_1 = str(uuid4())
    satz_id_2 = str(uuid4())
    satz_id_3 = str(uuid4())
    gesetz_id = str(uuid4())
    project_id = str(uuid4())

    async def fake_list_nodes(project_id_arg: UUID) -> dict[str, Any]:
        assert str(project_id_arg) == project_id
        return {
            "nodes": [
                {"id": norm_id, "node_type": "norm", "parents": [{"id": gesetz_id, "node_type": "gesetz"}]},
                {"id": absatz_id, "node_type": "absatz", "parents": [{"id": norm_id, "node_type": "norm"}]},
                {"id": satz_id_1, "node_type": "satz", "parents": [{"id": absatz_id, "node_type": "absatz"}]},
                {"id": satz_id_2, "node_type": "satz", "parents": [{"id": absatz_id, "node_type": "absatz"}]},
                {"id": satz_id_3, "node_type": "satz", "parents": [{"id": absatz_id, "node_type": "absatz"}]},
            ]
        }

    async def fake_resolve_nodes(
        project_id_arg: str, node_refs: list[dict[str, Any]], *, client: type = object
    ) -> list[dict[str, Any]]:
        node_types = {node["node_type"] for node in node_refs}
        assert project_id_arg == project_id
        if node_types == {"absatz"}:
            return [{"id": absatz_id, "norm_id": norm_id, "absatz_nr": "1", "text": "Absatz"}]
        if node_types == {"satz"}:
            return [
                {"id": satz_id_3, "absatz_id": absatz_id, "satz_nr": "2", "position": 2, "text": "Satz 2a"},
                {"id": satz_id_1, "absatz_id": absatz_id, "satz_nr": "1", "position": 0, "text": "Satz 1"},
                {"id": satz_id_2, "absatz_id": absatz_id, "satz_nr": "2", "position": 1, "text": "Satz 2"},
            ]
        raise AssertionError(f"Unexpected resolve_nodes call: {node_refs}")

    monkeypatch.setattr(
        "src.workflows.suche_zuordnung_norm.activity.ExaminationServiceClient.list_nodes",
        fake_list_nodes,
    )
    monkeypatch.setattr(
        "src.workflows.suche_zuordnung_norm.activity.activity.heartbeat",
        lambda *_args, **_kwargs: None,
    )
    monkeypatch.setattr(
        "src.workflows.suche_zuordnung_norm.activity.resolve_nodes",
        fake_resolve_nodes,
    )

    result = await _fetch_norm_examination_ids(FetchNormExaminationIdsInput(project_id=project_id, norm_id=norm_id))

    assert result.gesetz_id == gesetz_id
    assert result.satz_id_lookup == {
        "1:1:0": satz_id_1,
        "1:2:1": satz_id_2,
        "1:2:2": satz_id_3,
    }
