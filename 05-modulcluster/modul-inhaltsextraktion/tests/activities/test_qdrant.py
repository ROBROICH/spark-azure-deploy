"""Tests for Qdrant activity functions."""

import json
import uuid
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from pydantic import SecretStr
from temporal.workflows.inhaltsextraktion.types import QdrantSourceFileCleanupInput

from src.activities.qdrant.client import _get_qdrant_client, _init_qdrant_collection
from src.activities.qdrant.indexing import (
    _delete_document_by_source_file_id,
    _delete_document_version,
    _get_highest_document_version,
    _get_inhalts_extraktion_docs,
    _prepare_qdrant_data,
    _mark_qdrant_source_files_deleted,
    _restore_qdrant_source_files_deleted,
    _upload_chunks_to_qdrant,
    _upload_parent_chunks_to_qdrant,
    _upload_questions_to_qdrant,
    _upload_summaries_to_qdrant,
    _upload_to_qdrant,
)
from src.activities.qdrant.preparation import _chunk_metadata_from_dict
from src.activities.qdrant.schemas import (
    EmbeddedChunk,
    EmbeddedQuestion,
    EmbeddedSummary,
    QdrantDocumentInput,
    QdrantExtractionFile,
    QdrantUploadInput,
)
from src.env import ENV
from src.workflows.deletion.types import DeletionFileInfo, QdrantDocumentDeleteInput
from src.workflows.qdrant.schemas import (
    ChunkMetadata,
    ParentChunkMetadata,
    QdrantDocumentContext,
    QuestionMetadata,
    SummaryMetadata,
)

# ---------------------------------------------------------------------------
# Factories
# ---------------------------------------------------------------------------

_DOC_CONTEXT = QdrantDocumentContext(
    project_id="proj-1",
    document_id="doc-1",
    source_file_id="source-1",
    title="Test Doc",
    version=1,
    is_deleted=False,
)


def _make_chunk(chunk_id: str = "c1", text: str = "hello world") -> ChunkMetadata:
    """Create a ChunkMetadata instance with default test values."""
    return ChunkMetadata(
        chunk_id=chunk_id,
        page_content=text,
        page_numbers=[1],
        chunk_type="text",
    )


def _make_processed_doc(
    n_chunks: int = 2,
    n_sub_chunks: int = 2,
    with_summary: bool = True,
    with_questions: bool = True,
    source_file_id: str = "source-file-1",
) -> dict[str, Any]:
    """Build a minimal ProcessedDocument dict for testing."""
    doc_id = str(uuid.uuid4())
    chunks: list[dict[str, Any]] = []
    for i in range(n_chunks):
        chunk_id = str(uuid.uuid4())
        sub_chunks: list[dict[str, Any]] = []
        for j in range(n_sub_chunks):
            sub_chunks.append(
                {
                    "chunk_id": str(uuid.uuid4()),
                    "parent_chunk_id": chunk_id,
                    "page_content": f"Sub-chunk {i}.{j} content",
                    "metadata": {
                        "page_numbers": [i + 1],
                        "chunk_type": "text",
                        "Header 1": f"Section {i}",
                    },
                }
            )
        questions: list[str] = [f"Question {i}.1?", f"Question {i}.2?"] if with_questions else []
        chunks.append(
            {
                "chunk_id": chunk_id,
                "page_content": f"Parent chunk {i} full content",
                "metadata": {
                    "page_numbers": [i + 1],
                    "chunk_type": "text",
                    "hypothetical_questions": questions,
                },
                "sub_chunks": sub_chunks,
            }
        )
    return {
        "metadata": {
            "document_id": doc_id,
            "original_document_name": "test.pdf",
            "source_file_id": source_file_id,
            "summary": "A test summary." if with_summary else "",
        },
        "markdown_content": "# Test",
        "chunks": chunks,
    }


def _make_processed_doc_no_sub_chunks(source_file_id: str = "source-file-1") -> dict[str, Any]:
    """Build a ProcessedDocument where parent chunks have no sub_chunks."""
    doc_id = str(uuid.uuid4())
    chunks: list[dict[str, Any]] = []
    for i in range(2):
        chunks.append(
            {
                "chunk_id": str(uuid.uuid4()),
                "page_content": f"Standalone chunk {i}",
                "metadata": {"page_numbers": [i + 1], "chunk_type": "text"},
                "sub_chunks": [],
            }
        )
    return {
        "metadata": {
            "document_id": doc_id,
            "original_document_name": "standalone.pdf",
            "source_file_id": source_file_id,
            "summary": "",
        },
        "markdown_content": "# Standalone",
        "chunks": chunks,
    }


# ---------------------------------------------------------------------------
# _chunk_metadata_from_dict
# ---------------------------------------------------------------------------


class TestChunkMetadataFromDict:
    """Tests for _chunk_metadata_from_dict helper function."""

    def test_minimal_metadata(self) -> None:
        """Test that minimal input produces a ChunkMetadata with defaults."""
        cm = _chunk_metadata_from_dict(chunk_id="abc", page_content="text", metadata={})
        assert cm.chunk_id == "abc"
        assert cm.page_content == "text"
        assert cm.page_numbers == []
        assert cm.parent_chunk_id is None

    def test_with_parent_chunk_id(self) -> None:
        """Test that parent_chunk_id is set when provided."""
        cm = _chunk_metadata_from_dict(
            chunk_id="abc",
            page_content="text",
            metadata={},
            parent_chunk_id="parent-1",
        )
        assert cm.parent_chunk_id == "parent-1"

    def test_full_metadata(self) -> None:
        """Test that all metadata fields are correctly mapped."""
        meta = {
            "page_numbers": [1, 2],
            "chunk_type": "table",
            "Header 1": "H1",
            "Header 2": "H2",
            "Header 3": "H3",
            "toc_path": ["A", "B"],
            "all_subchapters": ["1.1"],
            "asset_path": "/img.png",
            "caption": "A caption",
            "summary": "Sum",
            "description": "Desc",
            "content": "Raw content",
            "footnote": "FN1",
            "related_assets": [{"id": "a1"}],
            "related_text": [{"id": "t1"}],
            "focus_topic": "Artenschutz",
            "wildlife_mentioned": True,
            "plant_species_mentioned": False,
            "wildlife_species": ["Biber"],
            "plant_species": ["Eiche"],
            "map_scale": "1:10000",
            "hypothetical_questions": ["Q1?"],
        }
        cm = _chunk_metadata_from_dict(chunk_id="c1", page_content="text", metadata=meta)
        assert cm.header_1 == "H1"
        assert cm.focus_topic == "Artenschutz"
        assert cm.wildlife_species == ["Biber"]
        assert cm.map_scale == "1:10000"
        assert cm.hypothetical_questions == ["Q1?"]
        assert cm.related_assets == [{"id": "a1"}]

    def test_uuid_parent_chunk_id_converted_to_string(self) -> None:
        """Test that a UUID parent_chunk_id is stored as a string."""
        uid = uuid.uuid4()
        cm = _chunk_metadata_from_dict(chunk_id="c1", page_content="t", metadata={}, parent_chunk_id=str(uid))
        assert cm.parent_chunk_id == str(uid)


# ---------------------------------------------------------------------------
# _get_inhalts_extraktion_docs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetInhaltsExtraktionDocs:
    """Tests for _get_inhalts_extraktion_docs file listing activity."""
    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.download_file")
    @patch("src.activities.qdrant.indexing.list_files")
    async def test_filters_processed_json(
        self,
        mock_list: Any,
        mock_download: Any,
        _mock_activity: Any,
    ) -> None:
        """Test that only _processed.json files are returned."""
        proj_id = str(uuid.uuid4())
        requested_source_id = str(uuid.uuid4())

        file_ok = MagicMock(id=uuid.uuid4(), filename="doc_processed.json")
        file_skip = MagicMock(id=uuid.uuid4(), filename="doc_summary.json")
        mock_list.return_value = [file_ok, file_skip]

        processed_doc = _make_processed_doc(source_file_id=requested_source_id)
        mock_download.return_value = json.dumps(processed_doc).encode()

        result = await _get_inhalts_extraktion_docs((proj_id, [requested_source_id]))

        assert len(result) == 1
        assert result[0].filename == "doc_processed.json"
        mock_download.assert_awaited_once_with(str(file_ok.id))

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.download_file")
    @patch("src.activities.qdrant.indexing.list_files")
    async def test_pagination(
        self,
        mock_list: Any,
        mock_download: Any,
        _mock_activity: Any,
    ) -> None:
        """When a full page is returned, fetches the next page."""
        proj_id = str(uuid.uuid4())
        requested_source_id = str(uuid.uuid4())

        full_page = [MagicMock(id=uuid.uuid4(), filename=f"doc{i}_processed.json") for i in range(500)]
        partial_page = [MagicMock(id=uuid.uuid4(), filename="last_processed.json")]
        mock_list.side_effect = [full_page, partial_page]

        processed_doc = _make_processed_doc(source_file_id=requested_source_id)
        mock_download.return_value = json.dumps(processed_doc).encode()

        result = await _get_inhalts_extraktion_docs((proj_id, [requested_source_id]))

        assert len(result) == 501
        assert mock_list.await_count == 2
        assert mock_download.await_count == 501

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.list_files")
    async def test_empty_project(
        self,
        mock_list: Any,
        _mock_activity: Any,
    ) -> None:
        """Test that an empty project returns an empty list."""
        empty_list: list[Any] = []
        mock_list.return_value = empty_list

        result = await _get_inhalts_extraktion_docs((str(uuid.uuid4()), [str(uuid.uuid4())]))

        assert result == []

    @patch("src.activities.qdrant.indexing.activity")
    async def test_no_requested_file_ids_returns_empty(
        self,
        _mock_activity: Any,
    ) -> None:
        """Test that an empty list is returned when no file IDs are requested."""
        result = await _get_inhalts_extraktion_docs((str(uuid.uuid4()), None))

        assert result == []


# ---------------------------------------------------------------------------
# _upload_* helpers
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestUploadChunks:
    """Tests for _upload_chunks_to_qdrant helper."""

    async def test_empty_list_noop(self) -> None:
        """Test that an empty chunk list does not trigger any upsert."""
        mock_qdrant = AsyncMock()
        await _upload_chunks_to_qdrant([], _DOC_CONTEXT, mock_qdrant, 50.0)
        mock_qdrant.upsert.assert_not_awaited()

    async def test_uploads_with_model_dump(self) -> None:
        """Test that chunks are upserted with correct payload."""
        mock_qdrant = AsyncMock()

        chunk = _make_chunk("c1", "hello")
        ec = EmbeddedChunk(chunk=chunk, dense_vector=[0.1, 0.2])

        await _upload_chunks_to_qdrant([ec], _DOC_CONTEXT, mock_qdrant, 50.0)

        mock_qdrant.upsert.assert_awaited_once()
        call_kwargs = mock_qdrant.upsert.call_args[1]
        assert call_kwargs["collection_name"] == ENV.QDRANT_COLLECTION_NAME
        points = call_kwargs["points"]
        assert len(points) == 1

        payload = points[0].payload
        assert payload["type"] == "chunk"
        assert payload["project_id"] == "proj-1"
        assert payload["document_id"] == "doc-1"
        assert payload["source_file_id"] == "source-1"
        assert payload["version"] == 1
        assert payload["is_deleted"] is False
        assert payload["chunk_content"] == "hello"
        assert payload["chunk_id"] == "c1"
        assert "page_numbers" in payload
        assert "chunk_type" in payload


@pytest.mark.asyncio
class TestUploadQuestions:
    """Tests for _upload_questions_to_qdrant helper."""

    async def test_empty_list_noop(self) -> None:
        """Test that an empty question list does not trigger any upsert."""
        mock_qdrant = AsyncMock()
        await _upload_questions_to_qdrant([], _DOC_CONTEXT, mock_qdrant, 10.0)
        mock_qdrant.upsert.assert_not_awaited()

    async def test_uploads_questions(self) -> None:
        """Test that questions are upserted with correct payload."""
        mock_qdrant = AsyncMock()

        q = QuestionMetadata(question_text="What is X?", chunk_id="c1")
        eq = EmbeddedQuestion(question=q, dense_vector=[0.5])

        await _upload_questions_to_qdrant([eq], _DOC_CONTEXT, mock_qdrant, 10.0)

        mock_qdrant.upsert.assert_awaited_once()
        points = mock_qdrant.upsert.call_args[1]["points"]
        assert points[0].payload["type"] == "question"
        assert points[0].payload["question_text"] == "What is X?"
        assert points[0].payload["source_file_id"] == "source-1"
        assert points[0].payload["version"] == 1


@pytest.mark.asyncio
class TestUploadParentChunks:
    """Tests for _upload_parent_chunks_to_qdrant helper."""

    async def test_empty_list_noop(self) -> None:
        """Test that an empty parent chunk list does not trigger any upsert."""
        mock_qdrant = AsyncMock()
        await _upload_parent_chunks_to_qdrant([], _DOC_CONTEXT, mock_qdrant)
        mock_qdrant.upsert.assert_not_awaited()

    async def test_uploads_without_vectors(self) -> None:
        """Test that parent chunks are upserted with empty vectors."""
        mock_qdrant = AsyncMock()
        pc = ParentChunkMetadata(chunk_id="p1", page_content="full text", page_numbers=[1, 2])

        await _upload_parent_chunks_to_qdrant([pc], _DOC_CONTEXT, mock_qdrant)

        mock_qdrant.upsert.assert_awaited_once()
        points = mock_qdrant.upsert.call_args[1]["points"]
        assert points[0].vector == {}
        assert points[0].payload["type"] == "parent_chunk"
        assert points[0].payload["page_content"] == "full text"
        assert points[0].payload["source_file_id"] == "source-1"
        assert points[0].payload["version"] == 1


@pytest.mark.asyncio
class TestUploadSummaries:
    """Tests for _upload_summaries_to_qdrant helper."""

    async def test_empty_list_noop(self) -> None:
        """Test that an empty summary list does not trigger any upsert."""
        mock_qdrant = AsyncMock()
        await _upload_summaries_to_qdrant([], _DOC_CONTEXT, mock_qdrant)
        mock_qdrant.upsert.assert_not_awaited()

    async def test_uploads_summaries(self) -> None:
        """Test that summaries are upserted with correct payload."""
        mock_qdrant = AsyncMock()

        s = SummaryMetadata(summary_text="A summary")
        es = EmbeddedSummary(summary=s, dense_vector=[0.9])

        await _upload_summaries_to_qdrant([es], _DOC_CONTEXT, mock_qdrant)

        mock_qdrant.upsert.assert_awaited_once()
        payload = mock_qdrant.upsert.call_args[1]["points"][0].payload
        assert payload["type"] == "summary"
        assert payload["summary_text"] == "A summary"
        assert payload["title"] == "Test Doc"
        assert payload["source_file_id"] == "source-1"
        assert payload["version"] == 1


# ---------------------------------------------------------------------------
# _get_qdrant_client
# ---------------------------------------------------------------------------


class TestGetQdrantClient:
    """Tests for _get_qdrant_client factory function."""
    @patch("src.activities.qdrant.client.AsyncQdrantClient")
    @patch("src.activities.qdrant.client.ENV")
    def test_empty_api_key_passes_none(self, mock_env: Any, mock_client_cls: Any) -> None:
        """Test that an empty API key is passed as None to the client."""
        mock_env.QDRANT_BASE_URL = "http://localhost:6333"
        mock_env.QDRANT_API_KEY = SecretStr("")

        _get_qdrant_client()

        mock_client_cls.assert_called_once_with(url="http://localhost:6333", port=None, api_key=None)

    @patch("src.activities.qdrant.client.AsyncQdrantClient")
    @patch("src.activities.qdrant.client.ENV")
    def test_non_empty_api_key_forwarded(self, mock_env: Any, mock_client_cls: Any) -> None:
        """Test that a non-empty API key is forwarded to the client."""
        mock_env.QDRANT_BASE_URL = "http://localhost:6333"
        mock_env.QDRANT_API_KEY = SecretStr("[REDACTED_API_KEY]")

        _get_qdrant_client()

        mock_client_cls.assert_called_once_with(url="http://localhost:6333", port=None, api_key="[REDACTED_API_KEY]")


@pytest.mark.asyncio
class TestGetHighestDocumentVersion:
    """Tests for _get_highest_document_version Qdrant helper."""

    async def test_returns_none_when_no_points_found(self) -> None:
        """Test that None is returned when no points exist for the document."""
        mock_qdrant = AsyncMock()
        mock_qdrant.scroll = AsyncMock(return_value=([], None))

        result = await _get_highest_document_version(mock_qdrant, "proj-1", "doc.pdf")

        assert result is None
        mock_qdrant.scroll.assert_awaited_once()

    async def test_returns_highest_version_across_pages(self) -> None:
        """Test that the maximum version is returned when results span multiple scroll pages."""
        p1 = MagicMock()
        p1.payload = {"version": 1}
        p2 = MagicMock()
        p2.payload = {"version": 3}
        p3 = MagicMock()
        p3.payload = {"version": 2}

        mock_qdrant = AsyncMock()
        mock_qdrant.scroll = AsyncMock(side_effect=[([p1, p2], "next"), ([p3], None)])

        result = await _get_highest_document_version(mock_qdrant, "proj-1", "doc.pdf")

        assert result == 3
        assert mock_qdrant.scroll.await_count == 2

    async def test_raises_on_non_integer_versions(self) -> None:
        """Test that a TypeError is raised when version payloads contain non-integer values."""
        p1 = MagicMock()
        p1.payload = {"version": "2"}
        p2 = MagicMock()
        p2.payload = {"version": None}
        p3 = MagicMock()
        p3.payload = {"version": 4}

        mock_qdrant = AsyncMock()
        mock_qdrant.scroll = AsyncMock(return_value=([p1, p2, p3], None))

        with pytest.raises(TypeError):
            await _get_highest_document_version(mock_qdrant, "proj-1", "doc.pdf")


@pytest.mark.asyncio
class TestDeleteDocumentVersion:
    """Tests for _delete_document_version Qdrant helper."""

    async def test_sets_is_deleted_payload_for_matching_version(self) -> None:
        """Test that set_payload is called with is_deleted=True for the given version."""
        mock_qdrant = AsyncMock()

        await _delete_document_version(mock_qdrant, "proj-1", "doc.pdf", 2)

        mock_qdrant.set_payload.assert_awaited_once()
        call_kwargs = mock_qdrant.set_payload.await_args.kwargs
        assert call_kwargs["collection_name"] == ENV.QDRANT_COLLECTION_NAME
        assert call_kwargs["payload"] == {"is_deleted": True}
        assert call_kwargs["wait"] is True


@pytest.mark.asyncio
class TestDeleteDocumentBySourceFileId:
    """Tests for _delete_document_by_source_file_id activity."""

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing._get_qdrant_client")
    async def test_returns_true_on_success(
        self,
        mock_get_qdrant_client: Any,
        _mock_activity: Any,
    ) -> None:
        """Test that True is returned and the client is closed after successful deletion."""
        mock_qdrant = AsyncMock()
        mock_get_qdrant_client.return_value = mock_qdrant

        input_data = QdrantDocumentDeleteInput(
            project_id=uuid4(),
            document_file=DeletionFileInfo(
                file_id=str(uuid4()),
                filename="doc.pdf",
                file_type="document",
            ),
        )

        result = await _delete_document_by_source_file_id(input_data)

        assert result is True
        mock_qdrant.set_payload.assert_awaited_once()
        mock_qdrant.close.assert_awaited_once()

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing._get_qdrant_client")
    async def test_returns_false_on_error_and_closes_client(
        self,
        mock_get_qdrant_client: Any,
        _mock_activity: Any,
    ) -> None:
        """Test that False is returned and the client is still closed when set_payload raises."""
        mock_qdrant = AsyncMock()
        mock_qdrant.set_payload = AsyncMock(side_effect=RuntimeError("qdrant failed"))
        mock_get_qdrant_client.return_value = mock_qdrant

        input_data = QdrantDocumentDeleteInput(
            project_id=uuid4(),
            document_file=DeletionFileInfo(
                file_id=str(uuid4()),
                filename="doc.pdf",
                file_type="document",
            ),
        )

        result = await _delete_document_by_source_file_id(input_data)

        assert result is False
        mock_qdrant.close.assert_awaited_once()


# ---------------------------------------------------------------------------
# _init_qdrant_collection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestInitQdrantCollection:
    """Tests for _init_qdrant_collection activity."""
    @patch("src.activities.qdrant.client.AsyncQdrantClient")
    async def test_creates_single_collection(self, mock_client_cls: Any) -> None:
        """Test that a new collection is created when it does not exist."""
        mock_client = AsyncMock()
        mock_client.collection_exists = AsyncMock(return_value=False)
        mock_client_cls.return_value = mock_client

        await _init_qdrant_collection()

        mock_client.create_collection.assert_awaited_once()
        assert mock_client.create_payload_index.await_count >= 1
        mock_client.close.assert_awaited_once()

    @patch("src.activities.qdrant.client.AsyncQdrantClient")
    async def test_skips_existing_collection(self, mock_client_cls: Any) -> None:
        """Test that collection creation is skipped when it already exists."""
        mock_client = AsyncMock()
        mock_client.collection_exists = AsyncMock(return_value=True)
        mock_client_cls.return_value = mock_client

        await _init_qdrant_collection()

        mock_client.create_collection.assert_not_awaited()

    @patch("src.activities.qdrant.client.AsyncQdrantClient")
    async def test_closes_client_on_error(self, mock_client_cls: Any) -> None:
        """Test that the Qdrant client is closed even when an error occurs."""
        mock_client = AsyncMock()
        mock_client.collection_exists = AsyncMock(side_effect=RuntimeError("connection failed"))
        mock_client_cls.return_value = mock_client

        with pytest.raises(RuntimeError):
            await _init_qdrant_collection()

        mock_client.close.assert_awaited_once()


@pytest.mark.asyncio
class TestPrepareQdrantData:
    """Tests for _prepare_qdrant_data activity."""

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.download_file")
    async def test_full_document_preparation(
        self,
        mock_download: Any,
        mock_activity: Any,
    ) -> None:
        """Test that a full document is prepared with chunks, questions, and summary."""
        doc_data = _make_processed_doc(n_chunks=2, n_sub_chunks=2, with_summary=True, with_questions=True)
        mock_download.return_value = json.dumps(doc_data).encode()

        input_data = QdrantDocumentInput(extraction_file_id="file-1", project_id="proj-1")
        result = await _prepare_qdrant_data(input_data)

        assert result is not None
        assert len(result.chunks) == 4  # 2 chunks × 2 sub_chunks
        assert len(result.questions) == 4  # 2 chunks × 2 questions
        assert len(result.summaries) == 1
        assert len(result.parent_chunks) == 2
        assert result.doc_context.project_id == "proj-1"
        assert result.doc_context.document_id == "file-1"
        assert result.avg_chunk_length > 0
        assert result.avg_question_length > 0

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.download_file")
    async def test_empty_document_returns_none(
        self,
        mock_download: Any,
        mock_activity: Any,
    ) -> None:
        """Document with zero chunks should return None."""
        doc_data: dict[str, Any] = {
            "metadata": {
                "document_id": "doc-empty",
                "original_document_name": "empty.pdf",
                "source_file_id": "source-empty",
                "summary": "",
            },
            "markdown_content": "",
            "chunks": [],
        }
        mock_download.return_value = json.dumps(doc_data).encode()

        input_data = QdrantDocumentInput(extraction_file_id="file-1", project_id="proj-1")
        result = await _prepare_qdrant_data(input_data)

        assert result is None

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.download_file")
    async def test_preloaded_document_skips_download(
        self,
        mock_download: Any,
        mock_activity: Any,
    ) -> None:
        """When processed_document is provided, download_file should not be called."""
        from src.schemas import ProcessedDocument

        doc_data = _make_processed_doc(n_chunks=1, n_sub_chunks=1, with_summary=False, with_questions=False)
        processed_doc = ProcessedDocument(**doc_data)

        input_data = QdrantDocumentInput(
            extraction_file_id="file-1",
            project_id="proj-1",
            processed_document=processed_doc,
        )

        result = await _prepare_qdrant_data(input_data)

        assert result is not None
        assert len(result.chunks) == 1
        mock_download.assert_not_awaited()

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.download_file")
    async def test_prev_next_pointers_set(
        self,
        mock_download: Any,
        mock_activity: Any,
    ) -> None:
        """Check that previous/next chunk pointers are set correctly."""
        doc_data = _make_processed_doc(n_chunks=1, n_sub_chunks=3, with_summary=False, with_questions=False)
        mock_download.return_value = json.dumps(doc_data).encode()

        input_data = QdrantDocumentInput(extraction_file_id="file-1", project_id="proj-1")
        result = await _prepare_qdrant_data(input_data)

        assert result is not None
        assert len(result.chunks) == 3

        assert result.chunks[0].previous_chunk_id is None
        assert result.chunks[0].next_chunk_id is not None

        assert result.chunks[2].previous_chunk_id is not None
        assert result.chunks[2].next_chunk_id is None

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.download_file")
    async def test_questions_skip_empty_strings(
        self,
        mock_download: Any,
        mock_activity: Any,
    ) -> None:
        """Empty/whitespace-only questions should be filtered out."""
        doc_data = _make_processed_doc(n_chunks=1, n_sub_chunks=1, with_questions=False)
        doc_data["chunks"][0]["metadata"]["hypothetical_questions"] = ["Valid?", "", "  "]
        mock_download.return_value = json.dumps(doc_data).encode()

        input_data = QdrantDocumentInput(extraction_file_id="file-1", project_id="proj-1")
        result = await _prepare_qdrant_data(input_data)

        assert result is not None
        assert len(result.questions) == 1
        assert result.questions[0].question_text == "Valid?"

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.download_file")
    async def test_document_without_sub_chunks(
        self,
        mock_download: Any,
        mock_activity: Any,
    ) -> None:
        """Parent chunks without sub_chunks should be prepared as standalone chunks."""
        doc_data = _make_processed_doc_no_sub_chunks()
        mock_download.return_value = json.dumps(doc_data).encode()

        input_data = QdrantDocumentInput(extraction_file_id="file-1", project_id="proj-1")
        result = await _prepare_qdrant_data(input_data)

        assert result is not None
        assert len(result.chunks) == 2
        assert len(result.parent_chunks) == 0


def _make_upload_input(
    n_chunks: int = 2,
    n_questions: int = 2,
    n_summaries: int = 1,
    n_parent_chunks: int = 1,
) -> QdrantUploadInput:
    """Build a QdrantUploadInput for testing the upload activity."""
    return QdrantUploadInput(
        embedded_chunks=[
            EmbeddedChunk(
                chunk=ChunkMetadata(chunk_id=f"c{i}", page_content=f"Chunk {i}", page_numbers=[i]),
                dense_vector=[0.1] * 3,
            )
            for i in range(n_chunks)
        ],
        embedded_questions=[
            EmbeddedQuestion(
                question=QuestionMetadata(question_text=f"Q{i}?", chunk_id=f"c{i}"),
                dense_vector=[0.2] * 3,
            )
            for i in range(n_questions)
        ],
        embedded_summaries=[
            EmbeddedSummary(
                summary=SummaryMetadata(summary_text=f"Summary {i}"),
                dense_vector=[0.3] * 3,
            )
            for i in range(n_summaries)
        ],
        parent_chunks=[
            ParentChunkMetadata(chunk_id=f"p{i}", page_content=f"Parent {i}", page_numbers=[i])
            for i in range(n_parent_chunks)
        ],
        doc_context=QdrantDocumentContext(
            project_id="proj-1",
            document_id="doc-1",
            source_file_id="source-1",
            title="test.pdf",
            version=0,
            is_deleted=False,
        ),
        avg_chunk_length=5.0,
        avg_question_length=3.0,
    )


@pytest.mark.asyncio
class TestIndexDocumentToQdrant:
    """Tests for _upload_to_qdrant (upload) activity."""

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing._get_qdrant_client")
    async def test_full_upload(
        self,
        mock_get_qdrant_client: Any,
        mock_activity: Any,
    ) -> None:
        """Test that all data types are uploaded with version management."""
        mock_qdrant = AsyncMock()
        mock_qdrant.scroll = AsyncMock(return_value=([MagicMock(payload={"version": 1})], None))
        mock_get_qdrant_client.return_value = mock_qdrant

        upload_input = _make_upload_input()
        result = await _upload_to_qdrant(upload_input)

        assert result == "doc-1"
        assert mock_qdrant.set_payload.await_count == 2  # source_file soft-delete + old version soft-delete
        assert mock_qdrant.upsert.await_count >= 4  # chunks, questions, parent_chunks, summaries
        mock_qdrant.close.assert_awaited_once()

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing._get_qdrant_client")
    async def test_first_version_created(
        self,
        mock_get_qdrant_client: Any,
        mock_activity: Any,
    ) -> None:
        """Test that version 1 is created when no existing points are found."""
        mock_qdrant = AsyncMock()
        mock_qdrant.scroll = AsyncMock(return_value=([], None))
        mock_get_qdrant_client.return_value = mock_qdrant

        uploaded_points: list[Any] = []

        async def capture_upsert(**kwargs: Any) -> None:
            uploaded_points.extend(kwargs.get("points", []))

        mock_qdrant.upsert = AsyncMock(side_effect=capture_upsert)

        upload_input = _make_upload_input(n_chunks=1, n_questions=0, n_summaries=0, n_parent_chunks=0)
        await _upload_to_qdrant(upload_input)

        assert len(uploaded_points) == 1
        assert uploaded_points[0].payload["version"] == 1
        mock_qdrant.set_payload.assert_awaited_once()  # only source_file soft-delete, no old version

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing._get_qdrant_client")
    async def test_client_closed_on_error(
        self,
        mock_get_qdrant_client: Any,
        mock_activity: Any,
    ) -> None:
        """Verify Qdrant client is closed even when an error occurs."""
        mock_qdrant = AsyncMock()
        mock_qdrant.scroll = AsyncMock(return_value=([MagicMock(payload={"version": 1})], None))
        mock_qdrant.set_payload = AsyncMock(side_effect=RuntimeError("qdrant down"))
        mock_get_qdrant_client.return_value = mock_qdrant

        upload_input = _make_upload_input()

        with pytest.raises(RuntimeError, match="qdrant down"):
            await _upload_to_qdrant(upload_input)

        mock_qdrant.close.assert_awaited_once()


@pytest.mark.asyncio
class TestQdrantSourceFileCleanup:
    @patch("src.activities.qdrant.indexing._get_qdrant_client")
    async def test_mark_qdrant_source_files_deleted_writes_marker_payload(
        self,
        mock_get_qdrant_client: Any,
    ) -> None:
        mock_qdrant = AsyncMock()
        mock_get_qdrant_client.return_value = mock_qdrant
        input_data = QdrantSourceFileCleanupInput(
            project_id="proj-1",
            source_file_ids=["file-1", "file-2"],
            marker="workflow:run:2",
            project_version=2,
        )

        result = await _mark_qdrant_source_files_deleted(input_data)

        assert result.processed_file_ids == ["file-1", "file-2"]
        assert mock_qdrant.set_payload.await_count == 2
        first_call = mock_qdrant.set_payload.await_args_list[0].kwargs
        assert first_call["payload"] == {
            "is_deleted": True,
            "qdrant_cleanup_marker": "workflow:run:2",
            "qdrant_cleanup_project_version": 2,
        }
        point_filter = first_call["points"]
        assert [condition.key for condition in point_filter.must] == [
            "project_id",
            "source_file_id",
            "is_deleted",
        ]
        mock_qdrant.close.assert_awaited_once()

    @patch("src.activities.qdrant.indexing._get_qdrant_client")
    async def test_restore_qdrant_source_files_deleted_only_clears_matching_marker(
        self,
        mock_get_qdrant_client: Any,
    ) -> None:
        mock_qdrant = AsyncMock()
        mock_get_qdrant_client.return_value = mock_qdrant
        input_data = QdrantSourceFileCleanupInput(
            project_id="proj-1",
            source_file_ids=["file-1"],
            marker="workflow:run:2",
            project_version=2,
        )

        result = await _restore_qdrant_source_files_deleted(input_data)

        assert result.processed_file_ids == ["file-1"]
        mock_qdrant.set_payload.assert_awaited_once()
        call_kwargs = mock_qdrant.set_payload.await_args.kwargs
        assert call_kwargs["payload"] == {
            "is_deleted": False,
            "qdrant_cleanup_marker": "",
            "qdrant_cleanup_project_version": 0,
        }
        point_filter = call_kwargs["points"]
        assert [condition.key for condition in point_filter.must] == [
            "project_id",
            "source_file_id",
            "qdrant_cleanup_marker",
        ]
        mock_qdrant.close.assert_awaited_once()


# ---------------------------------------------------------------------------
# I/O models
# ---------------------------------------------------------------------------


class TestIOModels:
    """Tests for Qdrant I/O Pydantic models."""

    def test_qdrant_extraction_file(self) -> None:
        """Test that QdrantExtractionFile stores extraction_file_id."""
        ef = QdrantExtractionFile(extraction_file_id="f1", filename="test.json", project_id="p1")
        assert ef.extraction_file_id == "f1"

    def test_qdrant_document_input(self) -> None:
        """Test that QdrantDocumentInput defaults processed_document to None."""
        di = QdrantDocumentInput(extraction_file_id="f1", project_id="p1")
        assert di.project_id == "p1"
        assert di.processed_document is None

    def test_qdrant_document_input_with_processed_document(self) -> None:
        """Test that QdrantDocumentInput accepts an optional ProcessedDocument."""
        from src.schemas import ProcessedDocument

        doc_data = _make_processed_doc(n_chunks=1, n_sub_chunks=1)
        processed_doc = ProcessedDocument(**doc_data)
        di = QdrantDocumentInput(extraction_file_id="f1", project_id="p1", processed_document=processed_doc)
        assert di.processed_document is not None
        assert di.processed_document.metadata.original_document_name == "test.pdf"
