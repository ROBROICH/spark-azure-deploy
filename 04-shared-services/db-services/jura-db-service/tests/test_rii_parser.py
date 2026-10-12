"""rii parser chunk cache tests"""
import json
import pickle
import shutil
from pathlib import Path

import pytest
from jura_db.config import app_config
from jura_db.rii_parser import parse_doc

SAMPLE_XML = Path("tests/data") / "jb-TESTDOC0001" / "jb-TESTDOC0001.xml"


def _record_execution(marker: str) -> list:
    Path(marker).touch()
    return []


class _PlantedPayload:
    """pickle payload that leaves a marker file when it is unpickled"""

    def __init__(self, marker: Path) -> None:
        self.marker = marker

    def __reduce__(self):
        return (_record_execution, (str(self.marker),))


@pytest.mark.usefixtures("mock_query_embedding")
def test_parse_doc_ignores_cache_planted_in_extraction_dir(tmp_path: Path, monkeypatch) -> None:
    """a pickle shipped inside a downloaded archive must never be loaded"""
    monkeypatch.setattr(app_config, "cache_dir", tmp_path / "cache")
    extraction_dir = tmp_path / "cache" / "jb-TESTDOC0001"
    extraction_dir.mkdir(parents=True)
    xml_path = Path(shutil.copy(SAMPLE_XML, extraction_dir))
    marker = tmp_path / "executed"
    xml_path.with_suffix(".chunks.pkl").write_bytes(pickle.dumps(_PlantedPayload(marker)))

    doc = parse_doc(xml_path)

    assert not marker.exists()
    assert doc.chunks


@pytest.mark.usefixtures("mock_query_embedding")
def test_parse_doc_reuses_json_chunk_cache(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(app_config, "cache_dir", tmp_path)

    first = parse_doc(SAMPLE_XML)

    cache_files = [p for p in tmp_path.rglob("*") if p.is_file()]
    assert len(cache_files) == 1
    assert cache_files[0].suffix == ".json"

    def _fail(*_args, **_kwargs):
        pytest.fail("cached chunks must not be vectorised again")

    monkeypatch.setattr("db_services_shared.llm.embeddings.EmbeddingClient.embed_documents", _fail)
    second = parse_doc(SAMPLE_XML)

    assert first.chunks and second.chunks
    assert [c.model_dump() for c in second.chunks] == [c.model_dump() for c in first.chunks]
    for chunk in second.chunks or []:
        for norm in chunk.normen or []:
            # norms of the document are shared, not duplicated
            assert any(norm is doc_norm for doc_norm in second.normen or [])


@pytest.mark.usefixtures("mock_query_embedding")
def test_parse_doc_treats_broken_chunk_cache_as_miss(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(app_config, "cache_dir", tmp_path)
    cache_path = tmp_path / "chunk-cache" / "TESTDOC0001.chunks.json"
    cache_path.parent.mkdir()
    cache_path.write_text('[{"truncated": ', encoding="utf-8")

    doc = parse_doc(SAMPLE_XML)

    assert doc.chunks
    assert json.loads(cache_path.read_text(encoding="utf-8"))
