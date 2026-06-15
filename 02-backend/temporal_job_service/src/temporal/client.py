from temporal import get_temporal_client as _get_temporal_client
from temporalio.client import Client


async def get_temporal_client() -> Client:
    return await _get_temporal_client()
