import os
import uuid
from uuid import UUID, uuid4

import httpx
import pytest

from src.config.settings import settings
from src.models.schemas.files import FileObject

PLS_BASE_URL = settings.api.pls_base_url
FCS_BASE_URL = settings.api.fvp_base_url
DMS_BASE_URL = settings.api.dms_base_url


def _generate_pdf(size_kb: int = 1024) -> bytes:
    """Generate a valid PDF with random stream data, roughly size_kb in size."""
    payload = os.urandom(size_kb * 1024)
    stream = f"5 0 obj\n<</Length {len(payload)}>>\nstream\n".encode() + payload + b"\nendstream\nendobj\n"
    body = (
        b"%PDF-1.4\n"
        b"1 0 obj\n<</Type/Catalog/Pages 2 0 R>>\nendobj\n"
        b"2 0 obj\n<</Type/Pages/Kids[3 0 R]/Count 1>>\nendobj\n"
        b"3 0 obj\n<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Contents 5 0 R>>\nendobj\n"
        b"4 0 obj\n<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>\nendobj\n" + stream
    )
    xref_offset = len(body)
    xref = (
        b"xref\n0 6\n"
        b"0000000000 65535 f \n"
        b"0000000009 00000 n \n"
        b"0000000058 00000 n \n"
        b"0000000115 00000 n \n"
        b"0000000210 00000 n \n" + f"{body.index(b'5 0 obj'):010d} 00000 n \n".encode()
    )
    trailer = b"trailer\n<</Size 6/Root 1 0 R>>\nstartxref\n" + f"{xref_offset}\n".encode() + b"%%EOF\n"
    return body + xref + trailer


@pytest.fixture(scope="session", autouse=True)
async def _check_services() -> None:
    """Fail fast if DMS is not reachable."""
    async with httpx.AsyncClient(timeout=5) as client:
        try:
            resp = await client.get(f"{DMS_BASE_URL}/health")
            resp.raise_for_status()
        except (httpx.ConnectError, httpx.HTTPStatusError) as exc:
            pytest.skip(f"DMS not reachable at {DMS_BASE_URL}: {exc}")


@pytest.fixture(scope="session")
def pdf_content() -> bytes:
    """Generate a ~20MB PDF."""
    return _generate_pdf(20 * 1024)


async def seed_file(
    content: bytes,
    filename: str | None = None,
    mime_type: str = "text/plain",
    project_id: str | None = None,
    document_type: str = "document",
    workflow_id: str | None = None,
    run_id: str | None = None,
) -> FileObject:
    """Upload a file into DMS via the generate-upload-url -> PUT -> confirm-upload flow.

    Returns the confirmed FileObject so tests can use its id for downloads.
    """
    if filename is None:
        filename = f"test-{uuid.uuid4().hex[:8]}.txt"
    if project_id is None:
        project_id = str(uuid.uuid4())

    upload_args = {
        "type": document_type,
        "filename": filename,
        "projectId": project_id,
    }
    if workflow_id:
        upload_args["workflowId"] = workflow_id
    if run_id:
        upload_args["runId"] = run_id

    async with httpx.AsyncClient(timeout=30) as client:
        # Step 1: get presigned upload URL
        resp = await client.post(
            f"{DMS_BASE_URL}/v2/files/generate-upload-url",
            json=upload_args,
        )
        resp.raise_for_status()
        data = resp.json()
        upload_url = data["uploadUrl"]
        resolved_mime: str = data.get("mimeType", mime_type)

        # Step 2: PUT file bytes to presigned URL
        resp = await client.put(
            upload_url,
            content=content,
            headers={"Content-Type": resolved_mime},
        )
        resp.raise_for_status()

        # Step 3: confirm upload
        resp = await client.post(
            f"{DMS_BASE_URL}/v2/files/confirm-upload",
            json=upload_args,
        )
        resp.raise_for_status()
        return FileObject(**resp.json())


@pytest.fixture
async def seed_project_type() -> UUID:
    payload = [
        {
            "name": f"Wasserstoffkernnetz ({uuid4()})",
        }
    ]
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{PLS_BASE_URL}/project-types",
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        project_type_id = data[0]["id"]

    return UUID(project_type_id)


@pytest.fixture
async def seed_project(seed_project_type: UUID) -> UUID:
    payload = {
        "addressSupplement": "Backyard",
        "company": "Example AG",
        "country": "Germany",
        "createdById": "00000000-0000-0000-0000-000000000000",
        "email": "john@example.com",
        "entryDate": "2025-01-01",
        "fax": "987654321",
        "firstName": "John",
        "houseNumber": "12",
        "internalProjectNumber": "P001",
        "lastName": "Doe",
        "location": "Berlin",
        "name": "My Project",
        "phone": "1234567890",
        "plz": "12345",
        "projectTypeId": str(seed_project_type),
        "salutation": "Herr",
        "street": "Main Street",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{PLS_BASE_URL}/projects",
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        project_id = data["id"]

    return UUID(project_id)


@pytest.fixture
async def seed_topic(seed_project: UUID) -> UUID:
    """Seeds the topic used in the tests."""

    # Create a topic
    payload = {
        "name": f"Nature Conservation ({uuid4()})",
        "description": "Nature Conservation topic",
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{PLS_BASE_URL}/topics",
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        topic_id = data["id"]

    # Assign Topic to project
    payload = [topic_id]
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{PLS_BASE_URL}/projects/{seed_project}/topics",
            json=payload,
        )
        resp.raise_for_status()

    return UUID(topic_id)


@pytest.fixture
async def seed_template_categories(seed_project_type: UUID) -> UUID:
    payload = [
        {
            "category": "string",
            "document_types": [{"name": "test", "description": "string", "expected_count": 1}],
        }
    ]
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{FCS_BASE_URL}/{seed_project_type}/template-categories",
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        category_id = data[0]["id"]

    return UUID(category_id)


@pytest.fixture
async def seed_fvp_result(seed_project_type: UUID) -> UUID:
    payload = {
        "status": "results_processed",
        "matched_document_types": 25,
        "assigned_documents": 23,
        "unassigned_documents": 2,
        "previous_records_deleted": 0,
    }
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{FCS_BASE_URL}/{seed_project_type}/template-categories",
            json=payload,
        )
        resp.raise_for_status()
        data = resp.json()
        category_id = data[0]["id"]

    return UUID(category_id)
