from typing import Any

import httpx
from temporalio import activity

from src.config.settings import settings


@activity.defn(name="get_norm_deconstruction")
async def _get_norm_deconstruction(args: dict[str, Any]) -> dict[str, Any] | None:
    """Check norm_deconstruction table for a pre-computed result."""
    base = settings.api.examination_service_base_url
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.get(
            f"{base}/norm-deconstructions/",
            params={"jurabk": args["jurabk"], "paragraph": args["paragraph_nr"]},
        )
        resp.raise_for_status()
        results = resp.json()
        if results:
            return results[0]["deconstruction"]
    return None


@activity.defn(name="save_norm_deconstruction")
async def _save_norm_deconstruction(args: dict[str, Any]) -> None:
    """Persist a Rechtsmethodik result to the norm_deconstruction table."""
    base = settings.api.examination_service_base_url
    async with httpx.AsyncClient(timeout=30) as client:
        await client.post(
            f"{base}/norm-deconstructions/",
            json=[
                {"jurabk": args["jurabk"], "paragraph": args["paragraph_nr"], "deconstruction": args["deconstruction"]}
            ],
        )
