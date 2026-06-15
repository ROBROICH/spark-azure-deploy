"""FastAPI service definition for jura_db"""

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from importlib.metadata import version

from db_services_shared.fastapi import app_factory
from db_services_shared.utils.lifespan import with_migration_lifespan
from db_services_shared.llm.embeddings import EmbeddingClient
# from db_services_shared.utils.logger import logger
from fastapi import FastAPI
from openai import APITimeoutError

from jura_db.config import app_config
from jura_db.routes.db import db_router
import jura_db.routes.db


logger = logging.getLogger("fastapi")
logger.setLevel(app_config.log_level.upper())


@with_migration_lifespan  # type: ignore[arg-type]
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    try:
        ec = EmbeddingClient(app_config.chunking)
        jura_db.routes.db.embedding_client = ec
        await ec.model.aembed_query("test")
        logger.disabled = False
    except APITimeoutError:
        logger.error("LLM Authentication timed out, possibly running degraded")

    yield

app = app_factory(
    app_config.SERVICE_NAME,
    settings=app_config,
    description="API for accessing German and EU court decisions data",
    version=version("jura_db"),
    lifespan=lifespan,
)
app.include_router(db_router)
