from uuid import uuid4

import pytest

from src.models.db.db_models import ZipFile, ZipFileDiffEntry
from src.models.db.workflow_enum import ZipDiffKind
from src.models.schemas.approval_schema import FileChange, FileDiffResponse, NewFile, RenameChange, Unchanged
from src.services.zip_files.zip_file_service import ZipFileService
from src.utils.exceptions import WorkflowValidateDiffError
from tests.unit.conftest import MockStorageProviderService


@pytest.fixture
def service(db_session):
    return ZipFileService(
        db=db_session,
        storage_provider_service=MockStorageProviderService(),
    )


@pytest.mark.asyncio
async def test_get_zip_file_returns_latest_project_version_for_duplicate_id(service):
    project_id = uuid4()
    zip_file_id = uuid4()
    service.db.add_all(
        [
            ZipFile(
                id=zip_file_id,
                project_id=project_id,
                project_version=1,
                filename="archive.zip",
                bucket_path="zips/v1/archive.zip",
            ),
            ZipFile(
                id=zip_file_id,
                project_id=project_id,
                project_version=2,
                filename="archive.zip",
                bucket_path="zips/v2/archive.zip",
            ),
        ]
    )
    await service.db.commit()

    latest = await service.get_zip_file(zip_file_id)
    source = await service.get_zip_file(zip_file_id, project_version=1)

    assert latest is not None
    assert latest.project_version == 2
    assert source is not None
    assert source.project_version == 1


@pytest.mark.asyncio
async def test_persisted_new_zip_diff_allows_duplicate_content_sha(service):
    project_id = uuid4()
    zip_file = ZipFile(
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(zip_file)
    await service.db.flush()

    await service.persist_computed_diff(
        zip_file_id=zip_file.id,
        source_project_version=1,
        diff=FileDiffResponse(
            new=[
                NewFile(filename="a.pdf", bucket_path="tmp/a.pdf", sha="same-sha"),
                NewFile(filename="b.pdf", bucket_path="tmp/b.pdf", sha="same-sha"),
            ]
        ),
    )

    diff = await service.get_file_diff(zip_file.id)
    assert [entry.filename for entry in diff.new] == ["a.pdf", "b.pdf"]
    assert [entry.sha for entry in diff.new] == ["same-sha", "same-sha"]


@pytest.mark.asyncio
async def test_get_file_diff_rejects_incomplete_persisted_rows(service):
    project_id = uuid4()
    zip_file = ZipFile(
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(zip_file)
    await service.db.flush()

    service.db.add(
        ZipFileDiffEntry(
            zip_file_id=zip_file.id,
            project_version=zip_file.project_version,
            entry_key="a.pdf",
            computed_kind=ZipDiffKind.NEW,
            decision_kind=ZipDiffKind.NEW,
            filename="a.pdf",
            sha="sha",
        )
    )
    await service.db.commit()

    with pytest.raises(ValueError, match="bucket_path"):
        await service.get_file_diff(zip_file.id)


@pytest.mark.asyncio
async def test_get_file_diff_reads_requested_project_version(service):
    project_id = uuid4()
    zip_file_id = uuid4()
    service.db.add_all(
        [
            ZipFile(
                id=zip_file_id,
                project_id=project_id,
                project_version=1,
                filename="archive.zip",
                bucket_path="zips/v1/archive.zip",
            ),
            ZipFile(
                id=zip_file_id,
                project_id=project_id,
                project_version=2,
                filename="archive.zip",
                bucket_path="zips/v2/archive.zip",
            ),
            ZipFileDiffEntry(
                zip_file_id=zip_file_id,
                project_version=1,
                entry_key="source-only.pdf",
                computed_kind=ZipDiffKind.NEW,
                decision_kind=ZipDiffKind.NEW,
                filename="source-only.pdf",
                bucket_path="tmp/source-only.pdf",
                sha="source-sha",
            ),
        ]
    )
    await service.db.commit()

    latest_diff = await service.get_file_diff(zip_file_id)
    source_diff = await service.get_file_diff(zip_file_id, project_version=1)

    assert latest_diff.new == []
    assert [entry.filename for entry in source_diff.new] == ["source-only.pdf"]


@pytest.mark.asyncio
async def test_set_file_diff_rejects_rename_decision_becoming_changed(service):
    project_id = uuid4()
    file_id = uuid4()
    zip_file = ZipFile(
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(zip_file)
    await service.db.flush()

    await service.persist_computed_diff(
        zip_file_id=zip_file.id,
        source_project_version=1,
        diff=FileDiffResponse(
            renamed=[
                RenameChange(
                    file_id=file_id,
                    old_name="old.pdf",
                    new_name="new.pdf",
                    sha="same-sha",
                )
            ]
        ),
    )

    with pytest.raises(WorkflowValidateDiffError, match="Illegal diff modification"):
        await service.set_file_diff(
            zip_file.id,
            FileDiffResponse(
                changed=[
                    FileChange(
                        file_id=file_id,
                        filename="new.pdf",
                        bucket_path="tmp/new.pdf",
                        source_sha="old-sha",
                        target_sha="new-sha",
                    )
                ]
            ),
        )


@pytest.mark.asyncio
async def test_set_file_diff_rejects_tampered_changed_bucket_path(service):
    project_id = uuid4()
    file_id = uuid4()
    zip_file = ZipFile(
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(zip_file)
    await service.db.flush()

    await service.persist_computed_diff(
        zip_file_id=zip_file.id,
        source_project_version=1,
        diff=FileDiffResponse(
            changed=[
                FileChange(
                    file_id=file_id,
                    filename="document.pdf",
                    bucket_path="safe/document.pdf",
                    source_sha="source-sha",
                    target_sha="target-sha",
                )
            ]
        ),
    )

    with pytest.raises(WorkflowValidateDiffError, match="bucket_path cannot be changed"):
        await service.set_file_diff(
            zip_file.id,
            FileDiffResponse(
                changed=[
                    FileChange(
                        file_id=file_id,
                        filename="document.pdf",
                        bucket_path="attacker/other.pdf",
                        source_sha="source-sha",
                        target_sha="target-sha",
                    )
                ]
            ),
        )

    diff = await service.get_file_diff(zip_file.id)
    assert diff.changed[0].bucket_path == "safe/document.pdf"


@pytest.mark.asyncio
async def test_set_file_diff_rejects_tampered_new_hash(service):
    project_id = uuid4()
    zip_file = ZipFile(
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(zip_file)
    await service.db.flush()

    await service.persist_computed_diff(
        zip_file_id=zip_file.id,
        source_project_version=1,
        diff=FileDiffResponse(new=[NewFile(filename="new.pdf", bucket_path="safe/new.pdf", sha="computed-sha")]),
    )

    with pytest.raises(WorkflowValidateDiffError, match="sha cannot be changed"):
        await service.set_file_diff(
            zip_file.id,
            FileDiffResponse(new=[NewFile(filename="new.pdf", bucket_path="safe/new.pdf", sha="client-sha")]),
        )

    diff = await service.get_file_diff(zip_file.id)
    assert diff.new[0].sha == "computed-sha"


@pytest.mark.asyncio
async def test_set_file_diff_uses_existing_hash_for_changed_to_unchanged(service):
    project_id = uuid4()
    file_id = uuid4()
    zip_file = ZipFile(
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(zip_file)
    await service.db.flush()

    await service.persist_computed_diff(
        zip_file_id=zip_file.id,
        source_project_version=1,
        diff=FileDiffResponse(
            changed=[
                FileChange(
                    file_id=file_id,
                    filename="document.pdf",
                    bucket_path="safe/document.pdf",
                    source_sha="uploaded-sha",
                    target_sha="existing-sha",
                )
            ]
        ),
    )

    diff = await service.set_file_diff(
        zip_file.id,
        FileDiffResponse(unchanged=[Unchanged(file_id=file_id, filename="document.pdf", sha="existing-sha")]),
    )

    assert len(diff.unchanged) == 1
    assert diff.unchanged[0].sha == "existing-sha"


@pytest.mark.asyncio
async def test_set_file_diff_rejects_tampered_changed_to_unchanged_hash(service):
    project_id = uuid4()
    file_id = uuid4()
    zip_file = ZipFile(
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(zip_file)
    await service.db.flush()

    await service.persist_computed_diff(
        zip_file_id=zip_file.id,
        source_project_version=1,
        diff=FileDiffResponse(
            changed=[
                FileChange(
                    file_id=file_id,
                    filename="document.pdf",
                    bucket_path="safe/document.pdf",
                    source_sha="uploaded-sha",
                    target_sha="existing-sha",
                )
            ]
        ),
    )

    with pytest.raises(WorkflowValidateDiffError, match="sha cannot be changed"):
        await service.set_file_diff(
            zip_file.id,
            FileDiffResponse(unchanged=[Unchanged(file_id=file_id, filename="document.pdf", sha="uploaded-sha")]),
        )


@pytest.mark.asyncio
async def test_set_file_diff_uses_server_owned_fields_for_renamed_to_unchanged(service):
    project_id = uuid4()
    file_id = uuid4()
    zip_file = ZipFile(
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(zip_file)
    await service.db.flush()

    await service.persist_computed_diff(
        zip_file_id=zip_file.id,
        source_project_version=1,
        diff=FileDiffResponse(
            renamed=[
                RenameChange(
                    file_id=file_id,
                    old_name="old.pdf",
                    new_name="new.pdf",
                    sha="same-sha",
                )
            ]
        ),
    )

    diff = await service.set_file_diff(
        zip_file.id,
        FileDiffResponse(unchanged=[Unchanged(file_id=file_id, filename="old.pdf", sha="same-sha")]),
    )

    assert len(diff.unchanged) == 1
    assert diff.unchanged[0].filename == "old.pdf"


@pytest.mark.asyncio
async def test_set_file_diff_allows_false_positive_rename_as_new_and_unchanged(service):
    project_id = uuid4()
    file_id = uuid4()
    zip_file = ZipFile(
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(zip_file)
    await service.db.flush()

    await service.persist_computed_diff(
        zip_file_id=zip_file.id,
        source_project_version=1,
        diff=FileDiffResponse(
            renamed=[
                RenameChange(
                    file_id=file_id,
                    old_name="old.pdf",
                    new_name="new.pdf",
                    sha="same-sha",
                    bucket_path="safe/new.pdf",
                )
            ]
        ),
    )

    diff = await service.set_file_diff(
        zip_file.id,
        FileDiffResponse(
            new=[NewFile(filename="new.pdf", bucket_path="safe/new.pdf", sha="same-sha")],
            unchanged=[Unchanged(file_id=file_id, filename="old.pdf", sha="same-sha")],
        ),
    )

    assert len(diff.new) == 1
    assert diff.new[0].filename == "new.pdf"
    assert diff.new[0].bucket_path == "safe/new.pdf"
    assert len(diff.unchanged) == 1
    assert diff.unchanged[0].filename == "old.pdf"


@pytest.mark.asyncio
async def test_set_file_diff_rejects_tampered_false_positive_rename_bucket_path(service):
    project_id = uuid4()
    file_id = uuid4()
    zip_file = ZipFile(
        project_id=project_id,
        filename="archive.zip",
        bucket_path="zips/archive.zip",
    )
    service.db.add(zip_file)
    await service.db.flush()

    await service.persist_computed_diff(
        zip_file_id=zip_file.id,
        source_project_version=1,
        diff=FileDiffResponse(
            renamed=[
                RenameChange(
                    file_id=file_id,
                    old_name="old.pdf",
                    new_name="new.pdf",
                    sha="same-sha",
                    bucket_path="safe/new.pdf",
                )
            ]
        ),
    )

    with pytest.raises(WorkflowValidateDiffError, match="bucket_path cannot be changed"):
        await service.set_file_diff(
            zip_file.id,
            FileDiffResponse(new=[NewFile(filename="new.pdf", bucket_path="attacker/new.pdf", sha="same-sha")]),
        )
