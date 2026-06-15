"""Tests for generated node route metadata."""

from node_crud.base import NodeType
from node_crud.registry import ColumnName, build_registries

from src.models.db_models import Base


def test_document_exposes_all_dms_file_parents() -> None:
    _, parent_fk_map = build_registries(Base)

    assert parent_fk_map[NodeType("document")][ColumnName("file_id")] == "file"
    assert parent_fk_map[NodeType("document")][ColumnName("content_extraction_id")] == "file"
