"""Application constants shared across the service."""

# Paths excluded from authentication and security headers
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
