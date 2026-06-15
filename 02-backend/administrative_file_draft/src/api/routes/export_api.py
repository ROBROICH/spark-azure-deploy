"""API route for VAE DOCX export."""

from uuid import UUID

from authentification.dependencies import require_permissions
from authentification.enums import OidcRoles, Permission, Resource
from authentification.resolver import path_param
from fastapi import APIRouter, Depends, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db.database import get_db_session
from src.services import export_service

router = APIRouter(tags=["Export"])

DOCX_MEDIA_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
PDF_MEDIA_TYPE = "application/pdf"


@router.post(
    "/{project_id}/export/docx",
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.EXPORT, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def export_vae_docx(
    project_id: UUID,
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    """Export all VAE nodes for a project as a styled DOCX document.

    Returns a Word document based on the Musterbeschluss template with:
    - static cover placeholders defined in template
    - native TOC field (updates on open in Word)
    - VAE node titles as Heading 1-9
    - VAE node text as Normal paragraphs
    """
    docx_bytes = await export_service.export_project_docx(project_id, db)

    return Response(
        content=docx_bytes,
        media_type=DOCX_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename=beschluss_{project_id}.docx"},
    )


@router.post(
    "/{project_id}/export/pdf",
    status_code=status.HTTP_200_OK,
    dependencies=[
        Depends(
            require_permissions(
                (Resource.PROJECT, Permission.EXPORT, path_param("project_id")),
                bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
            )
        ),
    ],
)
async def export_vae_pdf(
    project_id: UUID,
    db: AsyncSession = Depends(get_db_session),
) -> Response:
    """Export all VAE nodes for a project as a PDF document."""
    pdf_bytes = await export_service.export_project_pdf(project_id, db)

    return Response(
        content=pdf_bytes,
        media_type=PDF_MEDIA_TYPE,
        headers={"Content-Disposition": f"attachment; filename=beschluss_{project_id}.pdf"},
    )
