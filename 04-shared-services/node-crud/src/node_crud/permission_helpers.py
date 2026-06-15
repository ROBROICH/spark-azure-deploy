from dataclasses import dataclass
from typing import Any
from uuid import UUID

from authentification.auth import AuthClient, BulkCheckItem, BulkCheckKey
from authentification.auth_utils import check_permissions
from authentification.enums import AuthMode, OidcRoles, Permission, Resource, Subject
from authentification.models import OidcUserInfo
from authentification.verifier import OidcVerifier
from fastapi import HTTPException, Response, status

from node_crud.base import IGNORE_VALUES_KEY, PERMISSIONS_KEY, ColumnAction
from node_crud.registry import NodeModelRegistry
from node_crud.service import CreateNodeChange, PatchNodeChange

ColumnPermissionSpec = Permission | tuple[Resource, Permission]


@dataclass(frozen=True)
class ColumnPermissionRule:
    permissions: tuple[ColumnPermissionSpec | str, ...]
    ignore_values: tuple[Any, ...] = ()


@dataclass(frozen=True)
class PermissionsMatrix:
    read: ColumnPermissionRule | None = None
    create: ColumnPermissionRule | None = None
    update: ColumnPermissionRule | None = None
    delete: ColumnPermissionRule | None = None


def _normalize_column_permission_spec(spec: ColumnPermissionSpec | str) -> tuple[Resource, Permission]:
    if isinstance(spec, tuple):
        resource_type, permission = spec
        return Resource(str(resource_type)), Permission(str(permission))
    return Resource.PROJECT, Permission(str(spec))


def _legacy_rule_from_config(specs: Any) -> ColumnPermissionRule:
    if isinstance(specs, ColumnPermissionRule):
        return specs

    if isinstance(specs, dict):
        permissions = specs.get(PERMISSIONS_KEY, [])
        ignore_values = specs.get(IGNORE_VALUES_KEY, [])
    else:
        permissions = specs
        ignore_values = []

    if permissions is None:
        permission_specs = ()
    elif isinstance(permissions, Permission | str):
        permission_specs = (permissions,)
    elif isinstance(permissions, tuple) and len(permissions) == 2:
        try:
            permission_specs = ((Resource(str(permissions[0])), Permission(str(permissions[1]))),)
        except ValueError:
            permission_specs = tuple(permissions)
    else:
        permission_specs = tuple(permissions)

    if ignore_values is None:
        ignored_values = ()
    elif isinstance(ignore_values, tuple | list | set):
        ignored_values = tuple(ignore_values)
    else:
        ignored_values = (ignore_values,)

    return ColumnPermissionRule(permissions=permission_specs, ignore_values=ignored_values)


def _column_permission_rule_for_action(column_info: dict[str, Any], action: ColumnAction) -> ColumnPermissionRule:
    permissions = column_info.get(PERMISSIONS_KEY)
    if isinstance(permissions, PermissionsMatrix):
        return getattr(permissions, action.value) or ColumnPermissionRule(permissions=())

    if not isinstance(permissions, dict):
        return ColumnPermissionRule(permissions=())

    action_permission = Permission(action.value)
    for key in (action, action_permission, str(action), action_permission.value):
        specs = permissions.get(key)
        if specs is None:
            continue
        return _legacy_rule_from_config(specs)
    return ColumnPermissionRule(permissions=())


def build_column_permission_checks(
    *,
    model_registry: NodeModelRegistry,
    project_id: UUID,
    changes: list[CreateNodeChange] | list[PatchNodeChange],
    action: ColumnAction,
) -> list[BulkCheckItem]:
    checks: list[BulkCheckItem] = []
    seen: set[BulkCheckKey] = set()

    for change in changes:
        model = model_registry[change.node_type]
        payload = change.payload.model_dump(exclude_unset=True)
        for column_name, value in payload.items():
            column = model.__table__.columns.get(column_name)  # type: ignore[attr-defined]
            if column is None:
                continue
            rule = _column_permission_rule_for_action(column.info, action)
            if any(value == ignored_value for ignored_value in rule.ignore_values):
                continue
            for spec in rule.permissions:
                resource_type, permission = _normalize_column_permission_spec(spec)
                resource_id = str(project_id)
                key: BulkCheckKey = (str(resource_type), resource_id, str(permission))
                if key in seen:
                    continue
                seen.add(key)
                checks.append(
                    BulkCheckItem(
                        resource_type=resource_type,
                        resource_id=resource_id,
                        permission=permission,
                    )
                )

    return checks


async def check_column_permissions(
    *,
    checks: list[BulkCheckItem],
    user: OidcUserInfo | None,
    verifier: OidcVerifier,
    auth_client: AuthClient,
    response: Response,
) -> None:
    if not checks:
        return
    if verifier.requires_user and user is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Authentication required")
    if user is None:
        return

    deduped_checks: list[BulkCheckItem] = []
    seen: set[BulkCheckKey] = set()
    for check in checks:
        key: BulkCheckKey = (
            str(check["resource_type"]),
            str(check["resource_id"]),
            str(check["permission"]),
        )
        if key in seen:
            continue
        seen.add(key)
        deduped_checks.append(check)

    await check_permissions(
        user=user,
        checks=deduped_checks,
        auth_client=auth_client,
        subject=Subject.USER,
        bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
        dry_run=verifier.auth_mode == AuthMode.OPTIONAL_VERIFY_DRY_RUN,
        response=response,
    )
