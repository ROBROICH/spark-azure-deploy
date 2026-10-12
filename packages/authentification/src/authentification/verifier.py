from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, override

import jwt
from event_logging import EventAction, EventCategory, EventOutcome
from jwt import PyJWKClient

from authentification.enums import AuthMode
from authentification.exceptions import InvalidTokenError
from authentification.logger import get_logger
from authentification.models import OidcUserInfo


@dataclass(frozen=True)
class AuthResolution:
    user: OidcUserInfo | None
    status: str


class OidcVerifier(ABC):
    """OIDC JWT verifier with JWKS caching.

    Args:
        base_url: OIDC provider base URL.
        realm: OIDC realm or tenant.
        audience: Expected audience (client ID of this service).
        jwks_url: JWKS endpoint.
        algorithms: Allowed signing algorithms (default: RS256).
        auth_mode: Setting for different authentification modes.
    """

    def __init__(
        self,
        base_url: str,
        realm: str,
        audience: str,
        jwks_url: str | None = None,
        algorithms: list[str] | None = None,
        auth_mode: AuthMode = AuthMode.STRICT,
    ) -> None:
        if algorithms is None:
            algorithms = ["RS256"]

        self.base_url = base_url.rstrip("/")
        self.realm = realm
        self.audience = audience
        self.jwks_url = jwks_url or f"{self.issuer_url}/protocol/openid-connect/certs"
        self.algorithms: list[str] = algorithms
        self.auth_mode = auth_mode

        self._jwks_client: PyJWKClient | None = None

    @property
    def requires_user(self) -> bool:
        return self.auth_mode == AuthMode.STRICT

    @property
    def allows_anonymous(self) -> bool:
        return self.auth_mode in {
            AuthMode.DISABLED,
            AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        }

    @property
    @abstractmethod
    def issuer_url(self) -> str:
        """Return issuer endpoint URL."""

    def create_user_info(self, payload: dict[str, object]) -> OidcUserInfo:
        """Create normalized user info from a decoded OIDC payload."""
        user_info = OidcUserInfo.from_payload(payload)
        if not user_info.enabled:
            raise InvalidTokenError("User not active")
        return user_info

    def _ensure_jwks_client(self) -> PyJWKClient:
        """Initializes and returns JWKS client only if required."""

        if self._jwks_client is not None:
            return self._jwks_client

        self._jwks_client = PyJWKClient(
            self.jwks_url,
            cache_keys=True,
        )
        return self._jwks_client

    def _decode_verified(self, token: str) -> dict[str, Any]:
        """Decode JWT with verification."""
        try:
            signing_key = self._ensure_jwks_client().get_signing_key_from_jwt(token)
            return jwt.decode(
                token,
                signing_key.key,
                algorithms=self.algorithms,
                audience=self.audience,
                issuer=self.issuer_url,
                options={
                    "verify_signature": True,
                    "verify_exp": True,
                    "verify_nbf": True,
                    "verify_iat": True,
                    "verify_aud": True,
                    "verify_iss": True,
                },
            )
        except jwt.PyJWTError as e:
            error_type = type(e).__name__
            raise InvalidTokenError(f"{error_type}: {e}") from e

    def _decode_unverified(self, token: str) -> dict[str, Any]:
        """Decode JWT without verifying signature (unsafe but allowed in optional mode)."""
        try:
            return jwt.decode(
                token,
                options={
                    "verify_signature": False,
                    "verify_exp": False,
                    "verify_nbf": False,
                    "verify_iat": False,
                    "verify_aud": False,
                    "verify_iss": False,
                },
            )
        except jwt.PyJWTError as e:
            error_type = type(e).__name__
            raise InvalidTokenError(f"{error_type}: {e}") from e

    def resolve_user(self, token: str | None) -> AuthResolution:
        """Resolve user info plus auth metadata depending on auth mode."""
        if self.auth_mode == AuthMode.DISABLED:
            return AuthResolution(
                user=None,
                status="disabled",
            )

        if not token:
            if self.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN:
                return AuthResolution(
                    user=None,
                    status="missing",
                )
            raise InvalidTokenError("Missing or invalid Authorization header")

        try:
            payload = self._decode_verified(token)
            return AuthResolution(
                user=self.create_user_info(payload),
                status="verified",
            )
        except InvalidTokenError as error:
            if self.auth_mode != AuthMode.OPTIONAL_VERIFY_DRY_RUN:
                raise

            get_logger().warn(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.FAILURE,
                category=EventCategory.AUTHENTICATION,
                message=f"Auth dry-run verify failed, continuing with unverified claims: {error}",
            )

        try:
            payload = self._decode_unverified(token)
        except InvalidTokenError:
            return AuthResolution(
                user=None,
                status="invalid_no_claims",
            )

        return AuthResolution(
            user=self.create_user_info(payload),
            status="invalid_fallback_unverified",
        )


class KeycloakVerifier(OidcVerifier):
    """Keycloak-specific OIDC verifier."""

    def __init__(
        self,
        base_url: str,
        realm: str,
        audience: str,
        jwks_url: str | None = None,
        algorithms: list[str] | None = None,
        auth_mode: AuthMode = AuthMode.STRICT,
    ) -> None:
        super().__init__(
            base_url=base_url,
            realm=realm,
            audience=audience,
            jwks_url=jwks_url,
            algorithms=algorithms,
            auth_mode=auth_mode,
        )

    @property
    @override
    def issuer_url(self) -> str:
        """Return Keycloak issuer endpoint URL."""
        return f"{self.base_url}/realms/{self.realm}"
