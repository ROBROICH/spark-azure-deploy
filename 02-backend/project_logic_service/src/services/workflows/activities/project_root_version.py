"""PLS-owned project aggregate-root version helpers."""

from uuid import UUID

from sqlalchemy import Integer, bindparam, delete, func, insert, select
from sqlalchemy.ext.asyncio import AsyncSession
from temporalio import activity

from src.models.db import database
from src.models.db_models import Applicant, Project


async def _source_project_applicant_id(
    session: AsyncSession,
    *,
    project_id: UUID,
    source_version: int,
) -> UUID | None:
    result = await session.execute(
        select(Project.applicant_id).where(
            Project.id == project_id,
            Project.project_version == source_version,
            Project.is_deleted.is_(False),
        )
    )
    row = result.first()
    if row is None:
        raise RuntimeError(f"Project {project_id} does not exist at version {source_version}")
    return row[0]


async def _versioned_row_exists(
    session: AsyncSession,
    *,
    table,
    row_id: UUID,
    project_id: UUID,
    project_version: int,
    require_active: bool,
) -> bool:
    clauses = [
        table.c.id == row_id,
        table.c.project_version == project_version,
    ]
    if table.name != "project":
        clauses.append(table.c.project_id == project_id)
    if require_active:
        clauses.append(table.c.is_deleted.is_(False))

    result = await session.execute(select(func.count()).select_from(table).where(*clauses))
    return int(result.scalar_one()) > 0


async def _copy_versioned_row(
    session: AsyncSession,
    *,
    table,
    row_id: UUID,
    project_id: UUID,
    source_version: int,
    target_version: int,
) -> int:
    if await _versioned_row_exists(
        session,
        table=table,
        row_id=row_id,
        project_id=project_id,
        project_version=target_version,
        require_active=False,
    ):
        return 0

    if not await _versioned_row_exists(
        session,
        table=table,
        row_id=row_id,
        project_id=project_id,
        project_version=source_version,
        require_active=True,
    ):
        raise RuntimeError(f"{table.name} {row_id} does not exist at version {source_version}")

    source = table.alias(f"{table.name}_root_copy_source")
    target_column_names = [col.key for col in table.columns if col.key != "sys_period"]
    target_project_version = bindparam("target_project_version", value=target_version, type_=Integer())

    source_columns = []
    for col in table.columns:
        if col.key == "sys_period":
            continue
        if col.key == "project_id":
            source_columns.append(
                source.c.project_id if table.name == "project" else bindparam("project_id", value=project_id)
            )
        elif col.key == "project_version":
            source_columns.append(target_project_version)
        elif col.key == "is_deleted":
            source_columns.append(False)
        elif col.key in {"created_at", "updated_at"}:
            source_columns.append(func.now())
        else:
            source_columns.append(source.c[col.key])

    where_clauses = [
        source.c.id == row_id,
        source.c.project_version == bindparam("source_project_version", value=source_version, type_=Integer()),
        source.c.is_deleted.is_(False),
    ]
    if table.name != "project":
        where_clauses.append(source.c.project_id == bindparam("project_id", value=project_id))

    await session.execute(
        insert(table).from_select(
            target_column_names,
            select(*source_columns).select_from(source).where(*where_clauses),
            include_defaults=False,
        )
    )
    return 1


@activity.defn
async def copy_project_root_version(
    project_id: UUID,
    source_version: int,
    target_version: int,
    dry_run: bool,
) -> dict[str, int]:
    database._init_engine()
    async with database.AsyncSessionLocal() as session:
        applicant_id = await _source_project_applicant_id(
            session,
            project_id=project_id,
            source_version=source_version,
        )

        rows_to_copy = 1
        if applicant_id is not None:
            if not await _versioned_row_exists(
                session,
                table=Applicant.__table__,
                row_id=applicant_id,
                project_id=project_id,
                project_version=source_version,
                require_active=True,
            ):
                raise RuntimeError(f"Applicant {applicant_id} does not exist at version {source_version}")
            rows_to_copy += 1

        if dry_run:
            return {"copied": rows_to_copy}

        copied = 0
        try:
            if applicant_id is not None:
                copied += await _copy_versioned_row(
                    session,
                    table=Applicant.__table__,
                    row_id=applicant_id,
                    project_id=project_id,
                    source_version=source_version,
                    target_version=target_version,
                )
            copied += await _copy_versioned_row(
                session,
                table=Project.__table__,
                row_id=project_id,
                project_id=project_id,
                source_version=source_version,
                target_version=target_version,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    return {"copied": copied}


async def _delete_project_root_version(
    session: AsyncSession,
    *,
    project_id: UUID,
    target_version: int,
) -> dict[str, int]:
    result = await session.execute(
        select(Project.applicant_id).where(
            Project.id == project_id,
            Project.project_version == target_version,
        )
    )
    row = result.first()
    applicant_id = row[0] if row is not None else None

    project_result = await session.execute(
        delete(Project.__table__).where(
            Project.__table__.c.id == project_id,
            Project.__table__.c.project_version == target_version,
        )
    )
    project_deleted = int(project_result.rowcount or 0)

    if applicant_id is None or project_deleted == 0:
        return {"project": project_deleted, "applicant": 0}

    applicant_result = await session.execute(
        delete(Applicant.__table__).where(
            Applicant.__table__.c.id == applicant_id,
            Applicant.__table__.c.project_id == project_id,
            Applicant.__table__.c.project_version == target_version,
        )
    )
    return {"project": project_deleted, "applicant": int(applicant_result.rowcount or 0)}


@activity.defn
async def undo_project_root_version(
    project_id: UUID,
    target_version: int,
) -> dict[str, int]:
    database._init_engine()
    async with database.AsyncSessionLocal() as session:
        try:
            deleted = await _delete_project_root_version(
                session,
                project_id=project_id,
                target_version=target_version,
            )
            await session.commit()
        except Exception:
            await session.rollback()
            raise

    return deleted
