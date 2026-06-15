import sys

from audit_client import AuditContextMiddleware, audit_actor_dependency
from fastapi import Depends, FastAPI
from node_crud import (
    build_http_latest_version_resolver,
    build_http_version_lock_validator,
    generate_node_routes,
)
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
from src.lifespan import lifespan
from src.models.db.database import get_db_session
from src.models.db.db_models import Base

if "pytest" not in sys.modules:
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

# Exception Handlers
register_exception_handlers(app=app)

# adds /metrics endpoint for Prometheus to scrape
Instrumentator().instrument(app).expose(app)

app.include_router(api_router, dependencies=[Depends(audit_actor_dependency)])
app.include_router(probe_router)
app.include_router(
    generate_node_routes(
        base=Base,
        get_db_session=get_db_session,
        add_update_endpoint=False,
        get_latest_version=build_http_latest_version_resolver(settings.PROJECT_LOGIC_SERVICE_URL),
        validate_version_lock=build_http_version_lock_validator(settings.PROJECT_LOGIC_SERVICE_URL),
    ),
    dependencies=[Depends(audit_actor_dependency)],
)
