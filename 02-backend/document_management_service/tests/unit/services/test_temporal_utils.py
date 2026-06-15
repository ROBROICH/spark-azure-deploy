from uuid import uuid4

import pytest

from src.models.schemas.approval_schema import (
    DeleteChange,
    FileChange,
    FileDiffResponse,
    NewFile,
    RenameChange,
    Unchanged,
)
from src.services.temporal.temporal_utils import validate_user_diff
from src.utils.exceptions import WorkflowValidateDiffError


def make_diff(
    new: list[NewFile] | None = None,
    deleted: list[DeleteChange] | None = None,
    changed: list[FileChange] | None = None,
    renamed: list[RenameChange] | None = None,
    unchanged: list[Unchanged] | None = None,
):
    return FileDiffResponse(
        new=new or [],
        deleted=deleted or [],
        changed=changed or [],
        renamed=renamed or [],
        unchanged=unchanged or [],
    )


def new_file():
    return NewFile(filename="file.txt", bucket_path="bucket/path", sha=str(uuid4()))


def delete_change():
    fid = uuid4()
    return DeleteChange(file_id=fid, filename="deleted.txt", sha=str(uuid4()))


def file_change():
    fid = uuid4()
    return FileChange(
        file_id=fid,
        bucket_path="bucket/path",
        filename="file.txt",
        source_sha=str(uuid4()),
        target_sha=str(uuid4()),
    )


def rename_change():
    fid = uuid4()
    return RenameChange(file_id=fid, old_name="old.txt", new_name="new.txt", sha=str(uuid4()))


def unchanged():
    fid = uuid4()
    return Unchanged(file_id=fid, filename="unchanged.txt", sha=str(uuid4()))


async def test_valid_diff_no_changes():
    current = make_diff(
        deleted=[delete_change()],
        unchanged=[unchanged()],
    )

    user = current.model_copy()

    await validate_user_diff(current, user)  # should not raise


async def test_duplicate_identifier_in_same_diff():
    obj = delete_change()
    diff = make_diff(
        deleted=[obj],
        changed=[
            FileChange(
                file_id=obj.file_id,
                bucket_path=obj.bucket_path if hasattr(obj, "bucket_path") else "bucket/path",
                filename=obj.filename,
                source_sha=str(uuid4()),
                target_sha=str(uuid4()),
            )
        ],
    )

    with pytest.raises(WorkflowValidateDiffError, match="appears multiple times"):
        await validate_user_diff(diff, diff)


async def test_added_file_not_allowed():
    current = make_diff(
        unchanged=[unchanged()],
    )

    user = make_diff(
        unchanged=[unchanged()],
        deleted=[delete_change()],
    )

    with pytest.raises(WorkflowValidateDiffError, match="Files cannot be added"):
        await validate_user_diff(current, user)


async def test_removed_file_allowed():
    unchanged_model = unchanged()
    deleted_model = delete_change()

    current = make_diff(
        unchanged=[unchanged_model],
        deleted=[deleted_model],
    )

    user = make_diff(
        unchanged=[unchanged_model],
    )

    await validate_user_diff(current, user)  # should not raise


@pytest.mark.parametrize(
    "old_state,new_state",
    [
        ("changed", "unchanged"),
        ("deleted", "unchanged"),
        ("renamed", "unchanged"),
    ],
)
async def test_allowed_transitions(old_state, new_state):
    fid = uuid4()

    # current state objects
    current_map = {
        "changed": lambda: [
            FileChange(
                file_id=fid,
                bucket_path="bucket/path",
                filename="file.txt",
                source_sha="source-sha",
                target_sha="target-sha",
            )
        ],
        "deleted": lambda: [DeleteChange(file_id=fid, filename="del.txt", sha=str(uuid4()))],
        "renamed": lambda: [RenameChange(file_id=fid, old_name="old.txt", new_name="new.txt", sha=str(uuid4()))],
    }

    new_map = {
        "unchanged": lambda: [Unchanged(file_id=fid, filename="unchanged.txt", sha=str(uuid4()))],
        "changed": lambda: [
            FileChange(
                file_id=fid,
                bucket_path="bucket/path",
                filename="file.txt",
                source_sha=str(uuid4()),
                target_sha=str(uuid4()),
            )
        ],
        "new": lambda: [NewFile(filename="file.txt", bucket_path="bucket/path", sha=str(uuid4()))],
    }

    current = make_diff(**{old_state: current_map[old_state]()})
    user = make_diff(**{new_state: new_map[new_state]()})

    await validate_user_diff(current, user)  # should not raise


async def test_renamed_to_changed_not_allowed():
    fid = uuid4()
    current = make_diff(
        renamed=[RenameChange(file_id=fid, old_name="old.txt", new_name="new.txt", sha=str(uuid4()))],
    )
    user = make_diff(
        changed=[
            FileChange(
                file_id=fid,
                bucket_path="bucket/path",
                filename="new.txt",
                source_sha=str(uuid4()),
                target_sha=str(uuid4()),
            )
        ],
    )

    with pytest.raises(WorkflowValidateDiffError, match="Illegal diff modification"):
        await validate_user_diff(current, user)


async def test_renamed_to_new_with_old_file_unchanged_allowed():
    fid = uuid4()
    current = make_diff(
        renamed=[RenameChange(file_id=fid, old_name="old.txt", new_name="new.txt", sha="same-sha")],
    )
    user = make_diff(
        new=[NewFile(filename="new.txt", bucket_path="bucket/new.txt", sha="same-sha")],
        unchanged=[Unchanged(file_id=fid, filename="old.txt", sha="same-sha")],
    )

    await validate_user_diff(current, user)
