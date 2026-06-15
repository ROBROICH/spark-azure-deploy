from io import BytesIO
from unittest.mock import AsyncMock
from uuid import UUID

import pytest
from fastapi import HTTPException, UploadFile

from src.api.routes import workflows_api

PDF_BYTES = b"%PDF-input"
REDACTED_BYTES = b"%PDF-redacted"
REQUEST_ID = UUID("aaaaaaaa-0000-0000-0000-000000000001")

HTTP_OK = 200
HTTP_BAD_REQUEST = 400
HTTP_UNSUPPORTED_MEDIA_TYPE = 415


def _upload(filename: str, data: bytes = PDF_BYTES) -> UploadFile:
    return UploadFile(filename=filename, file=BytesIO(data))


@pytest.mark.asyncio
async def test_anonymize_pdf_upload_starts_request_id_workflow_and_returns_pdf(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    execute_workflow = AsyncMock(return_value=REDACTED_BYTES)
    monkeypatch.setattr(workflows_api, "execute_anonymisierung_workflow", execute_workflow)
    monkeypatch.setattr(workflows_api.puremagic, "from_string", lambda string, mime: "application/pdf")

    response = await workflows_api.anonymize_pdf(
        request_id=REQUEST_ID,
        file=_upload("report.pdf"),
    )

    assert response.status_code == HTTP_OK
    assert response.media_type == "application/pdf"
    assert response.body == REDACTED_BYTES
    execute_workflow.assert_awaited_once_with(PDF_BYTES, REQUEST_ID)


@pytest.mark.asyncio
async def test_anonymize_pdf_uses_empty_pdf_when_upload_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    execute_workflow = AsyncMock(return_value=REDACTED_BYTES)
    monkeypatch.setattr(workflows_api, "execute_anonymisierung_workflow", execute_workflow)

    response = await workflows_api.anonymize_pdf(
        request_id=REQUEST_ID,
        file=None,
    )

    assert response.body == REDACTED_BYTES
    execute_workflow.assert_awaited_once_with(workflows_api.EMPTY_PDF_BYTES, REQUEST_ID)


@pytest.mark.asyncio
async def test_anonymize_pdf_rejects_non_pdf_content(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(workflows_api.puremagic, "from_string", lambda string, mime: "text/plain")

    with pytest.raises(HTTPException) as exc_info:
        await workflows_api.anonymize_pdf(
            request_id=REQUEST_ID,
            file=_upload("report.pdf"),
        )

    assert exc_info.value.status_code == HTTP_UNSUPPORTED_MEDIA_TYPE


@pytest.mark.asyncio
async def test_anonymize_pdf_rejects_empty_pdf_upload() -> None:
    with pytest.raises(HTTPException) as exc_info:
        await workflows_api.anonymize_pdf(
            request_id=REQUEST_ID,
            file=_upload("report.pdf", b""),
        )

    assert exc_info.value.status_code == HTTP_BAD_REQUEST


@pytest.mark.asyncio
async def test_anonymize_pdf_does_not_pass_filename_to_workflow(monkeypatch: pytest.MonkeyPatch) -> None:
    execute_workflow = AsyncMock(return_value=REDACTED_BYTES)
    monkeypatch.setattr(workflows_api, "execute_anonymisierung_workflow", execute_workflow)
    monkeypatch.setattr(workflows_api.puremagic, "from_string", lambda string, mime: "application/pdf")

    response = await workflows_api.anonymize_pdf(
        request_id=REQUEST_ID,
        file=_upload("scan_without_extension", PDF_BYTES),
    )

    assert "content-disposition" not in response.headers
    execute_workflow.assert_awaited_once_with(PDF_BYTES, REQUEST_ID)
