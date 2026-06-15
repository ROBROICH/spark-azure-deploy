"""ClamAV REST API client for virus scanning uploaded files."""

from collections.abc import AsyncIterable
from dataclasses import dataclass

import httpx
from fastapi import status
from event_logging.enums import EventAction, EventCategory, EventOutcome

from src.config.settings import ClamAVSettings
from src.utils.exceptions import VirusScanUnavailableError
from src.utils.logger import logger


@dataclass
class VirusScanResult:
    """Result of a ClamAV scan — carries the verdict and optional threat name."""

    is_clean: bool
    threat_name: str | None = None


async def scan_bytes(content: bytes, settings: ClamAVSettings) -> VirusScanResult:
    """Scan file content bytes via ClamAV REST API.

    Returns VirusScanResult(is_clean=True) when scanning is disabled.
    Raises VirusScanUnavailableError on connection/timeout errors (fail-closed).
    """
    if not settings.ENABLED:
        logger.warn(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.UNKNOWN,
            category=EventCategory.FILE,
            message=(
                "ClamAV scanning is DISABLED - file bypassing malware check. "
                "This should only occur in local development environments. "
                f"File size: {len(content)} bytes"
            ),
        )
        return VirusScanResult(is_clean=True)

    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(settings.TIMEOUT_SECONDS)) as client:
            response = await client.post(
                f"{settings.BASE_URL}/api/stream-scan",
                content=content,
                headers={"Content-Type": "application/octet-stream"},
            )
    except (httpx.ConnectError, httpx.TimeoutException) as exc:
        raise VirusScanUnavailableError(f"Virus scanner not reachable: {exc}") from exc

    return _parse_response(response)


async def scan_stream(stream: AsyncIterable[bytes], settings: ClamAVSettings) -> VirusScanResult:
    """Scan a streaming file via ClamAV REST API.

    Collects the stream into memory before sending — ClamAV REST API
    expects the full body in a single POST.

    Returns VirusScanResult(is_clean=True) when scanning is disabled.
    Raises VirusScanUnavailableError on connection/timeout errors (fail-closed).
    """
    if not settings.ENABLED:
        logger.warn(
            action=EventAction.NOTIFY,
            outcome=EventOutcome.UNKNOWN,
            category=EventCategory.FILE,
            message=(
                "ClamAV scanning is DISABLED - streaming file bypassing malware check. "
                "This should only occur in local development environments."
            ),
        )
        return VirusScanResult(is_clean=True)

    chunks: list[bytes] = []
    async for chunk in stream:
        chunks.append(chunk)
    content = b"".join(chunks)

    return await scan_bytes(content, settings)


def _parse_response(response: httpx.Response) -> VirusScanResult:
    """Parse ClamAV REST API response.

    The ClamAV API returns status in both the HTTP code and the JSON body:
    - HTTP 200 + {"status": "OK"}  → clean
    - HTTP 200 + {"status": "FOUND", "message": "..."} → virus detected
    - HTTP 406 + {"status": "FOUND", ...} → virus detected (alt. response)
    - HTTP 502/504 → scanner error
    """
    if response.status_code in (200, 406):
        try:
            data = response.json()
        except Exception as exc:
            # HTTP 406 is ClamAV's "virus found" status — treat unparseable body as virus
            if response.status_code == status.HTTP_406_NOT_ACCEPTABLE:
                return VirusScanResult(is_clean=False, threat_name=None)
            raise VirusScanUnavailableError(
                f"Virus scanner returned unparseable response (HTTP {response.status_code}): {response.text[:200]}"
            ) from exc

        if data.get("status") == "FOUND" or response.status_code == status.HTTP_406_NOT_ACCEPTABLE:
            threat_name = data.get("message") or data.get("viruses", [None])[0]
            return VirusScanResult(is_clean=False, threat_name=threat_name)

        return VirusScanResult(is_clean=True)

    raise VirusScanUnavailableError(
        f"Virus scanner returned unexpected status {response.status_code}: {response.text[:200]}"
    )
