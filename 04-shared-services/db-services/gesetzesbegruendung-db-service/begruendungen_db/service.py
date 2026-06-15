"""FastAPI service definition"""

from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from db_services_shared.fastapi import app_factory
from db_services_shared.llm.embeddings import EmbeddingClient
from db_services_shared.utils.lifespan import with_migration_lifespan
from db_services_shared.utils.logging import get_logger
from fastapi import FastAPI

from event_logging.enums import (EventAction, EventCategory, EventOutcome)

from begruendungen_db.config import app_config
from begruendungen_db.routes.db import db_router
from begruendungen_db.routes.temporal import temporal_router
import begruendungen_db.routes.db

logger = get_logger(app_config.SERVICE_NAME)

@with_migration_lifespan
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    FastAPI startup hook to run migrations before the app starts handling requests.
    """
    try:
        begruendungen_db.routes.db.embedding_client = EmbeddingClient(app_config.chunking)
        await begruendungen_db.routes.db.embedding_client.model.aembed_query("test")
    except Exception as e:
        logger.error(
            outcome=EventOutcome.FAILURE,
            category=EventCategory.SERVICE,
            action=EventAction.HEALTH,
            message=f"Unexpected error during startup: {e}"
        )
        raise Exception from e
    yield

app = app_factory(
    app_config.SERVICE_NAME,
    settings=app_config,
    lifespan=lifespan
)
app.include_router(db_router)
app.include_router(temporal_router)


if __name__ == "__main__":
    """Main method to enable debugging in VS Code
    - See: https://fastapi.tiangolo.com/tutorial/debugging
    """
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
