from fastapi import Depends
from sqlalchemy.ext.asyncio.session import AsyncSession

from src.models.db.database import get_db_session
from src.services.template_service import TemplateService


async def get_template_service(db: AsyncSession = Depends(get_db_session)) -> TemplateService:
    return TemplateService(db=db)
