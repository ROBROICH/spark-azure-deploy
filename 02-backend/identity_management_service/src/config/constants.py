"""Application constants shared across the service."""

# Paths excluded from security headers and logging
AUTH_EXCLUDED_PATHS = [
    "/",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/healthz",
    "/ready",
    "/startup",
    "/metrics",
]
