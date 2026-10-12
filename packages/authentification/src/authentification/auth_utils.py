from collections.abc import Sequence

from event_logging import EventAction, EventCategory, EventOutcome
from fastapi import HTTPException, Response, status

from authentification.auth import AuthClient, BulkCheckItem, BulkCheckKey
from authentification.enums import Permission, Resource, Subject
from authentification.logger import get_logger
from authentification.models import OidcUserInfo

AUTH_PERMISSIONS_HEADER = "X-Auth-Permissions"


def _set_auth_header(response: Response | None, name: str, value: str) -> None:
    """Helper function to set auth dry run headers."""
    if response is None:
        return

    response.headers[name] = value

    exposed_headers = {
        header.strip()
        for header in response.headers.get("Access-Control-Expose-Headers", "").split(",")
        if header.strip()
    }

    exposed_headers.add(name)

    response.headers["Access-Control-Expose-Headers"] = ", ".join(sorted(exposed_headers))


def _set_auth_dry_run_header(response: Response | None, dry_run: bool, name: str, value: str) -> None:
    if dry_run:
        _set_auth_header(response=response, name=name, value=value)


def _log_permission_denied(
    *,
    check: BulkCheckItem,
    dry_run: bool,
) -> None:
    """Helper function to log permission denied events."""
    prefix = "Auth dry-run would deny" if dry_run else "Missing permission"

    get_logger().warn(
        action=EventAction.NOTIFY,
        outcome=EventOutcome.FAILURE,
        category=EventCategory.AUTHENTICATION,
        message=f"{prefix} {check['resource_type']}:{check['permission']} on {check['resource_id']}",
    )


def _log_permission_granted(
    *,
    check: BulkCheckItem,
    user: OidcUserInfo,
    subject: Subject,
    dry_run: bool,
) -> None:
    prefix = "Auth dry-run would allow" if dry_run else "Permission granted"

    get_logger().info(
        action=EventAction.NOTIFY,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.AUTHENTICATION,
        message=(
            f"{prefix} {check['resource_type']}:{check['permission']} on "
            f"{check['resource_id']} for {subject}:{user.sub}"
        ),
    )


def _log_rbac_denied(
    *,
    user: OidcUserInfo,
    allowed: set[str],
    user_roles: set[str],
    dry_run: bool,
) -> None:
    prefix = "Auth dry-run would fail RBAC check" if dry_run else "RBAC check failed"
    get_logger().warn(
        action=EventAction.NOTIFY,
        outcome=EventOutcome.FAILURE,
        category=EventCategory.AUTHENTICATION,
        message=f"{prefix} for user {user.sub}. Required: {list(allowed)}, has: {list(user_roles)}",
    )


def _log_rbac_granted(
    *,
    user: OidcUserInfo,
    allowed: set[str],
    user_roles: set[str],
    require_all: bool,
    dry_run: bool,
) -> None:
    prefix = "Auth dry-run would pass RBAC check" if dry_run else "RBAC check passed"
    get_logger().info(
        action=EventAction.NOTIFY,
        outcome=EventOutcome.SUCCESS,
        category=EventCategory.AUTHENTICATION,
        message=f"{prefix} for user {user.sub}. Required: {list(allowed)}, has: {list(user_roles)}. Require all roles: {require_all}",
    )


async def _get_denied_permission_checks(
    *,
    user: OidcUserInfo,
    checks: list[BulkCheckItem],
    auth_client: AuthClient,
    subject: Subject,
) -> list[BulkCheckItem]:
    """Helper function to get permission denied events."""
    if not checks:
        return []

    if len(checks) == 1:
        check = checks[0]
        allowed = await auth_client.check_permission(
            resource_type=check["resource_type"],
            resource_id=check["resource_id"],
            permission=check["permission"],
            subject_type=subject,
            subject_id=user.sub,
        )
        return [] if allowed else [check]

    results = await auth_client.bulk_check_permissions(
        subject_type=subject,
        subject_id=user.sub,
        checks=checks,
    )

    denied: list[BulkCheckItem] = []

    for check in checks:
        key: BulkCheckKey = (
            str(check["resource_type"]),
            str(check["resource_id"]),
            str(check["permission"]),
        )

        allowed = results.get(key, False)

        if not allowed:
            denied.append(check)

    return denied


def _report_permission_decision(
    *,
    checks: list[BulkCheckItem],
    denied: list[BulkCheckItem],
    user: OidcUserInfo,
    subject: Subject,
    dry_run: bool,
    response: Response | None,
    total_checks: int,
) -> None:
    """Helper function to report permission decision and set dry run headers."""
    for check in checks:
        if check not in denied:
            _log_permission_granted(
                check=check,
                user=user,
                subject=subject,
                dry_run=dry_run,
            )

    for check in denied:
        _log_permission_denied(
            check=check,
            dry_run=dry_run,
        )

    if not dry_run:
        return

    result = f"denied:{len(denied)}/{total_checks}" if denied else f"allowed:{total_checks}/{total_checks}"

    _set_auth_header(
        response=response,
        name=AUTH_PERMISSIONS_HEADER,
        value=result,
    )


def _has_role_bypass(
    user: OidcUserInfo,
    bypass_roles: Sequence[str] | None,
) -> bool:
    """Checks whether a user has a bypass role."""
    bypass_roles_set = set(bypass_roles or [])

    user_role_set = set(user.realm_roles)
    if user_role_set & bypass_roles_set:
        get_logger().info(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.SUCCESS,
            category=EventCategory.AUTHENTICATION,
            message=(
                "ReBAC bypass granted via realm role(s) "
                f"for {user.sub}; granted_by={list(user_role_set & bypass_roles_set)}; "
                f"bypass_set={list(bypass_roles or [])}"
            ),
        )
        return True
    return False


async def check_permission(
    user: OidcUserInfo,
    resource_type: Resource,
    resource_id: str,
    permission: Permission,
    auth_client: AuthClient,
    subject: Subject = Subject.USER,
    bypass_roles: Sequence[str] | None = None,
    *,
    dry_run: bool = False,
    response: Response | None = None,
) -> None:
    """Checks a permission against a resource."""

    await check_permissions(
        user=user,
        checks=[
            BulkCheckItem(
                resource_type=resource_type,
                resource_id=resource_id,
                permission=permission,
            )
        ],
        auth_client=auth_client,
        subject=subject,
        bypass_roles=bypass_roles,
        dry_run=dry_run,
        response=response,
    )


async def check_permissions(
    *,
    user: OidcUserInfo,
    checks: list[BulkCheckItem],
    auth_client: AuthClient,
    subject: Subject = Subject.USER,
    bypass_roles: Sequence[str] | None = None,
    dry_run: bool = False,
    response: Response | None = None,
) -> None:
    """Bulk permission check for multiple resources with the same subject."""

    if not checks:
        _set_auth_dry_run_header(
            response=response,
            dry_run=dry_run,
            name=AUTH_PERMISSIONS_HEADER,
            value="allowed:0/0",
        )
        return

    if _has_role_bypass(
        user=user,
        bypass_roles=bypass_roles,
    ):
        _set_auth_dry_run_header(
            response=response,
            dry_run=dry_run,
            name=AUTH_PERMISSIONS_HEADER,
            value="bypass-role",
        )
        return

    denied = await _get_denied_permission_checks(
        user=user,
        checks=checks,
        auth_client=auth_client,
        subject=subject,
    )

    _report_permission_decision(
        checks=checks,
        denied=denied,
        user=user,
        subject=subject,
        dry_run=dry_run,
        response=response,
        total_checks=len(checks),
    )

    if denied and not dry_run:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied",
        )

    return
