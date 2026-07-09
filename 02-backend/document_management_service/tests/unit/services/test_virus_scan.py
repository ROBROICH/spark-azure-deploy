"""Unit tests for the ClamAV REST client (src/services/virus_scan.py)."""

import httpx
import pytest

from src.config.settings import ClamAVSettings
from src.services.virus_scan import scan_bytes, scan_stream
from src.utils.exceptions import VirusScanUnavailableError


def _settings(enabled: bool = True) -> ClamAVSettings:
    return ClamAVSettings(
        ENABLED=enabled,
        BASE_URL="http://clamav-test:6000",
        TIMEOUT_SECONDS=5,
    )


@pytest.mark.asyncio
async def test_scan_bytes_disabled():
    """When ClamAV is disabled, always return clean."""
    result = await scan_bytes(b"anything", _settings(enabled=False))
    assert result.is_clean is True
    assert result.threat_name is None


@pytest.mark.asyncio
async def test_scan_bytes_clean(httpx_mock):
    """HTTP 200 → file is clean."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=200,
        json={"status": "ok"},
    )
    result = await scan_bytes(b"clean-content", _settings())
    assert result.is_clean is True


@pytest.mark.asyncio
async def test_scan_bytes_virus_detected(httpx_mock):
    """HTTP 406 → virus detected, threat name extracted from 'message' field."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=406,
        json={"status": "FOUND", "message": "Eicar-Test-Signature"},
    )
    result = await scan_bytes(b"eicar-content", _settings())
    assert result.is_clean is False
    assert result.threat_name == "Eicar-Test-Signature"


@pytest.mark.asyncio
async def test_scan_bytes_virus_detected_http200_found(httpx_mock):
    """HTTP 200 + status=FOUND → virus detected (real ClamAV behavior)."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=200,
        json={"status": "FOUND", "message": "Eicar-Test-Signature"},
    )
    result = await scan_bytes(b"eicar-content", _settings())
    assert result.is_clean is False
    assert result.threat_name == "Eicar-Test-Signature"


@pytest.mark.asyncio
async def test_scan_bytes_virus_detected_no_json(httpx_mock):
    """HTTP 406 with unparseable body → virus detected, no threat name."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=406,
        text="not json",
    )
    result = await scan_bytes(b"eicar-content", _settings())
    assert result.is_clean is False
    assert result.threat_name is None


@pytest.mark.asyncio
async def test_scan_bytes_scanner_error_502(httpx_mock):
    """HTTP 502 → VirusScanUnavailableError (fail-closed)."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=502,
        text="Bad Gateway",
    )
    with pytest.raises(VirusScanUnavailableError):
        await scan_bytes(b"content", _settings())


@pytest.mark.asyncio
async def test_scan_bytes_scanner_error_504(httpx_mock):
    """HTTP 504 → VirusScanUnavailableError."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=504,
        text="Gateway Timeout",
    )
    with pytest.raises(VirusScanUnavailableError):
        await scan_bytes(b"content", _settings())


@pytest.mark.asyncio
async def test_scan_bytes_connection_error(httpx_mock):
    """Connection error → VirusScanUnavailableError."""
    httpx_mock.add_exception(
        httpx.ConnectError("Connection refused"),
        url="http://clamav-test:6000/api/stream-scan",
    )
    with pytest.raises(VirusScanUnavailableError, match="not reachable"):
        await scan_bytes(b"content", _settings())


@pytest.mark.asyncio
async def test_scan_bytes_timeout(httpx_mock):
    """Timeout → VirusScanUnavailableError."""
    httpx_mock.add_exception(
        httpx.ReadTimeout("timed out"),
        url="http://clamav-test:6000/api/stream-scan",
    )
    with pytest.raises(VirusScanUnavailableError, match="not reachable"):
        await scan_bytes(b"content", _settings())


@pytest.mark.asyncio
async def test_scan_stream_disabled():
    """When disabled, scan_stream returns clean without consuming stream."""

    async def _stream():
        yield b"chunk1"
        yield b"chunk2"

    result = await scan_stream(_stream(), _settings(enabled=False))
    assert result.is_clean is True


@pytest.mark.asyncio
async def test_scan_stream_clean(httpx_mock):
    """scan_stream collects chunks and scans them."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=200,
        json={"status": "OK"},
    )

    async def _stream():
        yield b"chunk1"
        yield b"chunk2"

    result = await scan_stream(_stream(), _settings())
    assert result.is_clean is True


@pytest.mark.asyncio
async def test_scan_bytes_unexpected_status_error(httpx_mock):
    """HTTP 200 with status=ERROR → VirusScanUnavailableError (fail-closed)."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=200,
        json={"status": "ERROR", "error": "Database outdated"},
    )
    with pytest.raises(VirusScanUnavailableError, match="unexpected status 'ERROR'"):
        await scan_bytes(b"content", _settings())


@pytest.mark.asyncio
async def test_scan_bytes_unexpected_status_unknown(httpx_mock):
    """HTTP 200 with status=UNKNOWN → VirusScanUnavailableError (fail-closed)."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=200,
        json={"status": "UNKNOWN"},
    )
    with pytest.raises(VirusScanUnavailableError, match="unexpected status 'UNKNOWN'"):
        await scan_bytes(b"content", _settings())


@pytest.mark.asyncio
async def test_scan_bytes_empty_status(httpx_mock):
    """HTTP 200 with empty status → VirusScanUnavailableError (fail-closed)."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=200,
        json={"status": ""},
    )
    with pytest.raises(VirusScanUnavailableError, match="unexpected status ''"):
        await scan_bytes(b"content", _settings())


@pytest.mark.asyncio
async def test_scan_bytes_missing_status(httpx_mock):
    """HTTP 200 with missing status field → VirusScanUnavailableError (fail-closed)."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=200,
        json={"result": "something"},
    )
    with pytest.raises(VirusScanUnavailableError, match="unexpected status"):
        await scan_bytes(b"content", _settings())


@pytest.mark.asyncio
async def test_scan_bytes_case_insensitive_ok(httpx_mock):
    """HTTP 200 with status=ok (lowercase) → clean (case-insensitive)."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=200,
        json={"status": "ok"},
    )
    result = await scan_bytes(b"content", _settings())
    assert result.is_clean is True


@pytest.mark.asyncio
async def test_scan_bytes_case_insensitive_found(httpx_mock):
    """HTTP 200 with status=found (lowercase) → virus detected (case-insensitive)."""
    httpx_mock.add_response(
        url="http://clamav-test:6000/api/stream-scan",
        method="POST",
        status_code=200,
        json={"status": "found", "message": "Test-Virus"},
    )
    result = await scan_bytes(b"content", _settings())
    assert result.is_clean is False
    assert result.threat_name == "Test-Virus"
