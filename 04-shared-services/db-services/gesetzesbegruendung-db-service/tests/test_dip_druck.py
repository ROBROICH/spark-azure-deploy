"""dip druck parser embeddings cache tests"""
import pickle
import shutil
from pathlib import Path

import pytest
from begruendungen_db.config import app_config
from begruendungen_db.parsers.dip_druck import DIPDruckProcessor

SAMPLE_LAW_DIR = Path("tests/data/complete/UTCG")


def _record_execution(marker: str) -> list:
    Path(marker).touch()
    return []


class _PlantedPayload:
    """pickle payload that leaves a marker file when it is unpickled"""

    def __init__(self, marker: Path) -> None:
        self.marker = marker

    def __reduce__(self):
        return (_record_execution, (str(self.marker),))


@pytest.fixture
def fake_embeddings(monkeypatch) -> None:
    monkeypatch.setattr(
        "db_services_shared.llm.embeddings.EmbeddingClient.embed_documents",
        lambda _, texts: [[0.1] * app_config.chunking.dimensions for _ in texts],
    )


@pytest.fixture
def law_dir(tmp_path: Path) -> Path:
    return Path(shutil.copytree(SAMPLE_LAW_DIR, tmp_path / "UTCG"))


@pytest.fixture
def parser(tmp_path: Path) -> DIPDruckProcessor:
    return DIPDruckProcessor(
        base_path=tmp_path,
        api_key="test",
        docling={"HOST": "http://localhost", "TOKEN_URL": None},
    )


@pytest.mark.usefixtures("fake_embeddings")
def test_parse_doc_never_unpickles_embeddings_cache(
    tmp_path: Path, law_dir: Path, parser: DIPDruckProcessor
) -> None:
    doc_file = law_dir / "UTCG_810.json"
    marker = tmp_path / "executed"
    doc_file.with_suffix(".embeddings").write_bytes(pickle.dumps(_PlantedPayload(marker)))

    doc = parser.parse_doc("UTCG", doc_file)

    assert not marker.exists()
    assert doc.chunks


@pytest.mark.usefixtures("fake_embeddings")
def test_parse_doc_reuses_json_embeddings_cache(law_dir: Path, parser: DIPDruckProcessor, monkeypatch) -> None:
    doc_file = law_dir / "UTCG_810.json"
    first = parser.parse_doc("UTCG", doc_file)

    def _fail(*_args, **_kwargs):
        pytest.fail("cached chunks must not be vectorised again")

    monkeypatch.setattr("db_services_shared.llm.embeddings.EmbeddingClient.embed_documents", _fail)
    second = parser.parse_doc("UTCG", doc_file)

    assert first.chunks
    assert [c.model_dump() for c in second.chunks] == [c.model_dump() for c in first.chunks]
