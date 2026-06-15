from uuid import UUID

from audit_client import AuditContextMiddleware, audit_actor_dependency
from event_logging.middleware import EventLoggingMiddleware
from fastapi import Depends, FastAPI
from node_crud import generate_node_routes
from prometheus_fastapi_instrumentator import Instrumentator
from temporal.observability import ObservabilityConfig, setup_observability

from src.api.middlewares.cors import add_cors
from src.api.middlewares.http_method_restrictions import (
    HTTPMethodRestrictionsMiddleware,
)
from src.api.middlewares.security_headers import SecurityHeadersMiddleware
from src.api.routers import api_router
from src.api.routes.probe_router import probe_router
from src.config.handlers import register_exception_handlers
from src.config.settings import settings
from src.exceptions import ProjectNotFoundError
from src.lifespan import lifespan
from src.models.db.database import AsyncSessionLocal, _init_engine, get_db_session
from src.models.db_models import Base
from src.services.projects import project_service

setup_observability(
    ObservabilityConfig(
        service_name=settings.OTEL_SERVICE_NAME,
        otel_endpoint=settings.OTEL_ENDPOINT,
    )
)

app = FastAPI(lifespan=lifespan)

# Middlewares are executed in LIFO order
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AuditContextMiddleware)
app.add_middleware(HTTPMethodRestrictionsMiddleware)
add_cors(app)
app.add_middleware(
    EventLoggingMiddleware,
    service_name=settings.SERVICE_NAME,
    skip_paths=["/healthz", "/metrics"],
)

# Exception Handlers
register_exception_handlers(app=app)

# adds /metrics endpoint for Prometheus to scrape
Instrumentator().instrument(app).expose(app)

app.include_router(api_router, dependencies=[Depends(audit_actor_dependency)])
app.include_router(probe_router)


async def get_latest_project_version(project_id: UUID) -> int:
    _init_engine()
    async with AsyncSessionLocal() as session:
        project = await project_service.get_project_orm(db=session, project_id=project_id)
        if project is None:
            raise ProjectNotFoundError(str(project_id))
        return project.project_version


async def validate_project_write_version(project_id: UUID, project_version: int) -> int:
    _init_engine()
    async with AsyncSessionLocal() as session:
        return await project_service.ensure_project_write_version(
            db=session,
            project_id=project_id,
            project_version=project_version,
        )


async def validate_project_version_lock(
    project_id: UUID,
    source_version: int,
    target_version: int,
    lock_token: str,
) -> None:
    _init_engine()
    async with AsyncSessionLocal() as session:
        await project_service.validate_project_version_lock(
            db=session,
            project_id=project_id,
            source_version=source_version,
            target_version=target_version,
            lock_token=lock_token,
        )


app.include_router(
    generate_node_routes(
        base=Base,
        get_db_session=get_db_session,
        get_latest_version=get_latest_project_version,
        validate_write_version=validate_project_write_version,
        validate_version_lock=validate_project_version_lock,
        audit_log_enabled=True,
    ),
    dependencies=[Depends(audit_actor_dependency)],
)
