from collections.abc import Callable, Coroutine, Sequence
from typing import Any, TypeVar

from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
)
from fastapi import Depends, HTTPException, Request, Response, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from authentification.auth import AuthClient, BulkCheckItem
from authentification.auth_utils import (
    AUTH_PERMISSIONS_HEADER,
    _has_role_bypass,
    _log_rbac_denied,
    _log_rbac_granted,
    _set_auth_dry_run_header,
    _set_auth_header,
    check_permissions,
)
from authentification.config import auth_settings
from authentification.enums import AuthMode, OidcRoles, Permission, Resource, Subject
from authentification.exceptions import InvalidTokenError
from authentification.logger import get_logger
from authentification.machine_identity import (
    XFCC_HEADER,
    MachineIdentity,
    is_allowed_machine_identity,
    machine_identity_from_headers,
)
from authentification.models import OidcUserInfo
from authentification.oidc import KeycloakClient, OidcClient
from authentification.resolver import ResourceResolver
from authentification.verifier import KeycloakVerifier, OidcVerifier

_verifier: OidcVerifier | None = None
_auth_client: AuthClient | None = None
_oidc_client: OidcClient | None = None
_privileged_oidc_client: OidcClient | None = None
BodyT = TypeVar("BodyT")
BodyFieldPath = str | Sequence[str]
BodyPermissionSpec = tuple[Any, Permission, BodyFieldPath]

AUTH_MODE_HEADER = "X-Auth-Mode"
AUTH_RESULT_HEADER = "X-Auth-Result"
AUTH_ROLES_HEADER = "X-Auth-Roles"
AUTH_RESOURCE_FILTER_HEADER = "X-Auth-Resource-Filter"
SERVICE_USER_ID = "00000000-0000-0000-0000-000000000001"


def _normalize_body_field_path(field_name: BodyFieldPath) -> tuple[str, ...]:
    if isinstance(field_name, str):
        return (field_name,)
    field_path = tuple(field_name)
    if not field_path:
        raise ValueError("Body field path must not be empty")
    return field_path


def _resolve_body_field_path(body: Any, field_path: tuple[str, ...]) -> Any:
    value = body
    for field_name in field_path:
        value = value.get(field_name) if isinstance(value, dict) else getattr(value, field_name, None)

        if value is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Missing required body field '{'.'.join(field_path)}'",
            ) from None

    return value


def _validate_body_permission_specs(model: Any, specs: Sequence[BodyPermissionSpec]) -> tuple[BodyPermissionSpec, ...]:
    body_specs = tuple(specs)
    if not body_specs:
        raise ValueError("At least one body permission is required")

    model_fields = getattr(model, "model_fields", None)
    if model_fields is None:
        return body_specs

    for _, _, field_name in body_specs:
        field_path = _normalize_body_field_path(field_name)
        if field_path[0] not in model_fields:
            raise ValueError(f"{model.__name__} has no field {field_path[0]!r}")

    return body_specs


def _body_permission_checks(body: Any, specs: Sequence[BodyPermissionSpec]) -> list[BulkCheckItem]:
    checks: list[BulkCheckItem] = []
    for resource_type, permission, field_name in specs:
        field_path = _normalize_body_field_path(field_name)
        resource_id = _resolve_body_field_path(body, field_path)
        checks.append(
            BulkCheckItem(
                resource_type=resource_type,
                resource_id=str(resource_id),
                permission=permission,
            )
        )
    return checks


def _request_log_context(request: Request | None) -> dict[str, Any]:
    """Helper method to log request context."""
    if request is None:
        return {}

    client = request.client
    forwarded_for = request.headers.get("x-forwarded-for")
    forwarded_host = request.headers.get("x-forwarded-host")
    forwarded_proto = request.headers.get("x-forwarded-proto")
    host = request.headers.get("host")
    request_path = request.url.path

    request_summary = (
        f"method={request.method} path={request_path} host={host or '-'} client={client.host if client else '-'}"
    )
    if forwarded_host or forwarded_proto or forwarded_for:
        request_summary = (
            f"{request_summary} forwarded_host={forwarded_host or '-'} "
            f"forwarded_proto={forwarded_proto or '-'} forwarded_for={forwarded_for or '-'}"
        )

    return {
        "http_request_method": request.method,
        "url_path": request.url.path,
        "source_ip": client.host if client else None,
        "source_port": client.port if client else None,
        "event_reason": request_summary,
    }


def _service_user(machine_identity: MachineIdentity) -> OidcUserInfo:
    return OidcUserInfo(
        sub=SERVICE_USER_ID,
        preferred_username=f"{machine_identity.namespace}/{machine_identity.service_account}",
        azp=machine_identity.spiffe,
        realm_roles=[OidcRoles.SERVICE],
    )


def _resolve_machine_identity(request: Request, request_context: dict[str, Any]) -> MachineIdentity | None:
    if request.headers.get(XFCC_HEADER) is None:
        return None

    machine_identity = machine_identity_from_headers(request.headers)
    if machine_identity is None:
        message = "Invalid machine identity"
        get_logger().error(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.AUTHENTICATION,
            message=message,
            **request_context,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=message,
        )

    if not is_allowed_machine_identity(machine_identity, auth_settings().allowed_machine_identities):
        message = "Machine identity not allowed"
        get_logger().error(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.AUTHENTICATION,
            message=message,
            user_id=machine_identity.spiffe,
            **request_context,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=message,
        )

    return machine_identity


async def get_verifier() -> OidcVerifier:
    """Return an OIDC verifier."""
    global _verifier  # noqa: PLW0603
    if _verifier is None:
        settings = auth_settings()
        _verifier = KeycloakVerifier(
            base_url=settings.base_url,
            realm=settings.realm,
            audience=settings.audience,
            jwks_url=settings.jwks_url,
            algorithms=settings.algorithms,
            auth_mode=settings.mode,
        )
    return _verifier


async def get_auth_client() -> AuthClient:
    """Return an AuthClient instance."""
    global _auth_client  # noqa: PLW0603
    if _auth_client is None:
        settings = auth_settings()
        _auth_client = AuthClient(
            endpoint=settings.spice_db_endpoint,
            token=settings.spice_db_token,
            cert_path=settings.spice_db_cert_path,
            insecure=settings.spice_db_insecure,
        )
    return _auth_client


async def get_oidc_client() -> OidcClient:
    """Return the OIDC client."""
    global _oidc_client  # noqa: PLW0603
    if _oidc_client is None:
        settings = auth_settings()
        _oidc_client = KeycloakClient(
            base_url=settings.base_url,
            realm=settings.realm,
            client_id=settings.client_id,
            client_secret=settings.client_secret,
        )
    return _oidc_client


async def get_privileged_oidc_client() -> OidcClient:
    """Return the privileged OIDC client."""
    global _privileged_oidc_client  # noqa: PLW0603
    if _privileged_oidc_client is None:
        settings = auth_settings()
        _privileged_oidc_client = KeycloakClient(
            base_url=settings.base_url,
            realm=settings.realm,
            auth_realm=settings.privileged_realm,
            client_id=settings.privileged_client_id,
            client_secret=settings.privileged_client_secret,
        )

    return _privileged_oidc_client


async def get_current_user(
    response: Response,
    request: Request,
    verifier: OidcVerifier = Depends(get_verifier),
    authorization: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False)),
) -> OidcUserInfo | None:
    """
    Validate JWT and extract user information.

    Args:
        request: Request passed by FastAPI. Used for logging context
        response: FastAPI response object (add dry run context)
        verifier: Injected OIDC verifier instance.
        authorization: Bearer token from request header.

    Returns:
        OidcUserInfo with validated token data.

    Raises:
        HTTPException: 401 if token is missing or invalid in blocking auth modes.
    """
    request_context = _request_log_context(request)
    get_logger().info(
        action=EventAction.ACCESS,
        outcome=EventOutcome.UNKNOWN,
        category=EventCategory.AUTHENTICATION,
        message="Resolving current user for request",
        **request_context,
    )

    token = authorization.credentials if authorization else None
    if not token:
        machine_identity = _resolve_machine_identity(request, request_context)
        if machine_identity is not None:
            get_logger().info(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.SUCCESS,
                category=EventCategory.AUTHENTICATION,
                message="Successfully authenticated via machine identity",
                user_id=machine_identity.spiffe,
            )
            return _service_user(machine_identity)

    is_dry_run = verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN

    if not token:
        get_logger().warn(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.AUTHENTICATION,
            message="Missing machine identity and Authorization header",
            **request_context,
        )

    try:
        resolution = verifier.resolve_user(token)
        if is_dry_run:
            _set_auth_header(
                response=response,
                name=AUTH_MODE_HEADER,
                value=verifier.auth_mode,
            )
            _set_auth_header(
                response=response,
                name=AUTH_RESULT_HEADER,
                value=resolution.status,
            )
        get_logger().info(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.SUCCESS if resolution.user is not None else EventOutcome.UNKNOWN,
            category=EventCategory.AUTHENTICATION,
            message=f"Resolved current user via Authorization header with status={resolution.status}.",
            user_id=resolution.user.sub if resolution.user else None,
            user_roles=resolution.user.realm_roles if resolution.user else None,
        )
        return resolution.user
    except InvalidTokenError:
        message = "Missing or invalid Authorization header"
        get_logger().error(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.FAILURE,
            category=EventCategory.AUTHENTICATION,
            message=message,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=message,
            headers={"WWW-Authenticate": "Bearer"},
        ) from None


def require_permissions(
    *required_perms: tuple[Resource, Permission, ResourceResolver],
    bypass_roles: Sequence[str] | None = None,
) -> Callable[..., Coroutine[Any, Any, OidcUserInfo | None]]:
    """Create a FastAPI dependency that enforces one or more SpiceDB permissions.

    SpiceDB checks can be bypassed for certain user roles. E.g., admins

    All specified permissions must be granted for the current user on their
    respective resources (resolved dynamically via the provided resolvers).

    Special cases:
    - If auth is disabled (`verifier.auth_enabled = False`) → skips checks, returns user
    - If no user but missing JWKS is allowed → skips checks, returns user
    - If no valid user when auth is required → raises 403

    Args:
        *required_perms: One or more tuples of:
            (
             resource_type: Resource,
             permission: Permission,
             resolver: ResourceResolver
            )
            where resolver is an async callable that returns the resource_id from
            the Request.
        bypass_roles: Realm roles to bypass permission checks

    Returns:
        A FastAPI dependency that returns the authenticated `OidcUserInfo` if all
        required permissions are granted, or raises 403 otherwise.

    Raises:
        HTTPException: 403 Forbidden if authentication fails or any required permission
        is missing.
    """

    async def dependency(
        request: Request,
        response: Response,
        user: OidcUserInfo | None = Depends(get_current_user),
        verifier: OidcVerifier = Depends(get_verifier),
        auth_client: AuthClient = Depends(get_auth_client),
    ) -> OidcUserInfo | None:
        """FastAPI dependency: enforce required SpiceDB permissions for the current
        user.

        Args:
            response: FastAPI response object (add dry run context)
            request: FastAPI Request object (used by resource resolvers).
            user: Authenticated OIDC user info (injected).
            verifier: OIDC JWKS verifier and auth config.
            auth_client: SpiceDB client for permission checks.

        Returns:
            The authenticated user info if all permissions are granted.

        Raises:
            HTTPException: 403 if no valid user or if any required permission is denied.
        """
        is_dry_run = verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN

        if verifier.requires_user and user is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authentication required",
            )

        if user is None:
            _set_auth_dry_run_header(
                response=response,
                dry_run=is_dry_run,
                name=AUTH_PERMISSIONS_HEADER,
                value="skipped:no-user",
            )
            return None

        if _has_role_bypass(
            user=user,
            bypass_roles=bypass_roles,
        ):
            _set_auth_dry_run_header(
                response=response,
                dry_run=is_dry_run,
                name=AUTH_PERMISSIONS_HEADER,
                value="bypass-role",
            )
            return user

        checks: list[BulkCheckItem] = []
        for resource_type, permission, resolver in required_perms:
            resource_id = await resolver(request)
            checks.append(
                BulkCheckItem(
                    resource_type=resource_type,
                    resource_id=resource_id,
                    permission=permission,
                )
            )

        await check_permissions(
            user=user,
            checks=checks,
            auth_client=auth_client,
            subject=Subject.USER,
            bypass_roles=bypass_roles,
            dry_run=is_dry_run,
            response=response,
        )

        return user

    return dependency


def require_permissions_from_body(
    model: Any,
    *required_perms: BodyPermissionSpec,
    bypass_roles: Sequence[str] | None = None,
) -> Callable[..., Coroutine[Any, Any, BodyT]]:
    """Authorize a request using field paths from the validated FastAPI body.

    The returned dependency also returns the validated body, so handlers can use
    the same object that authorization inspected.
    """

    body_specs = _validate_body_permission_specs(model, required_perms)

    async def dependency(
        body: model,  # type: ignore[valid-type]
        response: Response,
        user: OidcUserInfo | None = Depends(get_current_user),
        verifier: OidcVerifier = Depends(get_verifier),
        auth_client: AuthClient = Depends(get_auth_client),
    ) -> BodyT:
        is_dry_run = verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN

        if verifier.requires_user and user is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authentication required",
            )

        if user is None:
            _set_auth_dry_run_header(
                response=response,
                dry_run=is_dry_run,
                name=AUTH_PERMISSIONS_HEADER,
                value="skipped:no-user",
            )
            return body

        await check_permissions(
            user=user,
            checks=_body_permission_checks(body, body_specs),
            auth_client=auth_client,
            subject=Subject.USER,
            bypass_roles=bypass_roles,
            dry_run=is_dry_run,
            response=response,
        )

        return body

    return dependency


def require_permission_from_body(
    model: Any,
    field_name: BodyFieldPath,
    permission: Permission,
    resource_type: Any = Resource.PROJECT,
    bypass_roles: Sequence[str] | None = None,
) -> Callable[..., Coroutine[Any, Any, BodyT]]:
    """Authorize a request using one field path from the validated FastAPI body."""

    return require_permissions_from_body(
        model,
        (resource_type, permission, field_name),
        bypass_roles=bypass_roles,
    )


def list_accessible_resources(
    resource_type: Resource,
    permission: Permission,
    bypass_roles: Sequence[str] | None = None,
) -> Callable[..., Coroutine[Any, Any, list[str] | None]]:
    """Create a FastAPI dependency that returns resource IDs the current user can
    access.

    This dependency looks up all resources of the given `resource_type` that the
    authenticated user has the specified `permission` on via SpiceDB.

    Special cases:
    - If auth is disabled (`verifier.auth_enabled = False`) → returns `None`
    - If no user is present but missing JWKS is allowed → returns `None`
    - If no valid user is authenticated → raises 403 Forbidden

    Args:
        resource_type: The type of resource to query (e.g., Resource.PROJECT).
        permission: The permission to check (e.g., Permission.READ).
        bypass_roles: Optional list of roles to bypass checks.

    Returns:
        A FastAPI dependency function that returns:
            - list[str]: IDs of accessible resources of the given type
            - None: when authentication is disabled or partially skipped
    """

    async def dependency(
        request: Request,
        response: Response,
        user: OidcUserInfo | None = Depends(get_current_user),
        verifier: OidcVerifier = Depends(get_verifier),
        auth_client: AuthClient = Depends(get_auth_client),
    ) -> list[str] | None:
        """FastAPI dependency: list resource IDs accessible to the current user.

        Args:
            response: FastAPI Response object (add dry run context).
            request: FastAPI Request object (unused but required for dependency).
            user: Authenticated OIDC user info (injected).
            verifier: OIDC configuration and JWKS verifier.
            auth_client: SpiceDB client for permission lookups.

        Returns:
            List of resource IDs the user has `permission` on, or `None` if
            authentication checks are bypassed (auth disabled or missing JWKS allowed).

        Raises:
            HTTPException: 403 if no valid user is authenticated when auth is required.
        """
        is_dry_run = verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN

        if verifier.requires_user and user is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authentication required",
            )

        if user is None:
            _set_auth_dry_run_header(
                response=response,
                dry_run=is_dry_run,
                name=AUTH_RESOURCE_FILTER_HEADER,
                value="bypassed:no-user",
            )
            return None

        if _has_role_bypass(
            user=user,
            bypass_roles=bypass_roles,
        ):
            _set_auth_dry_run_header(
                response=response,
                dry_run=is_dry_run,
                name=AUTH_RESOURCE_FILTER_HEADER,
                value="bypassed:role",
            )
            return None

        # Fetch all accessible resource IDs for this exact permission
        resource_ids = await auth_client.list_resources_with_permission(
            resource_type=resource_type,
            permission=permission,
            subject_type=Subject.USER,
            subject_id=user.sub,
        )
        if is_dry_run:
            accessible_count = len(resource_ids)
            get_logger().info(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.FAILURE if accessible_count == 0 else EventOutcome.SUCCESS,
                category=EventCategory.AUTHENTICATION,
                message=(
                    "Auth dry-run resource filter bypassed for "
                    f"{resource_type}:{permission}; accessible_count={accessible_count}"
                ),
            )
            _set_auth_dry_run_header(
                response=response,
                dry_run=is_dry_run,
                name=AUTH_RESOURCE_FILTER_HEADER,
                value=f"bypassed-dry-run:accessible={accessible_count}",
            )
            return None

        return resource_ids

    return dependency


def _has_required_roles(
    user_roles: set[str],
    allowed: set[str],
    require_all: bool,
) -> bool:
    """Check if user has required roles."""
    if require_all:
        return allowed.issubset(user_roles)
    return bool(allowed & user_roles)


def require_role(
    allowed_roles: str | Sequence[str],
    *,
    require_all: bool = False,
) -> Callable[..., Coroutine[Any, Any, OidcUserInfo | None]]:
    """
    FastAPI dependency: enforce that the user has at least one (or all) of the
    specified realm roles.

    Usage examples:
        Depends(require_role("admin"))
        Depends(require_role(["support", "helpdesk"]))
        Depends(require_role({"global_admin", "incident_response"}, require_all=True))

    Behavior:
    - Skips check if auth is disabled or missing JWKS is allowed
    - Requires valid user + at least one matching role (default)
    - Raises 403 if no matching role(s)
    """
    allowed = {allowed_roles} if isinstance(allowed_roles, str) else set(allowed_roles)

    if not allowed:
        raise ValueError("require_role: allowed_roles cannot be empty")

    async def dependency(
        request: Request,
        response: Response,
        user: OidcUserInfo | None = Depends(get_current_user),
        verifier: OidcVerifier = Depends(get_verifier),
    ) -> OidcUserInfo | None:
        is_dry_run = verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN

        if verifier.requires_user and user is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Authentication required",
            )

        if not user:
            _set_auth_dry_run_header(
                response=response,
                dry_run=is_dry_run,
                name=AUTH_ROLES_HEADER,
                value="skipped:no-user",
            )
            return None

        user_roles = set(user.realm_roles)

        if not _has_required_roles(
            user_roles=user_roles,
            allowed=allowed,
            require_all=require_all,
        ):
            if is_dry_run:
                _log_rbac_denied(
                    user=user,
                    allowed=allowed,
                    user_roles=user_roles,
                    dry_run=True,
                )
                _set_auth_dry_run_header(
                    response=response,
                    dry_run=is_dry_run,
                    name=AUTH_ROLES_HEADER,
                    value="denied",
                )
                return user

            _log_rbac_denied(
                user=user,
                allowed=allowed,
                user_roles=user_roles,
                dry_run=False,
            )
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied",
            )

        _log_rbac_granted(
            user=user,
            allowed=allowed,
            user_roles=user_roles,
            require_all=require_all,
            dry_run=is_dry_run,
        )
        _set_auth_dry_run_header(
            response=response,
            dry_run=is_dry_run,
            name=AUTH_ROLES_HEADER,
            value="allowed",
        )

        return user

    return dependency
