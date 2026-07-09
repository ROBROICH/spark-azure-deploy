from collections.abc import Sequence
from typing import cast
from uuid import UUID

from sqlalchemy import and_, delete
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from src.models.db.db_models import ZipFile, ZipFileDiffEntry
from src.models.db.workflow_enum import WorkflowStatusEnum, ZipApprovalStatus, ZipDiffKind, ZipFileTypeEnum
from src.models.schemas.approval_schema import (
    DeleteChange,
    FileChange,
    FileDiffResponse,
    NewFile,
    RenameChange,
    Unchanged,
)
from src.services.storage_provider.storage_provider_base_service import (
    BaseStorageProviderService,
)
from src.services.temporal.temporal_utils import validate_user_diff
from src.utils.exceptions import WorkflowValidateDiffError


class ZipFileService:
    """Service class for querying zip file metadata."""

    def __init__(
        self,
        db: AsyncSession,
        storage_provider_service: BaseStorageProviderService,
    ):
        self.db = db
        self.storage_provider_service = storage_provider_service

    async def get_zip_file(self, zip_file_id: UUID, project_version: int | None = None) -> ZipFile | None:
        """Retrieve a zip file by its UUID."""
        query = select(ZipFile).where(ZipFile.id == zip_file_id)
        if project_version is not None:
            query = query.where(ZipFile.project_version == project_version)
        else:
            query = query.order_by(ZipFile.project_version.desc()).limit(1)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def update_zip_workflow_status(
        self,
        zip_file_id: UUID,
        status: WorkflowStatusEnum,
    ) -> ZipFile:
        """Update and persist workflow status for a ZIP file row."""
        result = await self.db.execute(
            select(ZipFile).where(ZipFile.id == zip_file_id).order_by(ZipFile.project_version.desc())
        )
        zip_files = list(result.scalars().all())
        if not zip_files:
            raise FileNotFoundError(f"Zip file '{zip_file_id}' not found.")

        for zip_file in zip_files:
            zip_file.workflow_status = status
        await self.db.commit()
        await self.db.refresh(zip_files[0])
        return zip_files[0]

    async def update_zip_approval_status(
        self,
        zip_file_id: UUID,
        status: ZipApprovalStatus | None,
        *,
        error: str | None = None,
    ) -> ZipFile:
        """Update and persist business approval status for a ZIP file row."""
        result = await self.db.execute(
            select(ZipFile).where(ZipFile.id == zip_file_id).order_by(ZipFile.project_version.desc())
        )
        zip_files = list(result.scalars().all())
        if not zip_files:
            raise FileNotFoundError(f"Zip file '{zip_file_id}' not found.")

        for zip_file in zip_files:
            zip_file.approval_status = status
            zip_file.approval_error = error
        await self.db.commit()
        await self.db.refresh(zip_files[0])
        return zip_files[0]

    @staticmethod
    def _entry_key(kind: ZipDiffKind, entry: NewFile | DeleteChange | FileChange | RenameChange | Unchanged) -> str:
        if kind == ZipDiffKind.NEW:
            return entry.filename
        return str(entry.file_id)

    @staticmethod
    def _entry_from_schema(
        *,
        zip_file: ZipFile,
        kind: ZipDiffKind,
        entry: NewFile | DeleteChange | FileChange | RenameChange | Unchanged,
    ) -> ZipFileDiffEntry:
        if isinstance(entry, NewFile):
            return ZipFileDiffEntry(
                zip_file_id=zip_file.id,
                project_version=zip_file.project_version,
                entry_key=ZipFileService._entry_key(kind, entry),
                computed_kind=kind,
                decision_kind=kind,
                filename=entry.filename,
                bucket_path=entry.bucket_path,
                sha=entry.sha,
            )
        if isinstance(entry, DeleteChange):
            return ZipFileDiffEntry(
                zip_file_id=zip_file.id,
                project_version=zip_file.project_version,
                entry_key=ZipFileService._entry_key(kind, entry),
                computed_kind=kind,
                decision_kind=kind,
                file_id=entry.file_id,
                filename=entry.filename,
                sha=entry.sha,
            )
        if isinstance(entry, FileChange):
            return ZipFileDiffEntry(
                zip_file_id=zip_file.id,
                project_version=zip_file.project_version,
                entry_key=ZipFileService._entry_key(kind, entry),
                computed_kind=kind,
                decision_kind=kind,
                file_id=entry.file_id,
                filename=entry.filename,
                bucket_path=entry.bucket_path,
                source_sha=entry.source_sha,
                target_sha=entry.target_sha,
            )
        if isinstance(entry, RenameChange):
            return ZipFileDiffEntry(
                zip_file_id=zip_file.id,
                project_version=zip_file.project_version,
                entry_key=ZipFileService._entry_key(kind, entry),
                computed_kind=kind,
                decision_kind=kind,
                file_id=entry.file_id,
                filename=entry.new_name,
                old_name=entry.old_name,
                new_name=entry.new_name,
                bucket_path=entry.bucket_path,
                sha=entry.sha,
            )
        return ZipFileDiffEntry(
            zip_file_id=zip_file.id,
            project_version=zip_file.project_version,
            entry_key=ZipFileService._entry_key(kind, entry),
            computed_kind=kind,
            decision_kind=kind,
            file_id=entry.file_id,
            filename=entry.filename,
            sha=entry.sha,
        )

    async def persist_computed_diff(
        self,
        *,
        zip_file_id: UUID,
        source_project_version: int,
        diff: FileDiffResponse,
    ) -> None:
        """Persist a freshly computed diff and reset decisions to computed values."""
        zip_file = await self.get_zip_file(zip_file_id, project_version=source_project_version)
        if zip_file is None:
            raise FileNotFoundError(f"Zip file '{zip_file_id}' not found.")

        await self.db.execute(
            delete(ZipFileDiffEntry).where(
                ZipFileDiffEntry.zip_file_id == zip_file.id,
                ZipFileDiffEntry.project_version == zip_file.project_version,
            )
        )
        rows: list[ZipFileDiffEntry] = []
        for kind, entries in (
            (ZipDiffKind.NEW, diff.new),
            (ZipDiffKind.DELETED, diff.deleted),
            (ZipDiffKind.CHANGED, diff.changed),
            (ZipDiffKind.RENAMED, diff.renamed),
            (ZipDiffKind.UNCHANGED, diff.unchanged),
        ):
            rows.extend(self._entry_from_schema(zip_file=zip_file, kind=kind, entry=entry) for entry in entries)

        zip_file.source_project_version = source_project_version
        zip_file.approval_error = None
        if rows:
            self.db.add_all(rows)
        await self.db.commit()

    @staticmethod
    def _rows_to_diff(rows: Sequence[ZipFileDiffEntry], *, use_decision: bool) -> FileDiffResponse:
        def require(value: str | UUID | None, field: str, row: ZipFileDiffEntry) -> str | UUID:
            if value is None or value == "":
                raise ValueError(f"ZIP diff row {row.id} is missing required {field} for {row.decision_kind}")
            return value

        diff = FileDiffResponse()
        for row in rows:
            kind = row.decision_kind if use_decision else row.computed_kind
            if kind == ZipDiffKind.NEW:
                if row.computed_kind == ZipDiffKind.RENAMED:
                    file_id = cast(UUID, require(row.file_id, "file_id", row))
                    diff.unchanged.append(
                        Unchanged(
                            file_id=file_id,
                            filename=str(require(row.old_name, "old_name", row)),
                            sha=str(require(row.sha, "sha", row)),
                        )
                    )
                diff.new.append(
                    NewFile(
                        filename=row.filename,
                        bucket_path=str(require(row.bucket_path, "bucket_path", row)),
                        sha=str(require(row.sha, "sha", row)),
                    )
                )
            elif kind == ZipDiffKind.DELETED:
                file_id = cast(UUID, require(row.file_id, "file_id", row))
                diff.deleted.append(
                    DeleteChange(
                        file_id=file_id,
                        filename=row.filename,
                        sha=str(require(row.sha, "sha", row)),
                    )
                )
            elif kind == ZipDiffKind.CHANGED:
                file_id = cast(UUID, require(row.file_id, "file_id", row))
                diff.changed.append(
                    FileChange(
                        file_id=file_id,
                        bucket_path=str(require(row.bucket_path, "bucket_path", row)),
                        filename=row.filename,
                        source_sha=str(require(row.source_sha, "source_sha", row)),
                        target_sha=str(require(row.target_sha, "target_sha", row)),
                    )
                )
            elif kind == ZipDiffKind.RENAMED:
                file_id = cast(UUID, require(row.file_id, "file_id", row))
                diff.renamed.append(
                    RenameChange(
                        file_id=file_id,
                        old_name=str(require(row.old_name, "old_name", row)),
                        new_name=str(require(row.new_name, "new_name", row)),
                        sha=str(require(row.sha, "sha", row)),
                    )
                )
            elif kind == ZipDiffKind.UNCHANGED:
                file_id = cast(UUID, require(row.file_id, "file_id", row))
                sha = row.target_sha if row.computed_kind == ZipDiffKind.CHANGED else row.sha
                diff.unchanged.append(
                    Unchanged(
                        file_id=file_id,
                        filename=row.filename,
                        sha=str(require(sha, "sha", row)),
                    )
                )
        return diff

    @staticmethod
    def _raise_if_changed(field: str, expected: object, submitted: object) -> None:
        if expected != submitted:
            raise WorkflowValidateDiffError(f"{field} cannot be changed")

    @classmethod
    def _validate_submitted_decision_entry(
        cls,
        *,
        row: ZipFileDiffEntry,
        entry: NewFile | DeleteChange | FileChange | RenameChange | Unchanged,
    ) -> None:
        """Reject client changes to server-computed diff fields.

        The approval payload is allowed to choose a decision kind only. Storage
        paths, hashes, file ids, and computed names remain owned by the persisted
        computed diff row.
        """
        if isinstance(entry, NewFile):
            expected_filename = row.new_name if row.computed_kind == ZipDiffKind.RENAMED else row.filename
            cls._raise_if_changed("filename", expected_filename, entry.filename)
            cls._raise_if_changed("bucket_path", row.bucket_path, entry.bucket_path)
            cls._raise_if_changed("sha", row.sha, entry.sha)
            return

        if isinstance(entry, FileChange):
            cls._raise_if_changed("file_id", row.file_id, entry.file_id)
            cls._raise_if_changed("filename", row.filename, entry.filename)
            cls._raise_if_changed("bucket_path", row.bucket_path, entry.bucket_path)
            cls._raise_if_changed("source_sha", row.source_sha, entry.source_sha)
            cls._raise_if_changed("target_sha", row.target_sha, entry.target_sha)
            return

        if isinstance(entry, DeleteChange):
            cls._raise_if_changed("file_id", row.file_id, entry.file_id)
            cls._raise_if_changed("filename", row.filename, entry.filename)
            cls._raise_if_changed("sha", row.sha, entry.sha)
            return

        if isinstance(entry, RenameChange):
            cls._raise_if_changed("file_id", row.file_id, entry.file_id)
            cls._raise_if_changed("old_name", row.old_name, entry.old_name)
            cls._raise_if_changed("new_name", row.new_name, entry.new_name)
            cls._raise_if_changed("sha", row.sha, entry.sha)
            return

        cls._raise_if_changed("file_id", row.file_id, entry.file_id)
        expected_filename = row.old_name if row.computed_kind == ZipDiffKind.RENAMED else row.filename
        expected_sha = row.target_sha if row.computed_kind == ZipDiffKind.CHANGED else row.sha
        cls._raise_if_changed("filename", expected_filename, entry.filename)
        cls._raise_if_changed("sha", expected_sha, entry.sha)

    @staticmethod
    def _apply_server_owned_decision_projection(row: ZipFileDiffEntry, kind: ZipDiffKind) -> None:
        """Adjust derived display fields without trusting client-submitted values."""
        if row.computed_kind != ZipDiffKind.RENAMED:
            return
        if kind == ZipDiffKind.UNCHANGED and row.old_name is not None:
            row.filename = row.old_name
        elif (kind == ZipDiffKind.NEW and row.new_name is not None) or (
            kind == ZipDiffKind.RENAMED and row.new_name is not None
        ):
            row.filename = row.new_name

    async def _get_diff_rows(
        self,
        zip_file_id: UUID,
        project_version: int | None = None,
    ) -> Sequence[ZipFileDiffEntry]:
        zip_file = await self.get_zip_file(zip_file_id, project_version=project_version)
        if zip_file is None:
            raise FileNotFoundError(f"Zip file '{zip_file_id}' not found.")
        result = await self.db.execute(
            select(ZipFileDiffEntry)
            .where(
                ZipFileDiffEntry.zip_file_id == zip_file.id,
                ZipFileDiffEntry.project_version == zip_file.project_version,
            )
            .order_by(ZipFileDiffEntry.filename, ZipFileDiffEntry.id)
        )
        return result.scalars().all()

    async def get_file_diff(
        self,
        zip_file_id: UUID,
        *,
        use_decision: bool = True,
        project_version: int | None = None,
    ) -> FileDiffResponse:
        """Return persisted computed or user-decided ZIP diff."""
        return self._rows_to_diff(
            await self._get_diff_rows(zip_file_id, project_version=project_version),
            use_decision=use_decision,
        )

    async def set_file_diff(self, zip_file_id: UUID, diff: FileDiffResponse) -> FileDiffResponse:
        """Persist user reconciliation choices for an existing computed diff."""
        zip_file = await self.get_zip_file(zip_file_id)
        if zip_file is None:
            raise FileNotFoundError(f"Zip file '{zip_file_id}' not found.")
        if zip_file.approval_status == ZipApprovalStatus.APPROVING:
            raise ValueError("ZIP approval is already locked for version creation")

        rows = list(await self._get_diff_rows(zip_file_id, project_version=zip_file.project_version))
        computed_diff = self._rows_to_diff(rows, use_decision=False)
        await validate_user_diff(current_diff=computed_diff, user_diff=diff)
        row_keys = {row.entry_key for row in rows}
        renamed_row_key_by_new_name = {
            row.new_name: row.entry_key
            for row in rows
            if row.computed_kind == ZipDiffKind.RENAMED and row.new_name is not None
        }

        decision_by_key: dict[
            str, tuple[ZipDiffKind, NewFile | DeleteChange | FileChange | RenameChange | Unchanged]
        ] = {}
        for kind, entries in (
            (ZipDiffKind.NEW, diff.new),
            (ZipDiffKind.DELETED, diff.deleted),
            (ZipDiffKind.CHANGED, diff.changed),
            (ZipDiffKind.RENAMED, diff.renamed),
            (ZipDiffKind.UNCHANGED, diff.unchanged),
        ):
            for entry in entries:
                key = self._entry_key(kind, entry)
                if kind == ZipDiffKind.NEW and key not in row_keys:
                    key = renamed_row_key_by_new_name.get(entry.filename, key)
                if key in decision_by_key:
                    existing_kind, _existing_entry = decision_by_key[key]
                    if {existing_kind, kind} == {ZipDiffKind.NEW, ZipDiffKind.UNCHANGED}:
                        if existing_kind == ZipDiffKind.NEW:
                            continue
                        decision_by_key[key] = (kind, entry)
                        continue
                decision_by_key[key] = (kind, entry)

        for row in rows:
            if row.entry_key in decision_by_key:
                kind, entry = decision_by_key[row.entry_key]
                self._validate_submitted_decision_entry(row=row, entry=entry)
                row.decision_kind = kind
                self._apply_server_owned_decision_projection(row, kind)
        await self.db.commit()
        return await self.get_file_diff(zip_file_id, use_decision=True)

    async def list_zip_files(
        self,
        project_id: UUID | None = None,
        project_version: int | None = None,
        file_type: ZipFileTypeEnum | None = None,
        workflow_status: WorkflowStatusEnum | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> Sequence[ZipFile]:
        """Filtered list of zip files, ordered by created_at desc."""
        offset = (page - 1) * page_size

        conditions = []

        if project_id is not None:
            conditions.append(ZipFile.project_id == project_id)

        if project_version is not None:
            conditions.append(ZipFile.project_version == project_version)

        if file_type is not None:
            conditions.append(ZipFile.type == file_type)

        if workflow_status is not None:
            conditions.append(ZipFile.workflow_status == workflow_status)

        query = select(ZipFile).order_by(ZipFile.created_at.desc()).offset(offset).limit(page_size)

        if conditions:
            query = query.where(and_(*conditions))

        result = await self.db.execute(query)
        return result.scalars().all()
