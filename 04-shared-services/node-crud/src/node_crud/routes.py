from collections.abc import Awaitable, Callable
from typing import Any
from uuid import UUID, uuid4

from audit_client import audit_context_kwargs
from authentification.auth import AuthClient
from authentification.dependencies import (
    get_auth_client,
    get_current_user,
    get_verifier,
    require_permissions,
    require_role,
)
from authentification.enums import OidcRoles, Permission, Resource
from authentification.models import OidcUserInfo
from authentification.resolver import path_param
from authentification.verifier import OidcVerifier
from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from node_crud.base import ColumnAction
from node_crud.exceptions import NodeNotFoundError, ProjectVersionLockedError, VersionNotLatestError
from node_crud.permission_helpers import build_column_permission_checks, check_column_permissions
from node_crud.registry import build_registries
from node_crud.schema import build_generated_node_schemas
from node_crud.service import (
    CopyVersionNodeDirective,
    CreateNodeChange,
    DeleteNodeChange,
    NodeRef,
    NodeService,
    PatchNodeChange,
)

AUTHENTICATED_ROLES = [OidcRoles.SERVICE, OidcRoles.USER, OidcRoles.ADMIN]

# Type for a callback that resolves the latest project version given a project_id.
# Services inject this so node-crud can default to latest-version-only queries.
GetLatestVersionFn = Callable[[UUID], Awaitable[int]]
ValidateWriteVersionFn = Callable[[UUID, int], Awaitable[int]]
ValidateVersionLockFn = Callable[[UUID, int, int, str], Awaitable[None]]


def _latest_version_from_response(body: dict[str, Any]) -> int:
    latest_version = body.get("latest_version", body.get("latestVersion"))
    if latest_version is None:
        raise KeyError("latest_version")
    return int(latest_version)


def build_http_version_lock_validator(
    project_logic_service_url: str,
    *,
    timeout_seconds: float = 30.0,
) -> ValidateVersionLockFn:
    base_url = project_logic_service_url.rstrip("/")

    async def validate_version_lock(
        project_id: UUID,
        source_version: int,
        target_version: int,
        lock_token: str,
    ) -> None:
        import httpx

        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(
                f"{base_url}/projects/{project_id}/version-lock/validate",
                json={
                    "source_version": source_version,
                    "target_version": target_version,
                    "lock_token": lock_token,
                },
            )
            if response.is_error:
                raise ValueError(response.text)
            response.raise_for_status()

    return validate_version_lock


def build_http_latest_version_resolver(
    project_logic_service_url: str,
    *,
    timeout_seconds: float = 30.0,
) -> GetLatestVersionFn:
    base_url = project_logic_service_url.rstrip("/")

    async def get_latest_version(project_id: UUID) -> int:
        import httpx

        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.get(
                f"{base_url}/projects/{project_id}/latest-version",
                )
            response.raise_for_status()
        return _latest_version_from_response(response.json())

    return get_latest_version


def build_http_write_version_validator(
    project_logic_service_url: str,
    *,
    timeout_seconds: float = 30.0,
) -> ValidateWriteVersionFn:
    base_url = project_logic_service_url.rstrip("/")

    async def validate_write_version(project_id: UUID, project_version: int) -> int:
        import httpx

        async with httpx.AsyncClient(timeout=timeout_seconds) as client:
            response = await client.post(
                f"{base_url}/projects/{project_id}/version-lock/validate-write",
                json={"project_version": project_version},
            )
            if response.status_code == status.HTTP_409_CONFLICT:
                detail = response.json().get("detail", response.text)
                raise ProjectVersionLockedError(str(project_id), detail)
            response.raise_for_status()
        return _latest_version_from_response(response.json())

    return validate_write_version


async def _ensure_latest_version(
    project_id: UUID,
    project_version: int,
    get_latest_version: GetLatestVersionFn,
) -> int:
    latest_version = await get_latest_version(project_id)
    if project_version != latest_version:
        raise VersionNotLatestError(provided_version=project_version, latest_version=latest_version)
    return latest_version


async def _ensure_write_version(
    project_id: UUID,
    project_version: int,
    *,
    get_latest_version: GetLatestVersionFn | None = None,
    validate_write_version: ValidateWriteVersionFn | None = None,
) -> int:
    if validate_write_version is not None:
        return await validate_write_version(project_id, project_version)
    if get_latest_version is None:
        raise ValueError("get_latest_version is required when validate_write_version is not configured")
    return await _ensure_latest_version(project_id, project_version, get_latest_version)


class CopyVersionNode(BaseModel):
    node_type: str
    id: UUID
    set_outdated: bool = False
    overrides: dict[str, Any] = Field(default_factory=dict)


class CopyVersionRequest(BaseModel):
    source_version: int = Field(..., ge=1)
    target_version: int = Field(..., ge=1)
    lock_token: str = Field(..., min_length=1)
    dry_run: bool
    nodes: list[CopyVersionNode] = Field(default_factory=list)


class CopyVersionResponse(BaseModel):
    dry_run: bool
    copied: int


class UndoVersionRequest(BaseModel):
    target_version: int = Field(..., ge=1)
    lock_token: str = Field(..., min_length=1)


class UndoVersionResponse(BaseModel):
    deleted: dict[str, int]


def generate_node_routes(  # noqa: C901
    base: type,
    get_db_session: Any,
    add_update_endpoint: bool = True,
    audit_log_enabled: bool = False,
    get_latest_version: GetLatestVersionFn | None = None,
    validate_write_version: ValidateWriteVersionFn | None = None,
    validate_version_lock: ValidateVersionLockFn | None = None,
) -> APIRouter:
    """Build a fully-wired CRUD router from a SQLAlchemy declarative base.

    Discovers every model registered on *base*, generates Pydantic schemas for
    them, and returns an ``APIRouter`` with three endpoints:

    - ``GET  /{project_id}/nodes``       – list all nodes (lightweight summaries)
    - ``POST /{project_id}/batch-nodes`` – batch-fetch nodes with full payloads
    - ``POST /{project_id}/update``      – insert / update / delete in one transaction
    """
    model_registry, parent_fk_map = build_registries(base)
    schemas = build_generated_node_schemas(model_registry, parent_fk_map)

    async def _resolve_project_version(project_id: UUID, project_version: int | None) -> int:
        if project_version is not None:
            return project_version
        if get_latest_version is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="project_version query parameter is required when no latest-version resolver is configured",
            )
        return await get_latest_version(project_id)

    async def _validate_version_lock(
        project_id: UUID,
        source_version: int,
        target_version: int,
        lock_token: str,
    ) -> None:
        if validate_version_lock is None:
            return
        await validate_version_lock(project_id, source_version, target_version, lock_token)

    class NodesListResponse(schemas.nodes_list_response):
        pass

    class BatchGetNodesRequest(schemas.batch_get_nodes_request):
        pass

    class BatchGetNodesResponse(schemas.batch_get_nodes_response):
        pass

    class ProcessNodeChangesRequest(schemas.process_node_changes_request):
        pass

    class ProcessNodeChangesResponse(schemas.process_node_changes_response):
        pass

    svc = NodeService(model_registry, parent_fk_map)

    router = APIRouter(tags=["Nodes"], prefix="/{project_id}")

    @router.get(
        "/nodes",
        # No validation because this requires data to be loaded into memory
        # which makes requests take twice as long + OOM errors / GC pauses
        responses={200: {"model": NodesListResponse}},
        summary="List all nodes for a project (lightweight, no payload)",
        dependencies=[
            Depends(
                require_permissions(
                    (Resource.PROJECT, Permission.READ, path_param("project_id")),
                    bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
                ),
            )
        ],
    )
    async def list_nodes(
        project_id: UUID,
        project_version: int | None = Query(None, description="Filter by project version. Defaults to latest."),
        db: AsyncSession = Depends(get_db_session),
    ) -> StreamingResponse:
        resolved_version = await _resolve_project_version(project_id, project_version)
        return StreamingResponse(
            await svc.stream_all_nodes_json(project_id, db, project_version=resolved_version),
            media_type="application/json",
        )

    @router.post(
        "/batch-nodes",
        response_model=BatchGetNodesResponse,
        summary="Get multiple nodes with full payload",
        dependencies=[
            Depends(
                require_permissions(
                    (Resource.PROJECT, Permission.READ, path_param("project_id")),
                    bypass_roles=[OidcRoles.ADMIN, OidcRoles.USER, OidcRoles.SERVICE],
                ),
            )
        ],
    )
    async def batch_get(
        project_id: UUID,
        payload: BatchGetNodesRequest,
        project_version: int | None = Query(None, description="Filter by project version. Defaults to latest."),
        db: AsyncSession = Depends(get_db_session),
    ) -> BatchGetNodesResponse:
        resolved_version = await _resolve_project_version(project_id, project_version)
        refs = [NodeRef(id=UUID(n.id), node_type=n.node_type) for n in payload.nodes]
        results = await svc.batch_get_nodes(project_id, refs, db, project_version=resolved_version)
        return BatchGetNodesResponse(results=[{**r["payload"], "node_type": r["node_type"]} for r in results])

    if add_update_endpoint:

        @router.post(
            "/update",
            response_model=ProcessNodeChangesResponse,
            summary="Insert, update, and delete nodes in a single transaction",
            dependencies=[
                Depends(require_role(allowed_roles=AUTHENTICATED_ROLES)),
                Depends(
                    require_permissions(
                        (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                        bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
                    ),
                ),
            ],
        )
        async def update_nodes(
            project_id: UUID,
            payload: ProcessNodeChangesRequest,
            request: Request,
            response: Response,
            project_version: int = Query(
                ...,
                description="Target project version. Normal writes must explicitly target the latest version.",
            ),
            db: AsyncSession = Depends(get_db_session),
            user: OidcUserInfo | None = Depends(get_current_user),
            verifier: OidcVerifier = Depends(get_verifier),
            auth_client: AuthClient = Depends(get_auth_client),
        ) -> ProcessNodeChangesResponse:
            try:
                resolved_version = await _ensure_write_version(
                    project_id,
                    project_version,
                    get_latest_version=get_latest_version,
                    validate_write_version=validate_write_version,
                )
            except (ProjectVersionLockedError, VersionNotLatestError, ValueError) as exc:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
            inserts = [
                CreateNodeChange(
                    node_type=a.node_type,
                    payload=a.payload,
                    project_id=project_id,
                    id=UUID(a.id) if a.id else uuid4(),
                )
                for a in payload.inserts
            ]
            updates = [
                PatchNodeChange(id=UUID(a.id), node_type=a.node_type, payload=a.payload) for a in payload.updates
            ]
            deletes = [DeleteNodeChange(id=UUID(a.id), node_type=a.node_type) for a in payload.deletes]
            column_permission_checks = [
                *build_column_permission_checks(
                    model_registry=model_registry,
                    project_id=project_id,
                    changes=inserts,
                    action=ColumnAction.CREATE,
                ),
                *build_column_permission_checks(
                    model_registry=model_registry,
                    project_id=project_id,
                    changes=updates,
                    action=ColumnAction.UPDATE,
                ),
            ]
            await check_column_permissions(
                checks=column_permission_checks,
                user=user,
                verifier=verifier,
                auth_client=auth_client,
                response=response,
            )

            result = await svc.process_update(
                inserts=inserts,
                updates=updates,
                deletes=deletes,
                db=db,
                project_id=project_id,
                project_version=resolved_version,
                hard_delete=False,
                audit_log_enabled=audit_log_enabled,
                audit_context=audit_context_kwargs(request) if audit_log_enabled else None,
            )

            return ProcessNodeChangesResponse(
                inserted=[{**r["payload"], "node_type": r["node_type"]} for r in result["inserted"]],
                updated=[{**r["payload"], "node_type": r["node_type"]} for r in result["updated"]],
                deleted=[{"node_type": r["node_type"], "id": str(r["payload"]["id"])} for r in result["deleted"]],
            )

    @router.post(
        "/copy-version",
        response_model=CopyVersionResponse,
        summary="Coordinator-only project-version copy endpoint",
        dependencies=[
            Depends(
                require_permissions(
                    (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                    bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
                ),
            )
        ],
    )
    async def copy_version_nodes(
        project_id: UUID,
        payload: CopyVersionRequest,
        db: AsyncSession = Depends(get_db_session),
    ) -> CopyVersionResponse:
        try:
            await _validate_version_lock(
                project_id,
                payload.source_version,
                payload.target_version,
                payload.lock_token,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        if payload.target_version <= payload.source_version:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="target_version must be greater than source_version",
            )

        directives = [
            CopyVersionNodeDirective(
                id=node.id,
                node_type=node.node_type,
                set_outdated=node.set_outdated,
                overrides=node.overrides,
            )
            for node in payload.nodes
        ]
        try:
            result = await svc.copy_project_version_nodes(
                project_id=project_id,
                source_version=payload.source_version,
                target_version=payload.target_version,
                nodes=directives,
                db=db,
                dry_run=payload.dry_run,
            )
        except NodeNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=exc.message,
            ) from exc
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        return CopyVersionResponse(dry_run=payload.dry_run, copied=result["copied"])

    @router.post(
        "/undo-version",
        response_model=UndoVersionResponse,
        summary="Coordinator-only hard cleanup for failed project-version creation",
        dependencies=[
            Depends(
                require_permissions(
                    (Resource.PROJECT, Permission.UPDATE, path_param("project_id")),
                    bypass_roles=[OidcRoles.ADMIN, OidcRoles.SERVICE],
                ),
            )
        ],
    )
    async def undo_version(
        project_id: UUID,
        payload: UndoVersionRequest,
        db: AsyncSession = Depends(get_db_session),
    ) -> UndoVersionResponse:
        latest_version = await _resolve_project_version(project_id, None)
        try:
            await _validate_version_lock(
                project_id,
                latest_version,
                payload.target_version,
                payload.lock_token,
            )
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
        if latest_version >= payload.target_version:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="undo-version requires latest version to be lower than target_version",
            )
        deleted = await svc.hard_delete_project_version(
            project_id=project_id,
            project_version=payload.target_version,
            db=db,
        )
        return UndoVersionResponse(deleted=deleted)

    return router
