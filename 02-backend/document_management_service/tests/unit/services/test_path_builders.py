from pathlib import PurePosixPath
from uuid import uuid4

from src.models.db.file_enum import FileTypeEnum
from src.services.files.path_builder.path_builder_base import FileContext
from src.services.files.path_builder.path_builder_factory import PathBuilderFactory


def test_project_document_correct_path():
    project_id = uuid4()
    context = FileContext(
        type=FileTypeEnum.DOCUMENT,
        project_id=project_id,
    )

    path = PathBuilderFactory.build_path("Vertrag 2025.pdf", context)
    assert path == PurePosixPath(f"documents/{project_id}/v1/Vertrag_2025.pdf")


def test_template_with_project_id():
    project_id = uuid4()
    context = FileContext(
        type=FileTypeEnum.TEMPLATE,
        project_id=project_id,
    )

    path = PathBuilderFactory.build_path("project_template.docx", context)
    assert path == PurePosixPath(f"templates/{project_id}/v1/project_template.docx")


def test_content_extraction_same_as_document():
    project_id = uuid4()
    context = FileContext(
        type=FileTypeEnum.CONTENT_EXTRACTION,
        project_id=project_id,
    )

    path = PathBuilderFactory.build_path("extracted.txt", context)
    assert path == PurePosixPath(f"content_extraction/{project_id}/v1/extracted.txt")


def test_law_data_global():
    context = FileContext(
        type=FileTypeEnum.LAW_DATA,
    )

    path = PathBuilderFactory.build_path("BGB_§433.pdf", context)
    assert path == PurePosixPath("law_data/v1/BGB_§433.pdf")


def test_erwiderungs_import_project_path():
    project_id = uuid4()
    context = FileContext(
        type=FileTypeEnum.ERWIDERUNGS_IMPORT,
        project_id=project_id,
    )

    path = PathBuilderFactory.build_path("Import Liste.csv", context)
    assert path == PurePosixPath(f"erwiderungs/imports/{project_id}/v1/Import_Liste.csv")


def test_erwiderungs_export_project_path():
    project_id = uuid4()
    context = FileContext(
        type=FileTypeEnum.ERWIDERUNGS_EXPORT,
        project_id=project_id,
        version=2,
    )

    path = PathBuilderFactory.build_path("export.csv", context)
    assert path == PurePosixPath(f"erwiderungs/exports/{project_id}/v2/export.csv")


def test_temporal_checkpoint_full_path():
    project_id = uuid4()
    workflow_id = "wf-12345"
    run_id = "run-abc"

    context = FileContext(
        type=FileTypeEnum.TEMPORAL_CHECKPOINT,
        project_id=project_id,
        workflow_id=workflow_id,
        run_id=run_id,
    )

    path = PathBuilderFactory.build_path("checkpoint.json", context)
    expected = PurePosixPath(f"temporal_checkpoints/{workflow_id}/{run_id}/{project_id}/v1/checkpoint.json")
    assert path == expected


def test_temporal_checkpoint_with_project_id():
    project_id = uuid4()
    context = FileContext(
        type=FileTypeEnum.TEMPORAL_CHECKPOINT,
        project_id=project_id,
        workflow_id="wf-global",
        run_id="run-001",
    )

    path = PathBuilderFactory.build_path("global_state.json", context)
    assert path == PurePosixPath(f"temporal_checkpoints/wf-global/run-001/{project_id}/v1/global_state.json")


def test_path_includes_version_number():
    project_id = uuid4()
    context = FileContext(
        type=FileTypeEnum.DOCUMENT,
        project_id=project_id,
        version=3,
    )

    path = PathBuilderFactory.build_path("doc.pdf", context)
    assert path == PurePosixPath(f"documents/{project_id}/v3/doc.pdf")
