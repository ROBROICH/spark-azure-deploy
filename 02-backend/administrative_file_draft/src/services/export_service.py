"""Service layer for VAE DOCX/PDF export."""

import functools
from collections.abc import Callable
from dataclasses import dataclass
from uuid import UUID

import httpx
from anyio import to_thread
from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.config.settings import settings
from src.docx_export.converter import (
    UnoConversionError,
    convert_docx_to_pdf_with_unoserver,
    refresh_docx_with_unoserver,
)
from src.docx_export.generator import generate_vae_docx
from src.models.db_models import VaeNode


@dataclass(frozen=True)
class ProjectExportMetadata:
    """Project metadata required for export placeholder replacement."""

    name: str
    internal_project_number: str
    latest_version: int


async def export_project_docx(project_id: UUID, db: AsyncSession) -> bytes:
    """Generate and normalize a project DOCX via LibreOffice."""
    docx_bytes = await _generate_project_docx(project_id, db)
    return await _run_uno_conversion(refresh_docx_with_unoserver, docx_bytes)


async def export_project_pdf(project_id: UUID, db: AsyncSession) -> bytes:
    """Generate a project DOCX and convert it to PDF via LibreOffice."""
    docx_bytes = await _generate_project_docx(project_id, db)
    return await _run_uno_conversion(convert_docx_to_pdf_with_unoserver, docx_bytes)


async def _fetch_project_export_metadata(project_id: UUID) -> ProjectExportMetadata:
    """Fetch project metadata from the project logic service."""
    async with httpx.AsyncClient(timeout=5.0) as client:
        try:
            response = await client.get(f"{settings.PROJECT_LOGIC_SERVICE_URL}/projects/{project_id}")
        except httpx.RequestError as exc:
            raise HTTPException(
                status_code=status.HTTP_502_BAD_GATEWAY,
                detail=f"Could not reach project logic service: {exc}",
            ) from exc

    if response.status_code == status.HTTP_404_NOT_FOUND:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Project {project_id} not found in project logic service",
        )

    if response.status_code != status.HTTP_200_OK:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Project logic service returned {response.status_code}",
        )

    payload = response.json()
    project_name = payload.get("name")
    internal_project_number = payload.get("internalProjectNumber", payload.get("internal_project_number"))
    latest_version = payload.get("latestVersion", payload.get("latest_version", payload.get("projectVersion")))

    if not isinstance(project_name, str):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Project logic service response missing 'name'",
        )

    if not isinstance(internal_project_number, str):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Project logic service response missing 'internalProjectNumber'",
        )

    if not isinstance(latest_version, int):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Project logic service response missing 'latestVersion'",
        )

    return ProjectExportMetadata(
        name=project_name,
        internal_project_number=internal_project_number,
        latest_version=latest_version,
    )


async def _generate_project_docx(project_id: UUID, db: AsyncSession) -> bytes:
    """Load project nodes and generate intermediate DOCX bytes."""
    project_metadata = await _fetch_project_export_metadata(project_id)

    result = await db.execute(
        select(VaeNode).where(
            VaeNode.project_id == project_id,
            VaeNode.project_version == project_metadata.latest_version,
            VaeNode.is_deleted.is_(False),
            VaeNode.is_hidden.is_(False),
        )
    )
    nodes = list(result.scalars().all())

    if not nodes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No exportable VAE nodes found for project {project_id}",
        )

    return await to_thread.run_sync(
        functools.partial(
            generate_vae_docx,
            nodes,
            project_name=project_metadata.name,
            internal_project_number=project_metadata.internal_project_number,
        )
    )


async def _run_uno_conversion(converter: Callable[[bytes], bytes], docx_bytes: bytes) -> bytes:
    """Run blocking UNO conversion in a worker thread and map failures."""
    try:
        return await to_thread.run_sync(functools.partial(converter, docx_bytes))
    except UnoConversionError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(exc),
        ) from exc
