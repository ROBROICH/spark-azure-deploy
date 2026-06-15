from typing import Any
from uuid import UUID

import httpx
from authentification.internal_api_key import internal_api_key_headers
from temporalio import activity

_HTTP_TIMEOUT_SECONDS = 600.0


@activity.defn
async def list_service_nodes(
    service_base_url: str,
    service_name: str,
    project_id: UUID,
    project_version: int,
) -> list[dict[str, Any]]:
    url = f"{service_base_url.rstrip('/')}/{project_id}/nodes"
    params = {"project_version": project_version}
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS, headers=internal_api_key_headers()) as client:
        resp = await client.get(url, params=params)
        resp.raise_for_status()
        body = resp.json()
    nodes = body.get("nodes", [])
    return [{**node, "_service": service_name} for node in nodes]


@activity.defn
async def batch_get_service_nodes(
    service_base_url: str,
    service_name: str,
    project_id: UUID,
    project_version: int,
    nodes: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    url = f"{service_base_url.rstrip('/')}/{project_id}/batch-nodes"
    payload = {"nodes": nodes}
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS, headers=internal_api_key_headers()) as client:
        resp = await client.post(url, params={"project_version": project_version}, json=payload)
        resp.raise_for_status()
        body = resp.json()
    return [{**node, "_service": service_name} for node in body.get("results", [])]


@activity.defn
async def copy_service_version_nodes(
    service_base_url: str,
    project_id: UUID,
    source_version: int,
    target_version: int,
    lock_token: str,
    nodes: list[dict[str, Any]],
    dry_run: bool,
) -> dict[str, Any]:
    url = f"{service_base_url.rstrip('/')}/{project_id}/copy-version"
    payload = {
        "source_version": source_version,
        "target_version": target_version,
        "lock_token": lock_token,
        "dry_run": dry_run,
        "nodes": nodes,
    }
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS, headers=internal_api_key_headers()) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()


@activity.defn
async def undo_service_version(
    service_base_url: str,
    project_id: UUID,
    target_version: int,
    lock_token: str,
) -> dict[str, Any]:
    url = f"{service_base_url.rstrip('/')}/{project_id}/undo-version"
    payload = {"target_version": target_version, "lock_token": lock_token}
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS, headers=internal_api_key_headers()) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()


@activity.defn
async def get_dms_zip_diff(
    dms_base_url: str,
    project_id: UUID,
    zip_file_id: UUID,
    source_version: int,
) -> dict[str, Any]:
    url = f"{dms_base_url.rstrip('/')}/v2/internal/files/{project_id}/zips/{zip_file_id}/diff"
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS, headers=internal_api_key_headers()) as client:
        resp = await client.get(url, params={"source_version": source_version})
        resp.raise_for_status()
        return resp.json()


@activity.defn
async def update_dms_zip_approval_status(
    dms_base_url: str,
    project_id: UUID,
    zip_file_id: UUID,
    approval_status: str,
    error: str | None = None,
) -> dict[str, Any]:
    url = f"{dms_base_url.rstrip('/')}/v2/internal/files/{project_id}/zips/{zip_file_id}/approval-status"
    payload = {"approval_status": approval_status, "error": error}
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS, headers=internal_api_key_headers()) as client:
        resp = await client.patch(url, json=payload)
        resp.raise_for_status()
        return resp.json()


@activity.defn
async def commit_dms_zip_diff(
    dms_base_url: str,
    project_id: UUID,
    zip_file_id: UUID,
    source_version: int,
    target_version: int,
    lock_token: str,
    dry_run: bool,
) -> dict[str, Any]:
    url = f"{dms_base_url.rstrip('/')}/v2/internal/files/{project_id}/zips/{zip_file_id}/commit-diff"
    payload = {
        "source_version": source_version,
        "target_version": target_version,
        "lock_token": lock_token,
        "dry_run": dry_run,
    }
    async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT_SECONDS, headers=internal_api_key_headers()) as client:
        resp = await client.post(url, json=payload)
        resp.raise_for_status()
        return resp.json()
