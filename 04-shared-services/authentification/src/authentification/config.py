import os
from functools import lru_cache

from pydantic import Field, model_validator
from pydantic_core import InitErrorDetails
from pydantic_core import ValidationError as PydanticValidationError
from pydantic_settings import BaseSettings, SettingsConfigDict

from authentification.enums import AuthMode


class AuthSettings(BaseSettings):
    """
    Pydantic settings model for OIDC configuration.
    Automatically reads from environment variables or .env file.
    """

    model_config = SettingsConfigDict(
        env_prefix="AUTH_",
        env_file=[".env.local", ".env"] if not os.getenv("SKIP_DOTENV") else None,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    service_name: str = Field(
        default="not-set",
        validation_alias="SERVICE_NAME",
    )

    mode: AuthMode = Field(
        default=AuthMode.STRICT,
        description=("Authentication mode (disabled | optional_verify_dry_run | optional_verify | strict)"),
    )

    # OIDC settings
    base_url: str = Field("", description="OIDC provider URL")
    realm: str = Field("", description="OIDC realm or tenant")
    audience: str = Field("", description="Audience / client ID")

    jwks_url: str | None = Field(None)
    algorithms: list[str] = Field(default_factory=lambda: ["RS256"])

    client_secret: str = Field(default="")
    client_id: str = Field(default="")

    privileged_realm: str = Field(default="")
    privileged_client_secret: str = Field(default="")
    privileged_client_id: str = Field(default="")

    # SpiceDB settings
    spice_db_endpoint: str = Field(
        "",
        description="SPICE DB endpoint URL",
    )
    spice_db_token: str = Field(
        "",
        description="SPICE DB access token",
    )
    spice_db_cert_path: str | None = Field(
        None,
        description="SPICE DB CA bundle certificate path",
    )
    spice_db_insecure: bool = Field(
        default=False,
        description="SPICE DB TLS or insecure connection",
    )
    spice_db_bulk_chunk_size: int = Field(
        default=1000,
        description="SPICE DB number of items for bulk checks",
    )
    allowed_machine_identities: str = Field(
        default="",
        description="Comma-separated SPIFFE IDs allowed to authenticate tokenless service-to-service requests",
    )

    @model_validator(mode="after")
    def apply_dummies_or_enforce_required(self) -> "AuthSettings":
        """Validate based on mode."""

        if self.mode == AuthMode.DISABLED:
            self.base_url = self.base_url or "http://disabled-auth-issuer.invalid"
            self.realm = self.realm or "master"
            self.audience = self.audience or "disabled-audience"
            self.spice_db_endpoint = self.spice_db_endpoint or "http://localhost:9999"
            self.spice_db_token = self.spice_db_token or "dummy-token"
            return self

        required_oidc = {
            "base_url": self.base_url,
            "realm": self.realm,
            "audience": self.audience,
            "spice_db_endpoint": self.spice_db_endpoint,
            "spice_db_token": self.spice_db_token,
        }

        errors = [
            InitErrorDetails(type="missing", loc=(k,), input=v, ctx={})
            for k, v in required_oidc.items()
            if not v or v.strip() == ""
        ]

        if errors:
            raise PydanticValidationError.from_exception_data(
                title=self.__class__.__name__,
                line_errors=errors,
            )

        return self


@lru_cache(maxsize=1)
def auth_settings() -> AuthSettings:
    """
    Cached factory for AuthSettings.

    The settings object is created only once per process.
    """
    return AuthSettings()  # type: ignore
