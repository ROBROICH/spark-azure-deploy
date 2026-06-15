from fastapi import Depends
from sqlalchemy.ext.asyncio.session import AsyncSession

from src.models.db.database import get_db_session
from src.services.topics.topic_service import TopicService
from src.utils.service_utils import create_topic_service


async def get_topic_service(db: AsyncSession = Depends(get_db_session)) -> TopicService:
    """
    Fastapi dependency for creating the topic service.

    Args:
        db: Database session

    Returns:
        Instance of TopicService
    """
    return await create_topic_service(db)
