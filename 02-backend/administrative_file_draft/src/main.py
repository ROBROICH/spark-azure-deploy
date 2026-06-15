from audit_client import AuditContextMiddleware, audit_actor_dependency
from event_logging.middleware import EventLoggingMiddleware
from fastapi import Depends, FastAPI
from node_crud import (
    build_http_latest_version_resolver,
    build_http_version_lock_validator,
    build_http_write_version_validator,
    generate_node_routes,
)
from prometheus_fastapi_instrumentator import Instrumentator

from src.api.middlewares.cors import add_cors
from src.api.middlewares.security_headers import SecurityHeadersMiddleware
from src.api.routes.export_api import router as export_router
from src.api.routes.probes_routes import probe_router
from src.api.routes.risks_api import router as risks_router
from src.api.routes.template_api import router as template_router
from src.config.settings import settings
from src.exceptions.exception_handlers import register_exception_handlers
from src.lifespan import lifespan
from src.models.db.database import get_db_session
from src.models.db_models import Base

app = FastAPI(
    title="Administrative File Draft Service",
    description="Microservice for managing administrative file drafts",
    lifespan=lifespan,
)

# adds /metrics endpoint for Prometheus to scrape
Instrumentator().instrument(app).expose(app)

register_exception_handlers(app)
add_cors(app)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AuditContextMiddleware)
app.include_router(risks_router, dependencies=[Depends(audit_actor_dependency)])
app.include_router(export_router, dependencies=[Depends(audit_actor_dependency)])
app.include_router(probe_router)
app.include_router(template_router, dependencies=[Depends(audit_actor_dependency)])
app.include_router(
    generate_node_routes(
        base=Base,
        get_db_session=get_db_session,
        get_latest_version=build_http_latest_version_resolver(settings.PROJECT_LOGIC_SERVICE_URL),
        validate_write_version=build_http_write_version_validator(settings.PROJECT_LOGIC_SERVICE_URL),
        validate_version_lock=build_http_version_lock_validator(settings.PROJECT_LOGIC_SERVICE_URL),
        audit_log_enabled=True,
    ),
    dependencies=[Depends(audit_actor_dependency)],
)

app.add_middleware(
    EventLoggingMiddleware,
    service_name=settings.SERVICE_NAME,
    skip_paths=["/healthz", "/metrics"],
)
