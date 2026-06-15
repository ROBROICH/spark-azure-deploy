from unittest.mock import AsyncMock, MagicMock, patch
from uuid import UUID, uuid4

import pytest

from src.models.db.db_models import File
from src.models.db.file_enum import FileTypeEnum
from src.models.db.workflow_enum import ActionEnum
from src.services.storage_provider.storage_provider_base_service import (
    BaseStorageProviderService,
)
from src.services.workflows.activities.activity_models import (
    ComputeDiffInput,
    SingleFileResult,
)
from src.services.workflows.activities.compute_diff import (
    create_diff,
    gather_sha256,
    get_sha256,
)


@pytest.fixture
def mock_storage():
    storage_provider_service = AsyncMock(spec=BaseStorageProviderService)
    storage_provider_service.get_metadata = AsyncMock()
    storage_provider_service.download_document_stream = MagicMock()
    storage_provider_service.compute_sha256 = AsyncMock()
    return storage_provider_service


@pytest.fixture
def mock_file_service(mock_storage):
    service = MagicMock()
    service.storage_provider_service = mock_storage
    service.list_files = AsyncMock()
    return service


@pytest.fixture
def sample_compute_input():
    return ComputeDiffInput(
        project_id=str(uuid4()),
        zip_file_id=str(uuid4()),
        files=[
            SingleFileResult(
                filename="report-v2.pdf",
                bucket_path="projects/abc/staging/report-v2.pdf",
                success=True,
                action=ActionEnum.UNZIP,
            ),
            SingleFileResult(
                filename="notes/old.txt",
                bucket_path="projects/abc/staging/notes/old.txt",
                success=True,
                action=ActionEnum.UNZIP,
            ),
        ],
        rename_similarity_threshold=0.75,
        rename_same_dir_only=True,
    )


@pytest.mark.asyncio
async def test_get_sha256_from_metadata(mock_storage):
    mock_storage.get_metadata.return_value = {"sha256": "abc123def456"}

    sha = await get_sha256(mock_storage, "path/to/file.pdf")
    assert sha == "abc123def456"
    mock_storage.get_metadata.assert_called_once()
    mock_storage.download_document_stream.assert_not_called()


@pytest.mark.asyncio
async def test_get_sha256_compute_when_missing(mock_storage):
    mock_storage.get_metadata.return_value = {}
    mock_stream = AsyncMock()
    mock_storage.download_document_stream.return_value = mock_stream
    mock_storage.compute_sha256.return_value = "computed-sha-999"

    sha = await get_sha256(mock_storage, "new/file.bin")
    assert sha == "computed-sha-999"

    mock_storage.download_document_stream.assert_called_once_with(document_name="new/file.bin", chunk_size=8192 * 4)
    mock_storage.compute_sha256.assert_called_once_with(source=mock_stream, chunk_size=8192 * 4)


@pytest.mark.asyncio
async def test_gather_sha256_parallel(mock_storage):
    mock_storage.get_metadata.side_effect = [
        {"sha256": "sha1"},
        {"sha256": "sha2"},
        {},
    ]
    mock_storage.compute_sha256.return_value = "sha3-computed"

    shas = await gather_sha256(mock_storage, ["f1", "f2", "f3"])
    assert shas == ["sha1", "sha2", "sha3-computed"]


@pytest.mark.asyncio
@patch("src.services.workflows.activities.compute_diff.create_file_service")
async def test_create_sha256_diff_new_and_deleted(
    mock_create_service, mock_file_service, mock_storage, sample_compute_input
):
    mock_create_service.return_value = mock_file_service

    # Existing files in DB
    existing_files = [
        File(id=uuid4(), filename="report-v1.pdf", bucket_path="old/report-v1.pdf"),
        File(id=uuid4(), filename="secret.txt", bucket_path="old/secret.txt"),
    ]
    mock_file_service.list_files.return_value = existing_files

    # SHA simulation
    mock_storage.get_metadata.side_effect = [
        {"sha256": "old-sha-report"},  # report-v1.pdf
        {"sha256": "old-sha-secret"},  # secret.txt
        {},  # staging/report-v2.pdf
        {},  # staging/notes/old.txt
    ]
    mock_storage.compute_sha256.side_effect = ["new-sha-report-v2", "new-sha-old-txt"]

    result = await create_diff(sample_compute_input)

    assert len(result.new) == 2
    assert {f.filename for f in result.new} == {"report-v2.pdf", "notes/old.txt"}

    assert len(result.deleted) == 2
    assert {d.filename for d in result.deleted} == {"report-v1.pdf", "secret.txt"}

    assert len(result.changed) == 0
    assert len(result.unchanged) == 0
    assert len(result.renamed) == 0

    # Optional — verify calls
    mock_create_service.assert_called_once()
    mock_file_service.list_files.assert_called_once_with(
        project_id=UUID(sample_compute_input.project_id),
        include_deleted=False,
        file_type=FileTypeEnum.DOCUMENT,
        project_version=sample_compute_input.project_version,
        page_size=None,
    )


@pytest.mark.asyncio
@patch("src.services.workflows.activities.compute_diff.create_file_service")
async def test_create_sha256_diff_unchanged_and_changed(
    mock_create_service, mock_file_service, mock_storage, sample_compute_input
):
    mock_create_service.return_value = mock_file_service

    file_id_same = uuid4()
    file_id_changed = uuid4()

    # Existing files in DB
    existing_files = [
        File(id=file_id_same, filename="readme.md", bucket_path="docs/readme.md"),
        File(id=file_id_changed, filename="data.csv", bucket_path="data/old.csv"),
    ]
    mock_file_service.list_files.return_value = existing_files

    # SHA simulation
    mock_storage.get_metadata.side_effect = lambda **kwargs: {
        "docs/readme.md": {"sha256": "same-sha"},
        "data/old.csv": {"sha256": "old-sha-csv"},
        "staging/readme.md": {"sha256": "same-sha"},
        "staging/data.csv": {"sha256": "new-sha-csv"},
    }.get(kwargs["document_name"], {})

    # Add matching file to input
    sample_compute_input.files.append(
        SingleFileResult(
            filename="readme.md",
            bucket_path="staging/readme.md",
            action=ActionEnum.UNZIP,
            success=True,
        )
    )
    sample_compute_input.files.append(
        SingleFileResult(
            filename="data.csv",
            bucket_path="staging/data.csv",
            action=ActionEnum.UNZIP,
            success=True,
        )
    )

    result = await create_diff(sample_compute_input)

    assert len(result.unchanged) == 1
    assert result.unchanged[0].filename == "readme.md"
    assert result.unchanged[0].file_id == str(file_id_same)

    assert len(result.changed) == 1
    assert result.changed[0].file_id == str(file_id_changed)
    assert result.changed[0].source_sha == "new-sha-csv"
    assert result.changed[0].target_sha == "old-sha-csv"


@pytest.mark.asyncio
@patch("src.services.workflows.activities.compute_diff.create_file_service")
async def test_create_sha256_diff_detects_rename(
    mock_create_service, mock_file_service, mock_storage, sample_compute_input
):
    mock_create_service.return_value = mock_file_service

    file_id_renamed = uuid4()

    # Existing files in DB
    existing_files = [
        File(
            id=file_id_renamed,
            filename="old-report.pdf",
            bucket_path="docs/old-report.pdf",
        ),
    ]
    mock_file_service.list_files.return_value = existing_files

    # Same SHA → rename candidate
    mock_storage.get_metadata.side_effect = [
        {"sha256": "sha-abc123"},  # old-report.pdf
        {"sha256": "sha-abc123"},  # old-report-v2.pdf
    ]

    # Input has renamed file
    sample_compute_input.files = [
        SingleFileResult(
            filename="old-report-v2.pdf",
            bucket_path="staging/old-report-v2.pdf",
            success=True,
            action=ActionEnum.UNZIP,
        )
    ]

    result = await create_diff(sample_compute_input)

    assert len(result.new) == 0
    assert len(result.renamed) == 1
    r = result.renamed[0]
    assert r.file_id == str(file_id_renamed)
    assert r.old_name == "old-report.pdf"
    assert r.new_name == "old-report-v2.pdf"
    assert r.sha == "sha-abc123"


@pytest.mark.asyncio
@patch("src.services.workflows.activities.compute_diff.create_file_service")
async def test_create_sha256_diff_rename_threshold_too_low(
    mock_create_service, mock_file_service, mock_storage, sample_compute_input
):
    mock_create_service.return_value = mock_file_service

    # Existing files in DB
    existing_files = [
        File(id=uuid4(), filename="photo.jpg", bucket_path="img/photo.jpg"),
    ]
    mock_file_service.list_files.return_value = existing_files

    mock_storage.get_metadata.side_effect = [
        {"sha256": "same-sha"},
        {"sha256": "same-sha"},
    ]

    sample_compute_input.files = [
        SingleFileResult(
            filename="pic.jpeg",
            bucket_path="staging/pic.jpeg",
            action=ActionEnum.UNZIP,
            success=True,
        ),
    ]
    sample_compute_input.rename_similarity_threshold = 0.9

    result = await create_diff(sample_compute_input)

    assert len(result.renamed) == 0
    assert len(result.new) == 1
    assert len(result.deleted) == 1


@pytest.mark.asyncio
@patch("src.services.workflows.activities.compute_diff.create_file_service")
async def test_create_sha256_diff_ewms_filename_based_duplicate_detection(
    mock_create_service, mock_file_service, mock_storage
):
    """EWMS files use filename-based duplicate detection (no SHA computation)."""
    mock_create_service.return_value = mock_file_service

    project_id = uuid4()
    existing_file_id_1 = uuid4()
    existing_file_id_2 = uuid4()
    mock_file_service.list_files.return_value = [
        File(
            id=existing_file_id_1,
            filename="E1111.pdf",
            bucket_path="ewms/project/files/v1/E1111.pdf",
        ),
        File(
            id=existing_file_id_2,
            filename="E2222.pdf",
            bucket_path="ewms/project/files/v1/E2222.pdf",
        ),
    ]

    result = await create_diff(
        ComputeDiffInput(
            project_id=str(project_id),
            zip_file_id=str(uuid4()),
            entry_file_type=FileTypeEnum.EWMS_DOCUMENT.value,
            files=[
                SingleFileResult(
                    filename="E3333.pdf",  # New file
                    bucket_path="tmp/project/E3333.pdf",
                    success=True,
                    action=ActionEnum.UNZIP,
                ),
                SingleFileResult(
                    filename="E4444.pdf",  # New file
                    bucket_path="tmp/project/E4444.pdf",
                    success=True,
                    action=ActionEnum.UNZIP,
                ),
                SingleFileResult(
                    filename="E1111.pdf",  # Duplicate filename
                    bucket_path="tmp/project/E1111.pdf",
                    success=True,
                    action=ActionEnum.UNZIP,
                ),
            ],
        )
    )

    # New files (unique filenames)
    assert len(result.new) == 2
    assert {file.filename for file in result.new} == {"E3333.pdf", "E4444.pdf"}
    assert all(file.sha is None for file in result.new)  # No SHA for EWMS

    # Duplicate files (duplicate filenames)
    assert len(result.duplicate) == 1
    assert result.duplicate[0].filename == "E1111.pdf"
    assert result.duplicate[0].existing_file_id == str(existing_file_id_1)
    assert result.duplicate[0].bucket_path == "tmp/project/E1111.pdf"

    # No other diff types for EWMS
    assert result.changed == []
    assert result.deleted == []
    assert result.renamed == []
    assert result.unchanged == []

    mock_file_service.list_files.assert_called_once_with(
        project_id=project_id,
        file_type=FileTypeEnum.EWMS_DOCUMENT.value,
        include_deleted=False,
        project_version=1,
        page_size=None,
    )
