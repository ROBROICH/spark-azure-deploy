from uuid import UUID

from temporalio import activity

from src.workflows.batch_mvp.cached_norm_processing import (
    fetch_project_norms,
    process_cached_norm_deconstructions,
)
from src.workflows.batch_mvp.types import (
    CachedNormDeconstructionBatchInput,
    CachedNormDeconstructionBatchOutput,
    NormRef,
)


@activity.defn(name="fetch_project_norms")
async def _fetch_project_norms(project_id: UUID) -> list[NormRef]:
    return await fetch_project_norms(project_id)


@activity.defn(name="process_cached_norm_deconstructions")
async def _process_cached_norm_deconstructions(
    args: CachedNormDeconstructionBatchInput,
) -> CachedNormDeconstructionBatchOutput:
    return await process_cached_norm_deconstructions(args.project_id, args.norms)
