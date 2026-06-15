"""Tests for generated node route metadata."""

from node_crud.registry import build_registries

from src.models.db_models import Base


def test_plausibility_note_occurrence_exposes_dms_document_parent() -> None:
    _, parent_fk_map = build_registries(Base)

    assert parent_fk_map["plausibility_note_occurrence"] == {
        "document_id": "file",
        "plausibility_note_id": "plausibility_note",
    }
