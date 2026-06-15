from sqlalchemy.ext.asyncio import AsyncSession

from src.services.topics.topic_service import TopicService


async def create_topic_service(db: AsyncSession) -> TopicService:
    """Build TopicService with given DB session."""
    return TopicService(db=db)
