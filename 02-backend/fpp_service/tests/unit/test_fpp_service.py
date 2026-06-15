"""Tests for the FPP service."""

from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from src.exceptions.exceptions import NotFoundError, OperationFailedError
from src.models.db_models import FPPFile, FPPRequest, FPPRequestStatus
from src.models.schemas.fpp_schemas import (
    FPPFileInput,
    FPPFileType,
    FPPProjectRequest,
    FPPProjectResponse,
    FPPRequestDetail,
)
from src.services.fpp_service import (
    _check_existing_request,
    _extract_and_parse_request_data,
    _persist_fpp_request_and_files,
    create_project_from_fpp,
    get_request,
    get_request_files,
)


@pytest.fixture
def sample_xml():
    """Sample FPP XML for testing."""
    return """<?xml version="1.0" encoding="UTF-8"?>
<ffw:form xmlns:ffw="http://www.lucom.com/ffw/xml-data-1.0.xsd">
    <ffw:element id="aktenzeichen_eingabe">FPP-2026-001</ffw:element>
    <ffw:element id="v-bezeichnung">Test Project</ffw:element>
    <ffw:element id="creationDate">2026-05-04T11:56:42.000+02:00</ffw:element>
</ffw:form>"""


@pytest.fixture
def fpp_project_request(sample_xml):
    """Sample FPP project request."""
    return FPPProjectRequest(
        request_id=uuid4(),
        internal_project_id="FPP-2026-001",
        name="Test Project",
        xml=sample_xml,
        files=[
            FPPFileInput(
                file_type=FPPFileType.PLANUNTERLAGEN,
                file_url="https://example.com/plan.pdf",
                file_name="plan.pdf",
            ),
            FPPFileInput(
                file_type=FPPFileType.ERGAENZENDE_UNTERLAGEN,
                file_url="https://example.com/doc.pdf",
                file_name="doc.pdf",
            ),
        ],
    )


@pytest.mark.asyncio
async def test_create_project_from_fpp_success(fpp_project_request, mock_db_session, mocker):
    """Test successful project creation from FPP."""
    # Mock no existing request
    mock_db_session.scalar.return_value = None
    mock_db_session.flush = AsyncMock()
    mock_db_session.commit = AsyncMock()

    # Mock refresh to set timestamps and handle attribute_names parameter
    def mock_refresh(obj, attribute_names=None):
        obj.created_at = datetime.now(UTC)
        obj.updated_at = datetime.now(UTC)
        # Mock files relationship if requested
        if attribute_names and "files" in attribute_names:
            # Create mock file objects
            mock_file = MagicMock()
            mock_file.id = uuid4()
            mock_file.file_type = "PLANUNTERLAGEN"
            mock_file.file_url = "https://example.com/plan.pdf"
            mock_file.file_name = "plan.pdf"
            obj.files = [mock_file]

    mock_db_session.refresh = AsyncMock(side_effect=mock_refresh)
    mock_db_session.add = MagicMock()

    # Mock ProjectLogicClient.create_project to return a successful response
    mock_project_response = {
        "id": str(uuid4()),
        "name": fpp_project_request.name,
        "internalProjectNumber": fpp_project_request.internal_project_id,
    }
    mocker.patch("src.services.fpp_service.ProjectLogicClient.create_project", return_value=mock_project_response)

    # Mock AgentOrchestrationClient.start_fpp_download_workflow
    mocker.patch(
        "src.services.fpp_service.AgentOrchestrationClient.start_fpp_download_workflow", return_value=AsyncMock()
    )

    result = await create_project_from_fpp(fpp_project_request, db=mock_db_session)

    assert isinstance(result, FPPProjectResponse)
    assert result.request_id == fpp_project_request.request_id
    assert result.internal_project_id == fpp_project_request.internal_project_id
    assert result.name == fpp_project_request.name
    assert result.status == FPPRequestStatus.IMPORTED

    # Verify database operations
    mock_db_session.add.assert_called()
    mock_db_session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_create_project_from_fpp_idempotent(fpp_project_request, mock_db_session):
    """Test idempotent behavior when request already exists."""
    # Mock existing request
    existing_request = FPPRequest(
        request_id=fpp_project_request.request_id,
        internal_project_id=fpp_project_request.internal_project_id,
        name=fpp_project_request.name,
        xml=fpp_project_request.xml,
        status=FPPRequestStatus.RECEIVED.value,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    mock_db_session.scalar.return_value = existing_request

    result = await create_project_from_fpp(fpp_project_request, db=mock_db_session)

    assert isinstance(result, FPPProjectResponse)
    assert result.request_id == fpp_project_request.request_id
    assert result.status == FPPRequestStatus.RECEIVED

    # Should not create new request
    mock_db_session.add.assert_not_called()


@pytest.mark.asyncio
async def test_create_project_from_fpp_invalid_xml(mock_db_session):
    """Test that invalid XML raises OperationFailedError."""
    invalid_request = FPPProjectRequest(
        request_id=uuid4(),
        internal_project_id="FPP-INVALID",
        name="Invalid Project",
        xml="<invalid>not closed",
        files=[],
    )

    mock_db_session.scalar.return_value = None
    mock_db_session.flush = AsyncMock()
    mock_db_session.commit = AsyncMock()
    mock_db_session.rollback = AsyncMock()

    # Mock refresh to set timestamps and handle attribute_names parameter
    def mock_refresh(obj, attribute_names=None):
        obj.created_at = datetime.now(UTC)
        obj.updated_at = datetime.now(UTC)

    mock_db_session.refresh = AsyncMock(side_effect=mock_refresh)
    mock_db_session.add = MagicMock()

    # Should raise OperationFailedError due to invalid XML parsing
    with pytest.raises(OperationFailedError) as exc_info:
        await create_project_from_fpp(invalid_request, db=mock_db_session)

    assert "Invalid XML" in str(exc_info.value)

    mock_db_session.commit.assert_awaited()


@pytest.mark.asyncio
async def test_check_existing_request_none(mock_db_session):
    """Test _check_existing_request when no request exists."""
    request_id = uuid4()
    internal_project_id = "test"
    mock_db_session.scalar.return_value = None

    result = await _check_existing_request(request_id, internal_project_id=internal_project_id, db=mock_db_session)

    assert result is None


@pytest.mark.asyncio
async def test_check_existing_request_received(mock_db_session):
    """Test _check_existing_request with RECEIVED status."""
    request_id = uuid4()
    internal_project_id = "FPP-001"
    existing_request = FPPRequest(
        request_id=request_id,
        internal_project_id="FPP-001",
        name="Test",
        xml="<xml/>",
        status=FPPRequestStatus.RECEIVED.value,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    mock_db_session.scalar.return_value = existing_request

    result = await _check_existing_request(request_id, internal_project_id=internal_project_id, db=mock_db_session)

    assert result == existing_request


@pytest.mark.asyncio
async def test_check_existing_request_importing(mock_db_session):
    """Test _check_existing_request with IMPORTING status."""
    request_id = uuid4()
    internal_project_id = "FPP-001"
    existing_request = FPPRequest(
        request_id=request_id,
        internal_project_id="FPP-001",
        name="Test",
        xml="<xml/>",
        status=FPPRequestStatus.IMPORTING.value,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    mock_db_session.scalar.return_value = existing_request

    result = await _check_existing_request(request_id, internal_project_id=internal_project_id, db=mock_db_session)

    assert result == existing_request


@pytest.mark.asyncio
async def test_extract_and_parse_request_data_success(fpp_project_request):
    """Test successful XML parsing."""
    result = _extract_and_parse_request_data(fpp_project_request)

    assert "xml_data" in result
    assert result["xml_data"]["internal_project_id"] == "FPP-2026-001"
    assert result["xml_data"]["name"] == "Test Project"


@pytest.mark.asyncio
async def test_extract_and_parse_request_data_invalid_xml():
    """Test XML parsing with invalid XML."""
    invalid_request = FPPProjectRequest(
        request_id=uuid4(),
        internal_project_id="FPP-INVALID",
        name="Invalid",
        xml="<invalid>not closed",
        files=[],
    )

    with pytest.raises(OperationFailedError) as exc_info:
        _extract_and_parse_request_data(invalid_request)

    assert "Invalid XML" in str(exc_info.value)


@pytest.mark.asyncio
async def test_persist_fpp_request_and_files_success(fpp_project_request, mock_db_session):
    """Test successful persistence of request and files."""
    mock_db_session.flush = AsyncMock()
    mock_db_session.commit = AsyncMock()
    mock_db_session.refresh = AsyncMock()
    mock_db_session.add = MagicMock()

    result = await _persist_fpp_request_and_files(fpp_project_request, db=mock_db_session)

    assert isinstance(result, FPPRequest)
    assert result.request_id == fpp_project_request.request_id
    assert result.internal_project_id == fpp_project_request.internal_project_id
    assert result.name == fpp_project_request.name
    assert result.status == FPPRequestStatus.RECEIVED.value

    # Verify database operations
    # Should add request + 2 files
    assert mock_db_session.add.call_count == 3
    mock_db_session.flush.assert_awaited_once()
    mock_db_session.commit.assert_awaited_once()


@pytest.mark.asyncio
async def test_persist_fpp_request_and_files_rollback_on_error(fpp_project_request, mock_db_session):
    """Test rollback on database error."""
    mock_db_session.add = MagicMock()
    mock_db_session.flush = AsyncMock(side_effect=Exception("DB Error"))
    mock_db_session.rollback = AsyncMock()

    with pytest.raises(OperationFailedError) as exc_info:
        await _persist_fpp_request_and_files(fpp_project_request, db=mock_db_session)

    assert "Failed to store request" in str(exc_info.value)
    mock_db_session.rollback.assert_awaited_once()


@pytest.mark.asyncio
async def test_get_request_success(mock_db_session, sample_xml):
    """Test successful retrieval of request details."""
    request_id = uuid4()
    file1 = FPPFile(
        id=uuid4(),
        request_id=request_id,
        file_type=FPPFileType.PLANUNTERLAGEN.value,
        file_url="https://example.com/file1.pdf",
        file_name="file1.pdf",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    file2 = FPPFile(
        id=uuid4(),
        request_id=request_id,
        file_type=FPPFileType.ERGAENZENDE_UNTERLAGEN.value,
        file_url="https://example.com/file2.pdf",
        file_name="file2.pdf",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )

    fpp_request = FPPRequest(
        request_id=request_id,
        internal_project_id="FPP-2026-001",
        name="Test Project",
        xml=sample_xml,  # Use valid XML that can be parsed
        status=FPPRequestStatus.RECEIVED.value,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    fpp_request.files = [file1, file2]

    mock_db_session.execute = AsyncMock(return_value=MockScalarResult(fpp_request))

    result = await get_request(request_id, db=mock_db_session)

    assert isinstance(result, FPPRequestDetail)
    assert result.request_id == request_id
    assert result.internal_project_id == "FPP-2026-001"
    assert len(result.files) == 2


@pytest.mark.asyncio
async def test_get_request_not_found(mock_db_session):
    """Test get_request raises NotFoundError when request doesn't exist."""
    request_id = uuid4()
    mock_db_session.execute = AsyncMock(return_value=MockScalarResult(None))

    with pytest.raises(NotFoundError) as exc_info:
        await get_request(request_id, db=mock_db_session)

    assert f"Request {request_id} not found" in str(exc_info.value)


@pytest.mark.asyncio
async def test_get_request_files_success(mock_db_session):
    """Test successful retrieval of request files."""
    request_id = uuid4()
    files = [
        FPPFile(
            id=uuid4(),
            request_id=request_id,
            file_type=FPPFileType.PLANUNTERLAGEN.value,
            file_url="https://example.com/file1.pdf",
            file_name="file1.pdf",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
        FPPFile(
            id=uuid4(),
            request_id=request_id,
            file_type=FPPFileType.ERGAENZENDE_UNTERLAGEN.value,
            file_url="https://example.com/file2.pdf",
            file_name="file2.pdf",
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        ),
    ]

    mock_db_session.execute = AsyncMock(return_value=MockScalarResult(files))

    result = await get_request_files(request_id, db=mock_db_session)

    assert isinstance(result, list)
    assert len(result) == 2
    assert all(isinstance(f, FPPFile) for f in result)


@pytest.mark.asyncio
async def test_get_request_files_empty_list(mock_db_session):
    """Test get_request_files with no files but request exists."""
    request_id = uuid4()

    # First call returns empty list (no files)
    # Second call returns request (exists)
    mock_db_session.execute = AsyncMock(return_value=MockScalarResult([]))
    mock_db_session.scalar = AsyncMock(
        return_value=FPPRequest(
            request_id=request_id,
            internal_project_id="FPP-001",
            name="Test",
            xml="<xml/>",
            status=FPPRequestStatus.RECEIVED.value,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
    )

    result = await get_request_files(request_id, db=mock_db_session)

    assert isinstance(result, list)
    assert len(result) == 0


@pytest.mark.asyncio
async def test_get_request_files_request_not_found(mock_db_session):
    """Test get_request_files raises NotFoundError when request doesn't exist."""
    request_id = uuid4()

    # No files found
    mock_db_session.execute = AsyncMock(return_value=MockScalarResult([]))
    # Request doesn't exist
    mock_db_session.scalar = AsyncMock(return_value=None)

    with pytest.raises(NotFoundError) as exc_info:
        await get_request_files(request_id, db=mock_db_session)

    assert f"Request {request_id} not found" in str(exc_info.value)


class MockScalarResult:
    """Simple helper to simulate SQLAlchemy scalar() behavior."""

    def __init__(self, value):
        self.value = value

    def scalars(self):
        return self

    def first(self):
        return self.value

    def scalar_one_or_none(self):
        return self.value

    def all(self):
        if isinstance(self.value, list):
            return self.value
        return [self.value] if self.value else []
