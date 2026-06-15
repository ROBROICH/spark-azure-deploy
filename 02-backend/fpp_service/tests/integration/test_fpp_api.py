"""Tests for the FPP API endpoints."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, patch
from uuid import uuid4

import pytest
from fastapi import status

from src.exceptions.exceptions import NotFoundError, OperationFailedError
from src.models.db_models import FPPFile, FPPFileType, FPPRequestStatus
from src.models.schemas.fpp_schemas import (
    FPPProjectResponse,
    FPPRequestDetail,
)


@pytest.fixture
def mock_create_project_from_fpp(monkeypatch):
    """Patch fpp_service.create_project_from_fpp."""
    mock = AsyncMock()
    monkeypatch.setattr("src.services.fpp_service.create_project_from_fpp", mock)
    return mock


@pytest.fixture
def mock_get_request(monkeypatch):
    """Patch fpp_service.get_request."""
    mock = AsyncMock()
    monkeypatch.setattr("src.services.fpp_service.get_request", mock)
    return mock


@pytest.fixture
def mock_get_request_files(monkeypatch):
    """Patch fpp_service.get_request_files."""
    mock = AsyncMock()
    monkeypatch.setattr("src.services.fpp_service.get_request_files", mock)
    return mock


def test_create_project_success(client, mock_create_project_from_fpp):
    """Test the create_project endpoint with valid input."""
    request_id = uuid4()
    created_at = datetime.now(UTC)

    mock_create_project_from_fpp.return_value = FPPProjectResponse(
        request_id=request_id,
        internal_project_id="FPP-2026-001",
        name="Test Project",
        status=FPPRequestStatus.RECEIVED,
        created_at=created_at,
        updated_at=created_at,
    )

    response = client.post(
        "/external/fpp/projects",
        json={
            "request_id": str(request_id),
            "internal_project_id": "FPP-2026-001",
            "name": "Test Project",
            "xml": "<ffw:form></ffw:form>",
            "files": [
                {
                    "file_type": "PLANUNTERLAGEN",
                    "file_url": "https://example.com/plan.pdf",
                    "file_name": "plan.pdf",
                }
            ],
        },
    )

    assert response.status_code == status.HTTP_201_CREATED

    body = response.json()
    assert isinstance(body, dict)
    assert body["request_id"] == str(request_id)
    assert body["internal_project_id"] == "FPP-2026-001"
    assert body["name"] == "Test Project"
    assert body["status"] == "RECEIVED"


def test_create_project_idempotent(client, mock_create_project_from_fpp):
    """Test idempotent behavior when creating the same project twice."""
    request_id = uuid4()
    created_at = datetime.now(UTC)

    mock_create_project_from_fpp.return_value = FPPProjectResponse(
        request_id=request_id,
        internal_project_id="FPP-2026-001",
        name="Test Project",
        status=FPPRequestStatus.RECEIVED,
        created_at=created_at,
        updated_at=created_at,
    )

    # First request
    response1 = client.post(
        "/external/fpp/projects",
        json={
            "request_id": str(request_id),
            "internal_project_id": "FPP-2026-001",
            "name": "Test Project",
            "xml": "<ffw:form></ffw:form>",
            "files": [],
        },
    )

    assert response1.status_code == status.HTTP_201_CREATED

    # Second request with same request_id should succeed (idempotent)
    response2 = client.post(
        "/external/fpp/projects",
        json={
            "request_id": str(request_id),
            "internal_project_id": "FPP-2026-001",
            "name": "Test Project",
            "xml": "<ffw:form></ffw:form>",
            "files": [],
        },
    )

    assert response2.status_code == status.HTTP_201_CREATED
    assert response1.json()["request_id"] == response2.json()["request_id"]


def test_create_project_with_multiple_files(client, mock_create_project_from_fpp):
    """Test creating project with multiple files."""
    request_id = uuid4()
    created_at = datetime.now(UTC)

    mock_create_project_from_fpp.return_value = FPPProjectResponse(
        request_id=request_id,
        internal_project_id="FPP-2026-001",
        name="Test Project",
        status=FPPRequestStatus.RECEIVED,
        created_at=created_at,
        updated_at=created_at,
    )

    response = client.post(
        "/external/fpp/projects",
        json={
            "request_id": str(request_id),
            "internal_project_id": "FPP-2026-001",
            "name": "Test Project",
            "xml": "<ffw:form></ffw:form>",
            "files": [
                {
                    "file_type": "PLANUNTERLAGEN",
                    "file_url": "https://example.com/plan1.pdf",
                    "file_name": "plan1.pdf",
                },
                {
                    "file_type": "PLANUNTERLAGEN",
                    "file_url": "https://example.com/plan2.pdf",
                    "file_name": "plan2.pdf",
                },
                {
                    "file_type": "ERGAENZENDE_UNTERLAGEN",
                    "file_url": "https://example.com/doc.pdf",
                    "file_name": "doc.pdf",
                },
            ],
        },
    )

    assert response.status_code == status.HTTP_201_CREATED


def test_create_project_validation_error(client):
    """Test validation error with invalid request data."""
    response = client.post(
        "/external/fpp/projects",
        json={
            "request_id": "not-a-uuid",  # Invalid UUID
            "internal_project_id": "FPP-2026-001",
            "name": "Test Project",
            "xml": "<ffw:form></ffw:form>",
            "files": [],
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_create_project_missing_required_field(client):
    """Test validation error when required field is missing."""
    response = client.post(
        "/external/fpp/projects",
        json={
            "request_id": str(uuid4()),
            "internal_project_id": "FPP-2026-001",
            # Missing 'name' field
            "xml": "<ffw:form></ffw:form>",
            "files": [],
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_create_project_invalid_file_type(client):
    """Test validation error with invalid file type."""
    response = client.post(
        "/external/fpp/projects",
        json={
            "request_id": str(uuid4()),
            "internal_project_id": "FPP-2026-001",
            "name": "Test Project",
            "xml": "<ffw:form></ffw:form>",
            "files": [
                {
                    "file_type": "INVALID_TYPE",  # Invalid file type
                    "file_url": "https://example.com/file.pdf",
                }
            ],
        },
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_create_project_operation_failed(client):
    """Test handling of OperationFailedError."""
    with patch(
        "src.services.fpp_service.create_project_from_fpp",
        side_effect=OperationFailedError("Invalid XML data"),
    ):
        response = client.post(
            "/external/fpp/projects",
            json={
                "request_id": str(uuid4()),
                "internal_project_id": "FPP-2026-001",
                "name": "Test Project",
                "xml": "<invalid>not closed",
                "files": [],
            },
        )

    assert response.status_code == status.HTTP_500_INTERNAL_SERVER_ERROR
    assert "Invalid XML data" in response.json()["detail"]


def test_get_request_details_success(client, mock_get_request):
    """Test fetching request details successfully."""
    request_id = uuid4()
    created_at = datetime.now(UTC)

    mock_get_request.return_value = FPPRequestDetail(
        request_id=request_id,
        internal_project_id="FPP-2026-001",
        name="Test Project",
        entry_date=created_at.date(),
        xml="<ffw:form></ffw:form>",
        state="Berlin",
        company="Test Company",
        address_combined="Building A",
        street="Hauptstraße",
        house_number="45",
        plz="10115",
        location="Berlin",
        country="DEU",
        email="test@example.com",
        phone="+49 30 12345678",
        fax="+49 30 12345679",
        project_id=None,
        status=FPPRequestStatus.RECEIVED,
        error_message=None,
        files=[],
        created_at=created_at,
        updated_at=created_at,
    )

    response = client.get(f"/internal/fpp/requests/{request_id}")

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["request_id"] == str(request_id)
    assert body["internal_project_id"] == "FPP-2026-001"
    assert body["name"] == "Test Project"
    assert body["status"] == "RECEIVED"


def test_get_request_details_not_found(client):
    """Test fetching non-existent request returns 404."""
    request_id = uuid4()

    with patch(
        "src.services.fpp_service.get_request",
        side_effect=NotFoundError(f"Request {request_id} not found"),
    ):
        response = client.get(f"/internal/fpp/requests/{request_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert f"Request {request_id} not found" in response.json()["detail"]


def test_get_request_files_success(client, mock_get_request_files):
    """Test fetching request files successfully."""
    request_id = uuid4()
    created_at = datetime.now(UTC)

    file1 = FPPFile(
        id=uuid4(),
        request_id=request_id,
        file_type=FPPFileType.PLANUNTERLAGEN.value,
        file_url="https://example.com/plan.pdf",
        file_name="plan.pdf",
        created_at=created_at,
        updated_at=created_at,
    )
    file2 = FPPFile(
        id=uuid4(),
        request_id=request_id,
        file_type=FPPFileType.ERGAENZENDE_UNTERLAGEN.value,
        file_url="https://example.com/doc.pdf",
        file_name="doc.pdf",
        created_at=created_at,
        updated_at=created_at,
    )

    mock_get_request_files.return_value = [file1, file2]

    response = client.get(f"/internal/fpp/files/{request_id}")

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 2
    assert body[0]["file_type"] == "PLANUNTERLAGEN"
    assert body[0]["file_url"] == "https://example.com/plan.pdf"
    assert body[1]["file_type"] == "ERGAENZENDE_UNTERLAGEN"
    assert body[1]["file_url"] == "https://example.com/doc.pdf"


def test_get_request_files_empty_list(client, mock_get_request_files):
    """Test fetching files for request with no files."""
    request_id = uuid4()

    mock_get_request_files.return_value = []

    response = client.get(f"/internal/fpp/files/{request_id}")

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 0


def test_get_request_files_not_found(client):
    """Test fetching files for non-existent request returns 404."""
    request_id = uuid4()

    with patch(
        "src.services.fpp_service.get_request_files",
        side_effect=NotFoundError(f"Request {request_id} not found"),
    ):
        response = client.get(f"/internal/fpp/files/{request_id}")

    assert response.status_code == status.HTTP_404_NOT_FOUND
    assert f"Request {request_id} not found" in response.json()["detail"]


def test_get_request_details_invalid_uuid(client):
    """Test fetching request with invalid UUID format."""
    response = client.get("/internal/fpp/requests/not-a-uuid")

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_get_request_files_invalid_uuid(client):
    """Test fetching files with invalid UUID format."""
    response = client.get("/internal/fpp/files/not-a-uuid")

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


def test_create_project_empty_files_list(client, mock_create_project_from_fpp):
    """Test creating project with empty files list."""
    request_id = uuid4()
    created_at = datetime.now(UTC)

    mock_create_project_from_fpp.return_value = FPPProjectResponse(
        request_id=request_id,
        internal_project_id="FPP-2026-001",
        name="Test Project",
        status=FPPRequestStatus.RECEIVED,
        created_at=created_at,
        updated_at=created_at,
    )

    response = client.post(
        "/external/fpp/projects",
        json={
            "request_id": str(request_id),
            "internal_project_id": "FPP-2026-001",
            "name": "Test Project",
            "xml": "<ffw:form></ffw:form>",
            "files": [],  # Empty files list
        },
    )

    assert response.status_code == status.HTTP_201_CREATED


def test_create_project_files_without_name(client, mock_create_project_from_fpp):
    """Test creating project with files that don't have file_name (optional)."""
    request_id = uuid4()
    created_at = datetime.now(UTC)

    mock_create_project_from_fpp.return_value = FPPProjectResponse(
        request_id=request_id,
        internal_project_id="FPP-2026-001",
        name="Test Project",
        status=FPPRequestStatus.RECEIVED,
        created_at=created_at,
        updated_at=created_at,
    )

    response = client.post(
        "/external/fpp/projects",
        json={
            "request_id": str(request_id),
            "internal_project_id": "FPP-2026-001",
            "name": "Test Project",
            "xml": "<ffw:form></ffw:form>",
            "files": [
                {
                    "file_type": "PLANUNTERLAGEN",
                    "file_url": "https://example.com/plan.pdf",
                    # file_name is optional
                }
            ],
        },
    )

    assert response.status_code == status.HTTP_201_CREATED
