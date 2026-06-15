"""Qdrant point counting activity for idempotency checks."""

from datetime import timedelta

from qdrant_client import models as qm
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.activities.qdrant.client import _get_qdrant_client
from src.config import get_config
from src.env import ENV

__all__ = [
    "_count_qdrant_project_points",
    "count_qdrant_project_points",
]


@activity.defn(name="count_qdrant_project_points")
async def _count_qdrant_project_points(project_id: str) -> int:
    """Count non-deleted Qdrant points for a project. Returns 0 if collection doesn't exist."""
    client = _get_qdrant_client()
    try:
        col_name = ENV.QDRANT_COLLECTION_NAME
        if not await client.collection_exists(col_name):
            return 0
        result = await client.count(
            collection_name=col_name,
            count_filter=qm.Filter(
                must=[
                    qm.FieldCondition(key="project_id", match=qm.MatchValue(value=project_id)),
                ],
                must_not=[
                    qm.FieldCondition(key="is_deleted", match=qm.MatchValue(value=True)),
                ],
            ),
            exact=True,
        )
        return result.count
    finally:
        await client.close()


async def count_qdrant_project_points(project_id: str) -> int:
    """Workflow wrapper: count non-deleted Qdrant points for a project."""
    return await workflow.execute_activity(
        _count_qdrant_project_points,
        project_id,
        start_to_close_timeout=timedelta(seconds=30),
        retry_policy=RetryPolicy(
            maximum_attempts=get_config().TEMPORAL_QDRANT_ACTIVITY_MAX_ATTEMPTS,
            non_retryable_error_types=["ValueError"],
            initial_interval=timedelta(seconds=5),
            backoff_coefficient=2,
            maximum_interval=timedelta(seconds=60),
        ),
    )
