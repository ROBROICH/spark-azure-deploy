import io
import os
import zipfile
from contextlib import suppress
from dataclasses import dataclass
from uuid import UUID

import httpx
from fastapi import status
from httpx import AsyncClient


@dataclass(frozen=True)
class ZipFixture:
    content: bytes
    success: list[str]
    failure: list[str]


# ---------------------------------------------------------------------------
# Content byte constants — used by integration tests and zip factories
# ---------------------------------------------------------------------------

# Valid file content (passes puremagic magic-byte detection)
VALID_PDF_BYTES = b"%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n"
VALID_JSON_BYTES = b'{"test": "integration"}'


# Invalid file content (disallowed types with correct magic bytes)
EXE_BYTES = b"MZ" + b"\x90" * 100
MP4_BYTES = b"\x00\x00\x00\x20ftypisom\x00\x00\x02\x00" + b"\x00" * 20
AVI_BYTES = b"RIFF" + b"\x00" * 4 + b"AVI " + b"\x00" * 20
SHELL_SCRIPT_BYTES = b"#!/bin/bash\necho pwned\n"
PYTHON_SCRIPT_BYTES = b"#!/usr/bin/env python3\nprint('pwned')\n"


# ---------------------------------------------------------------------------
# Zip factory functions
# ---------------------------------------------------------------------------


def create_valid_zip() -> ZipFixture:
    """ZIP with valid PDF files in nested dirs."""
    return ZipFixture(
        content=create_zip_bytes(
            {
                "report.pdf": VALID_PDF_BYTES,
                "docs/summary.pdf": VALID_PDF_BYTES,
                "images/logo.pdf": VALID_PDF_BYTES,
            }
        ),
        success=["report.pdf", "docs/summary.pdf", "images/logo.pdf"],
        failure=[],
    )


def create_valid_zip_2() -> ZipFixture:
    """ZIP with valid PDF files in nested dirs."""
    return ZipFixture(
        content=create_zip_bytes(
            {
                "report.pdf": VALID_PDF_BYTES,
                "docs/summary-v2.pdf": VALID_PDF_BYTES,
                "docs/appendix.pdf": VALID_PDF_BYTES,
            }
        ),
        success=["report.pdf", "docs/summary-v2.pdf", "docs/appendix.pdf"],
        failure=[],
    )


def create_corrupt_zip() -> ZipFixture:
    """Random bytes — not a valid ZIP archive."""
    return ZipFixture(
        content=os.urandom(256),
        success=[],
        failure=[],
    )


def create_invalid_contents_zip() -> ZipFixture:
    """Valid ZIP containing .exe, .mp4, .avi — rejected at extension check."""
    return ZipFixture(
        content=create_zip_bytes(
            {
                "malware.exe": EXE_BYTES,
                "movie.mp4": MP4_BYTES,
                "clip.avi": AVI_BYTES,
            }
        ),
        success=[],
        failure=["malware.exe", "movie.mp4", "clip.avi"],
    )


def create_mixed_zip() -> ZipFixture:
    """ZIP with 1 valid PDF and 4 invalid entries — partial failure expected."""
    return ZipFixture(
        content=create_zip_bytes(
            {
                "report.pdf": VALID_PDF_BYTES,
                "data.json": VALID_JSON_BYTES,
                "malware.exe": EXE_BYTES,
                "script.json": SHELL_SCRIPT_BYTES,
                "trojan.pdf": EXE_BYTES,
            }
        ),
        success=["report.pdf"],
        failure=["data.json", "malware.exe", "script.json", "trojan.pdf"],
    )


def create_truncated_zip() -> ZipFixture:
    """ZIP truncated mid-entry — first entry streams OK, second triggers error."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        zf.writestr("first.pdf", VALID_PDF_BYTES)
        zf.writestr("second.pdf", b"\x00" * 100_000)
    full = buf.getvalue()
    # Truncate well into second entry's stored data
    return ZipFixture(
        content=full[: len(full) // 2],
        success=["first.pdf"],
        failure=[],
    )


def create_spoofed_extensions_zip() -> ZipFixture:
    """Valid ZIP with allowed extensions but forbidden content."""
    return ZipFixture(
        content=create_zip_bytes(
            {
                "report.pdf": EXE_BYTES,
                "config.json": SHELL_SCRIPT_BYTES,
                "readme.md": PYTHON_SCRIPT_BYTES,
            }
        ),
        success=[],
        failure=["report.pdf", "config.json", "readme.md"],
    )


async def upload_file_via_presigned_url(
    api_client: AsyncClient,
    *,
    filename: str,
    file_content: bytes,
    file_type: str,
    project_id: UUID,
    create_new_version: bool = False,
) -> dict:
    """Simulate how a browser uploads a file via presigned URL.

    1. POST /v2/files/generate-upload-url → presigned PUT URL
    2. PUT content to the presigned URL (separate httpx.AsyncClient)
    3. POST /v2/files/confirm-upload → metadata record created

    Returns the confirm-upload response dict.
    """
    # 1. Generate presigned upload URL
    generate_payload = {
        "type": file_type,
        "projectId": str(project_id),
        "filename": filename,
        "createNewVersion": create_new_version,
    }
    resp = await api_client.post("/v2/files/generate-upload-url", json=generate_payload)
    assert resp.status_code == status.HTTP_200_OK, f"generate-upload-url failed: {resp.status_code} {resp.text}"
    data = resp.json()
    upload_url = data["uploadUrl"]
    mime_type = data["mimeType"]

    # 2. PUT file content to presigned URL
    async with httpx.AsyncClient() as upload_client:
        put_resp = await upload_client.put(
            upload_url,
            content=file_content,
            headers={"Content-Type": mime_type},
        )
    assert put_resp.status_code in (200, 201, 204), (
        f"PUT to presigned URL failed: {put_resp.status_code} {put_resp.text}"
    )

    # 3. Confirm upload
    confirm_payload = {
        "type": file_type,
        "projectId": str(project_id),
        "filename": filename,
        "createNewVersion": create_new_version,
    }
    resp = await api_client.post("/v2/files/confirm-upload", json=confirm_payload)
    assert resp.status_code == status.HTTP_200_OK, f"confirm-upload failed: {resp.status_code} {resp.text}"
    return resp.json()


async def delete_zip_file(zip_file_id: str) -> None:
    """Hard-delete a ZipFile row and its storage object.

    The DELETE /v2/files endpoint only operates on the File table,
    so ZipFile rows need direct cleanup.
    """
    from sqlalchemy import delete as sa_delete
    from sqlalchemy.future import select

    from src.models.db.database import AsyncSessionLocal
    from src.models.db.db_models import ZipFile
    from src.services.storage_provider.storage_provider_s3_service import (
        AsyncS3StorageClient,
    )
    from src.utils.app_state import app_state

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(ZipFile.bucket_path).where(ZipFile.id == zip_file_id))
        bucket_path = result.scalar_one_or_none()

        await session.execute(sa_delete(ZipFile).where(ZipFile.id == zip_file_id))
        await session.commit()

    if bucket_path:
        ds = app_state.storage_provider_service
        if ds is None:
            ds = AsyncS3StorageClient()
            await ds.initialize()

    with suppress(FileNotFoundError):
        await ds.delete_document(document_name=bucket_path)


def create_zip_bytes(files: dict[str, bytes]) -> bytes:
    """Create an in-memory ZIP from {path: content} entries."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for path, content in files.items():
            zf.writestr(path, content)
    return buf.getvalue()


def _set_data_descriptor_flags(zip_bytes: bytes) -> bytes:
    """Patch all local file headers in raw ZIP bytes to set the Data Descriptor flag (bit 3).

    This reproduces the STORED + Data Descriptor combination that some ZIP
    tools produce (e.g. Info-ZIP on macOS) which caused stream-unzip to fail.
    """
    local_header_sig = b"PK\x03\x04"
    flag_offset = 6  # general purpose bit flag is at offset 6 in local header
    result = bytearray(zip_bytes)
    pos = 0
    while True:
        idx = result.find(local_header_sig, pos)
        if idx == -1:
            break
        flag_pos = idx + 4 + flag_offset  # 4 bytes for signature
        if flag_pos + 2 <= len(result):
            flags = int.from_bytes(result[flag_pos : flag_pos + 2], "little")
            flags |= 0x08  # set bit 3 (data descriptor)
            result[flag_pos : flag_pos + 2] = flags.to_bytes(2, "little")
        pos = idx + 4
    return bytes(result)


def create_stored_data_descriptor_zip() -> ZipFixture:
    """ZIP using STORED compression with Data Descriptor flags set.

    This combination caused stream-unzip to fail because it could not
    determine entry boundaries during sequential streaming. The stdlib
    zipfile module handles it correctly via Central Directory seek.
    """
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_STORED) as zf:
        zf.writestr("report.pdf", VALID_PDF_BYTES)
        zf.writestr("docs/summary.pdf", VALID_PDF_BYTES)
        zf.writestr("images/logo.pdf", VALID_PDF_BYTES)

    patched = _set_data_descriptor_flags(buf.getvalue())
    return ZipFixture(
        content=patched,
        success=["report.pdf", "docs/summary.pdf", "images/logo.pdf"],
        failure=[],
    )
