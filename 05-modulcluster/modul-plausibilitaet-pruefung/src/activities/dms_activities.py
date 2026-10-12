"""Temporal activities for DMS (Document Management Service) operations."""

import asyncio
from typing import Any

from pydantic import BaseModel
from temporal.contracts import DMSFileResponse
from temporalio import activity

from src.activities import consolidation
from src.activities.confidence import confidence
from src.dms.schemas import BaseMetadata, ProjectBaseMetadataStatus
from src.workflows.clients import dms_client


class UploadTemporalCheckpointInput(BaseModel):
    """Input parameters for the upload_temporal_checkpoint activity."""

    project_id: str
    workflow_id: str
    run_id: str
    filename: str
    payload: Any


class AggregateCheckpointsInput(BaseModel):
    """Input parameters for aggregating multiple files into one."""

    project_id: str
    workflow_id: str
    run_id: str
    filename: str
    file_ids: list[str]


class ProjectMetadataResult(BaseModel):
    """Pre-fetched project metadata from DMS."""

    metadata: BaseMetadata
    status: ProjectBaseMetadataStatus


@activity.defn
async def fetch_erlauterungsbericht_document_ids(classification_file_id: str | None) -> list[str]:
    """ID of the highest-confidence Erläuterungsbericht from the DMS classification; empty if none."""
    if not classification_file_id:
        return []
    return await dms_client.fetch_erlauterungsbericht_document_ids(classification_file_id)


@activity.defn
async def fetch_project_metadata(project_id: str) -> ProjectMetadataResult:
    """Fetch project base metadata from DMS."""
    metadata, status = await dms_client.get_project_base_metadata(project_id=project_id)
    return ProjectMetadataResult(metadata=metadata, status=status)


@activity.defn
async def upload_temporal_checkpoint(
    params: UploadTemporalCheckpointInput,
) -> DMSFileResponse:
    """Temporal activity to upload a checkpoint to the DMS."""
    return await dms_client.upload_temporal_checkpoint(
        project_id=params.project_id,
        workflow_id=params.workflow_id,
        run_id=params.run_id,
        filename=params.filename,
        payload=params.payload,
    )


@activity.defn
async def aggregate_and_upload_checkpoints(
    params: AggregateCheckpointsInput,
) -> DMSFileResponse:
    """Downloads multiple JSON files, aggregates contradictions, and uploads the result."""
    download_tasks = [dms_client.download_json(file_id=fid) for fid in params.file_ids]
    async with asyncio.TaskGroup() as tg:
        task_objs = [tg.create_task(t) for t in download_tasks]
    raw_results = [t.result() for t in task_objs]

    all_contradictions: list[dict[str, Any]] = []
    for doc_result in raw_results:
        if "contradictions" in doc_result:
            all_contradictions.extend(doc_result["contradictions"])

    final_payload = {"contradictions": finalize_project(all_contradictions)}

    return await dms_client.upload_temporal_checkpoint(
        project_id=params.project_id,
        workflow_id=params.workflow_id,
        run_id=params.run_id,
        filename=params.filename,
        payload=final_payload,
    )


def _score(item: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        value = item.get(key)
        if isinstance(value, int | float):
            return float(value)
    return None


def finalize_project(contradictions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Project-wide duplicate consolidation, then the confidence of the merged entries."""
    return apply_project_confidence(consolidation.project_wide(contradictions))


def apply_project_confidence(contradictions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Set the confidence from the raw scores and sort by it; legacy entries without score_a keep theirs."""
    scored = [c for c in contradictions if _score(c, "score_a", "scoreA") is not None]
    if scored:
        values = confidence(
            [_score(c, "score_a", "scoreA") or 0.0 for c in scored],
            [_score(c, "score_b", "scoreB") for c in scored],
        )
        for c, k in zip(scored, values, strict=True):
            key = "confidenceScore" if "confidenceScore" in c else "confidence_score"
            c[key] = k
    return sorted(contradictions, key=lambda c: -(_score(c, "confidence_score", "confidenceScore") or 0.0))
