from node_crud.registry import build_registries

from src.models.db.db_models import Base


def test_file_topic_exposes_external_topic_parent() -> None:
    _model_registry, parent_fk_map = build_registries(Base)

    assert parent_fk_map["file_topic"]["file_id"] == "file"
    assert parent_fk_map["file_topic"]["topic_id"] == "topic"
    assert parent_fk_map["file_topic"]["subtopic_id"] == "subtopic"
