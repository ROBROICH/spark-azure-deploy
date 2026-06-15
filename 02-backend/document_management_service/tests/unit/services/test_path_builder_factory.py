from src.models.db.file_enum import FileTypeEnum
from src.services.files.path_builder.path_builders import (
    ContentExtractionDataPathBuilder,
    ErwiderungsExportPathBuilder,
    ErwiderungsImportPathBuilder,
    LawDataPathBuilder,
    ProjectDocumentPathBuilder,
    ProjectZipFilePathBuilder,
    TemplatePathBuilder,
    TemporalCheckpointPathBuilder,
)


def test_factory_has_all_builders_registered():
    from src.services.files.path_builder.path_builder_factory import PathBuilderFactory

    assert isinstance(PathBuilderFactory.get(FileTypeEnum.DOCUMENT), ProjectDocumentPathBuilder)
    assert isinstance(PathBuilderFactory.get(FileTypeEnum.ZIP), ProjectZipFilePathBuilder)
    assert isinstance(PathBuilderFactory.get(FileTypeEnum.TEMPLATE), TemplatePathBuilder)
    assert isinstance(
        PathBuilderFactory.get(FileTypeEnum.CONTENT_EXTRACTION),
        ContentExtractionDataPathBuilder,
    )
    assert isinstance(PathBuilderFactory.get(FileTypeEnum.LAW_DATA), LawDataPathBuilder)
    assert isinstance(
        PathBuilderFactory.get(FileTypeEnum.TEMPORAL_CHECKPOINT),
        TemporalCheckpointPathBuilder,
    )
    assert isinstance(
        PathBuilderFactory.get(FileTypeEnum.ERWIDERUNGS_IMPORT),
        ErwiderungsImportPathBuilder,
    )
    assert isinstance(
        PathBuilderFactory.get(FileTypeEnum.ERWIDERUNGS_EXPORT),
        ErwiderungsExportPathBuilder,
    )


def test_filename_sanitization():
    builder = ProjectDocumentPathBuilder()
    dangerous = "../etc/passwd.pdf"
    safe = builder.sanitize_filename(dangerous)
    assert ".." not in str(safe)
    assert str(safe) == "etc/passwd.pdf"
