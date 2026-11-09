import asyncio

from temporalio import activity, workflow
from temporalio.exceptions import is_cancelled_exception

# Logging and tracking ask the same patch, so the status a run posts matches how it ends,
# also when one of them decided before a deploy and the other after it.
CANCEL_PASSTHROUGH_PATCH_ID = "cancel-passthrough"


def is_abort(error: BaseException) -> bool:
    """Whether the error is the run's own cancellation: the SDK cancels a run only after a cancel request."""
    return is_cancelled_exception(error) and workflow.cancellation_reason() is not None


def ends_cancelled(error: BaseException) -> bool:
    """Whether the run ends as cancelled; runs recorded before the passthrough keep their failure.

    Nothing ever wrapped a bare CancelledError, so it ends a run as cancelled without the patch.
    """
    return is_abort(error) and (
        isinstance(error, asyncio.CancelledError) or workflow.patched(CANCEL_PASSTHROUGH_PATCH_ID)
    )


def activity_ends_cancelled(error: BaseException) -> bool:
    """Whether the activity ends as cancelled; the SDK fails one cancelled by a pause or reset.

    A local heartbeat error after a cancel request also fails it, but the SDK keeps that private.
    """
    details = activity.cancellation_details()
    if details is None or details.paused or details.reset:
        return False
    return is_cancelled_exception(error) and (details.cancel_requested or details.worker_shutdown)
