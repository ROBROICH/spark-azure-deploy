class OidcAuthError(Exception):
    """Base exception for OIDC authentication errors."""


class InvalidTokenError(OidcAuthError):
    """Raised when token is invalid, expired, or malformed."""


class InsufficientPermissionsError(OidcAuthError):
    """Raised when required realm role is missing."""


class MissingTokenError(OidcAuthError):
    """Raised when Authorization header is missing or invalid."""
