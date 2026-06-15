import logging

from temporalio import activity

from temporal.tracking_client import StatusPayload, TrackingClient

logger = logging.getLogger("temporal.activities.tracking")

_tracking_client: TrackingClient | None = None


def configure_tracking(client: TrackingClient) -> None:
    global _tracking_client
    _tracking_client = client


@activity.defn(name="_post_status_activity")
async def post_status_activity(args: StatusPayload) -> None:
    if _tracking_client is None:
        return
    await _tracking_client.post_status(args)
