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
from src.api.routes.plausibility_notes_api import router as plausibility_notes_router
from src.api.routes.probe_router import probe_router
from src.config.settings import settings
from src.exceptions.exception_handlers import register_exception_handlers
from src.models.db.database import get_db_session
from src.models.db_models import Base
from src.utils.lifespan import lifespan

app = FastAPI(lifespan=lifespan)

# adds /metrics endpoint for Prometheus to scrape
Instrumentator().instrument(app).expose(app)

# Exception Handlers
register_exception_handlers(app=app)

app.include_router(plausibility_notes_router, dependencies=[Depends(audit_actor_dependency)])
app.include_router(probe_router)
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

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(AuditContextMiddleware)
app.add_middleware(
    EventLoggingMiddleware,
    service_name=settings.SERVICE_NAME,
    skip_paths=["/metrics"],
)
add_cors(app)
