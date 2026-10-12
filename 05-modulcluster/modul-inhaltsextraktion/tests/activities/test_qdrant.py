"""Tests for Qdrant activity functions."""

import json
import socket
import uuid
from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from pydantic import SecretStr
from qdrant_client import AsyncQdrantClient
from qdrant_client import models as qm
from qdrant_client.http.exceptions import ResponseHandlingException
from temporal.contracts import QdrantSourceFileCleanupInput

from src.activities.qdrant.client import _get_qdrant_client, _init_qdrant_collection
from src.activities.qdrant.indexing import (
    _delete_document_by_source_file_id,
    _delete_document_version,
    _get_highest_document_version,
    _get_inhalts_extraktion_docs,
    _mark_qdrant_source_files_deleted,
    _prepare_qdrant_data,
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
    QdrantUploadInput,
)
from src.env import ENV
from src.schemas import ProcessedDocument
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
# qdrant-client local stores
# ---------------------------------------------------------------------------


@pytest.fixture
async def memory_qdrant() -> AsyncIterator[AsyncQdrantClient]:
    client = AsyncQdrantClient(location=":memory:")
    try:
        yield client
    finally:
        await client.close()


@pytest.fixture
def local_qdrant(tmp_path: Path) -> Iterator[str]:
    """Serve every client an activity creates from one persistent qdrant-client local store.

    The local store holds an exclusive file lock until its client is closed, so a
    reopen after an activity also proves that the activity closed its client.
    """
    path = str(tmp_path / "qdrant")
    with (
        patch("src.activities.qdrant.indexing._get_qdrant_client", side_effect=lambda: AsyncQdrantClient(path=path)),
        patch("src.activities.qdrant.client._get_qdrant_client", side_effect=lambda: AsyncQdrantClient(path=path)),
    ):
        yield path


async def _seed(client: AsyncQdrantClient, payloads: dict[int, dict[str, Any]]) -> None:
    await client.create_collection(
        ENV.QDRANT_COLLECTION_NAME,
        vectors_config={"dense": qm.VectorParams(size=2, distance=qm.Distance.COSINE)},
    )
    await client.upsert(
        ENV.QDRANT_COLLECTION_NAME,
        points=[
            qm.PointStruct(id=point_id, vector={"dense": [1.0, 0.0]}, payload=payload)
            for point_id, payload in payloads.items()
        ],
    )


async def _payloads(client: AsyncQdrantClient) -> dict[int, dict[str, Any]]:
    records, _ = await client.scroll(ENV.QDRANT_COLLECTION_NAME, with_payload=True, with_vectors=False)
    return {int(record.id): dict(record.payload or {}) for record in records}


async def _seed_store(path: str, payloads: dict[int, dict[str, Any]]) -> None:
    client = AsyncQdrantClient(path=path)
    try:
        await _seed(client, payloads)
    finally:
        await client.close()


async def _stored_payloads(path: str) -> dict[int, dict[str, Any]]:
    client = AsyncQdrantClient(path=path)
    try:
        return await _payloads(client)
    finally:
        await client.close()


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


# ---------------------------------------------------------------------------
# _get_inhalts_extraktion_docs
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestGetInhaltsExtraktionDocs:
    """Tests for _get_inhalts_extraktion_docs file listing activity."""

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.download_file")
    @patch("src.utils.dms_utils.list_files")
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

        assert [extraction_file.filename for extraction_file in result] == ["doc_processed.json"]

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing.download_file")
    @patch("src.utils.dms_utils.list_files")
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

        assert [extraction_file.filename for extraction_file in result] == [
            listed.filename for listed in [*full_page, *partial_page]
        ]
        assert [request.args[0].page for request in mock_list.await_args_list] == [1, 2]

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.utils.dms_utils.list_files")
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

    async def test_returns_none_for_other_titles_and_projects(self, memory_qdrant: AsyncQdrantClient) -> None:
        await _seed(
            memory_qdrant,
            {
                1: {"project_id": "proj-1", "title": "other.pdf", "version": 5},
                2: {"project_id": "proj-2", "title": "doc.pdf", "version": 5},
            },
        )

        assert await _get_highest_document_version(memory_qdrant, "proj-1", "doc.pdf") is None

    async def test_reads_the_highest_version_from_a_later_scroll_page(self, memory_qdrant: AsyncQdrantClient) -> None:
        newest = 3
        matching = {"project_id": "proj-1", "title": "doc.pdf"}
        # Several times the helper's scroll page size; the scroll returns ids in ascending order.
        older_points = {point_id: {**matching, "version": 1} for point_id in range(1, 600)}
        await _seed(memory_qdrant, {**older_points, 600: {**matching, "version": newest}})

        assert await _get_highest_document_version(memory_qdrant, "proj-1", "doc.pdf") == newest

    async def test_rejects_non_integer_versions(self, memory_qdrant: AsyncQdrantClient) -> None:
        await _seed(
            memory_qdrant,
            {
                1: {"project_id": "proj-1", "title": "doc.pdf", "version": "2"},
                2: {"project_id": "proj-1", "title": "doc.pdf", "version": 4},
            },
        )

        with pytest.raises(TypeError):
            await _get_highest_document_version(memory_qdrant, "proj-1", "doc.pdf")


@pytest.mark.asyncio
class TestDeleteDocumentVersion:
    """Tests for _delete_document_version Qdrant helper."""

    async def test_soft_deletes_only_that_title_version(self, memory_qdrant: AsyncQdrantClient) -> None:
        seeded = {
            1: {"project_id": "proj-1", "title": "doc.pdf", "version": 2, "is_deleted": False},
            2: {"project_id": "proj-1", "title": "doc.pdf", "version": 1, "is_deleted": False},
            3: {"project_id": "proj-1", "title": "other.pdf", "version": 2, "is_deleted": False},
            4: {"project_id": "proj-2", "title": "doc.pdf", "version": 2, "is_deleted": False},
        }
        await _seed(memory_qdrant, seeded)

        await _delete_document_version(memory_qdrant, "proj-1", "doc.pdf", 2)

        assert await _payloads(memory_qdrant) == {**seeded, 1: {**seeded[1], "is_deleted": True}}


@pytest.mark.asyncio
class TestDeleteDocumentBySourceFileId:
    """Tests for _delete_document_by_source_file_id activity."""

    @patch("src.activities.qdrant.indexing.activity")
    async def test_soft_deletes_only_that_source_files_points(self, _mock_activity: Any, local_qdrant: str) -> None:
        project_id = uuid4()
        source_file_id = str(uuid4())
        seeded = {
            1: {"project_id": str(project_id), "source_file_id": source_file_id, "is_deleted": False},
            2: {"project_id": str(project_id), "source_file_id": str(uuid4()), "is_deleted": False},
        }
        await _seed_store(local_qdrant, seeded)

        result = await _delete_document_by_source_file_id(
            QdrantDocumentDeleteInput(
                project_id=project_id,
                document_file=DeletionFileInfo(file_id=source_file_id, filename="doc.pdf", file_type="document"),
            )
        )

        assert result is True
        assert await _stored_payloads(local_qdrant) == {**seeded, 1: {**seeded[1], "is_deleted": True}}

    @patch("src.activities.qdrant.indexing.activity")
    async def test_reports_a_failed_delete_and_closes_the_client(self, _mock_activity: Any, local_qdrant: str) -> None:
        result = await _delete_document_by_source_file_id(
            QdrantDocumentDeleteInput(
                project_id=uuid4(),
                document_file=DeletionFileInfo(file_id=str(uuid4()), filename="doc.pdf", file_type="document"),
            )
        )

        assert result is False
        # Reopening the store fails while the activity's client still holds its lock.
        await AsyncQdrantClient(path=local_qdrant).close()


# ---------------------------------------------------------------------------
# _init_qdrant_collection
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
class TestInitQdrantCollection:
    """Tests for _init_qdrant_collection activity."""

    async def test_creates_the_vectors_uploads_write(self, local_qdrant: str) -> None:
        await _init_qdrant_collection()

        client = AsyncQdrantClient(path=local_qdrant)
        try:
            params = (await client.get_collection(ENV.QDRANT_COLLECTION_NAME)).config.params
        finally:
            await client.close()
        assert params.vectors == {
            "dense": qm.VectorParams(size=ENV.QDRANT_DENSE_VECTOR_SIZE, distance=qm.Distance.COSINE)
        }
        assert params.sparse_vectors == {"sparse": qm.SparseVectorParams(modifier=qm.Modifier.IDF)}

    async def test_keeps_an_existing_collection_and_its_points(self, local_qdrant: str) -> None:
        seeded = {1: {"project_id": "proj-1", "is_deleted": False}}
        await _seed_store(local_qdrant, seeded)

        await _init_qdrant_collection()

        assert await _stored_payloads(local_qdrant) == seeded

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

        chunks = doc_data["chunks"]
        assert result is not None
        assert [chunk.page_content for chunk in result.chunks] == [
            sub["page_content"] for chunk in chunks for sub in chunk["sub_chunks"]
        ]
        assert [question.question_text for question in result.questions] == [
            question for chunk in chunks for question in chunk["metadata"]["hypothetical_questions"]
        ]
        assert [summary.summary_text for summary in result.summaries] == [doc_data["metadata"]["summary"]]
        assert [parent.page_content for parent in result.parent_chunks] == [chunk["page_content"] for chunk in chunks]
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
        chunk_ids = [chunk.chunk_id for chunk in result.chunks]
        assert [chunk.previous_chunk_id for chunk in result.chunks] == [None, *chunk_ids[:-1]]
        assert [chunk.next_chunk_id for chunk in result.chunks] == [*chunk_ids[1:], None]

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
        assert [chunk.page_content for chunk in result.chunks] == [
            chunk["page_content"] for chunk in doc_data["chunks"]
        ]
        assert result.parent_chunks == []


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


def _soft_deleted_selections(mock_qdrant: AsyncMock) -> list[dict[str, Any]]:
    """Return the {field: value} filter of every set_payload request, each of which must soft-delete."""
    requests = [call.kwargs for call in mock_qdrant.set_payload.await_args_list]
    assert all(request["payload"] == {"is_deleted": True} for request in requests)
    return [{condition.key: condition.match.value for condition in request["points"].must} for request in requests]


@pytest.mark.asyncio
class TestIndexDocumentToQdrant:
    """Tests for _upload_to_qdrant (upload) activity."""

    @patch("src.activities.qdrant.indexing.activity")
    @patch("src.activities.qdrant.indexing._get_qdrant_client")
    async def test_new_version_replaces_the_highest_existing_version(
        self,
        mock_get_qdrant_client: Any,
        mock_activity: Any,
    ) -> None:
        existing_version = 1
        mock_qdrant = AsyncMock()
        mock_qdrant.scroll = AsyncMock(return_value=([qm.Record(id=1, payload={"version": existing_version})], None))
        uploaded: list[Any] = []
        mock_qdrant.upsert = AsyncMock(side_effect=lambda **request: uploaded.extend(request["points"]))
        mock_get_qdrant_client.return_value = mock_qdrant

        upload_input = _make_upload_input()
        result = await _upload_to_qdrant(upload_input)

        assert result == upload_input.doc_context.document_id
        assert sorted(_soft_deleted_selections(mock_qdrant), key=len) == [
            {"project_id": "proj-1", "source_file_id": "source-1"},
            {"project_id": "proj-1", "title": "test.pdf", "version": existing_version},
        ]
        assert sorted(point.payload["type"] for point in uploaded) == sorted(
            ["chunk"] * len(upload_input.embedded_chunks)
            + ["question"] * len(upload_input.embedded_questions)
            + ["parent_chunk"] * len(upload_input.parent_chunks)
            + ["summary"] * len(upload_input.embedded_summaries)
        )
        assert {point.payload["version"] for point in uploaded} == {existing_version + 1}
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
        uploaded: list[Any] = []
        mock_qdrant.upsert = AsyncMock(side_effect=lambda **request: uploaded.extend(request["points"]))
        mock_get_qdrant_client.return_value = mock_qdrant

        upload_input = _make_upload_input(n_chunks=1, n_questions=0, n_summaries=0, n_parent_chunks=0)
        await _upload_to_qdrant(upload_input)

        assert [point.payload["version"] for point in uploaded] == [1]
        assert _soft_deleted_selections(mock_qdrant) == [{"project_id": "proj-1", "source_file_id": "source-1"}]

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


_CLEANUP = QdrantSourceFileCleanupInput(
    project_id="proj-1",
    source_file_ids=["file-1", "file-2"],
    marker="workflow:run:2",
    project_version=2,
)
_CLEANUP_ACTIVITIES = [_mark_qdrant_source_files_deleted, _restore_qdrant_source_files_deleted]


@pytest.mark.asyncio
class TestQdrantSourceFileCleanup:
    async def test_mark_then_restore_changes_only_this_cleanup_markers_points(self, local_qdrant: str) -> None:
        seeded = {
            1: {"project_id": "proj-1", "source_file_id": "file-1", "is_deleted": False},
            2: {
                "project_id": "proj-1",
                "source_file_id": "file-1",
                "is_deleted": True,
                "qdrant_cleanup_marker": "earlier:run:1",
                "qdrant_cleanup_project_version": 1,
            },
            3: {"project_id": "proj-1", "source_file_id": "file-3", "is_deleted": False},
            4: {"project_id": "proj-2", "source_file_id": "file-1", "is_deleted": False},
        }
        await _seed_store(local_qdrant, seeded)

        marked = await _mark_qdrant_source_files_deleted(_CLEANUP)
        after_mark = await _stored_payloads(local_qdrant)

        assert marked.processed_file_ids == ["file-1", "file-2"]
        assert after_mark == {
            **seeded,
            1: {
                **seeded[1],
                "is_deleted": True,
                "qdrant_cleanup_marker": _CLEANUP.marker,
                "qdrant_cleanup_project_version": _CLEANUP.project_version,
            },
        }

        restored = await _restore_qdrant_source_files_deleted(_CLEANUP)
        after_restore = await _stored_payloads(local_qdrant)

        assert restored.processed_file_ids == ["file-1", "file-2"]
        assert after_restore[1]["is_deleted"] is False
        assert after_restore[1].get("qdrant_cleanup_marker") != _CLEANUP.marker
        assert {point_id: after_restore[point_id] for point_id in (2, 3, 4)} == {
            point_id: seeded[point_id] for point_id in (2, 3, 4)
        }

    @pytest.mark.parametrize("activity", _CLEANUP_ACTIVITIES, ids=["mark", "restore"])
    async def test_absent_collection_has_no_points_to_clean(self, local_qdrant: str, activity: Any) -> None:
        result = await activity(_CLEANUP)

        assert result.processed_file_ids == ["file-1", "file-2"]
        client = AsyncQdrantClient(path=local_qdrant)
        try:
            assert not await client.collection_exists(ENV.QDRANT_COLLECTION_NAME)
        finally:
            await client.close()

    @pytest.mark.parametrize("activity", _CLEANUP_ACTIVITIES, ids=["mark", "restore"])
    async def test_unreachable_qdrant_still_fails(self, activity: Any) -> None:
        with socket.socket() as probe:
            probe.bind(("127.0.0.1", 0))
            closed_port = probe.getsockname()[1]
        unreachable = AsyncQdrantClient(url=f"http://127.0.0.1:{closed_port}", port=None, check_compatibility=False)

        with (
            patch("src.activities.qdrant.indexing._get_qdrant_client", return_value=unreachable),
            pytest.raises(ResponseHandlingException),
        ):
            await activity(_CLEANUP)
