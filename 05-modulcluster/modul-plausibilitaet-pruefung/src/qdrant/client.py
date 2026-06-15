"""Qdrant client helpers for claim and chunk retrieval."""

from typing import Any, Literal, TypeVar

from qdrant_client import AsyncQdrantClient, models
from temporalio import activity

from src.config.config import Config
from src.config.env import ENV
from src.qdrant.schemas import (
    ChunkPayload,
    ClaimPayload,
)

TPayload = TypeVar("TPayload", ChunkPayload, ClaimPayload)


class PlausibilityQdrantClient(AsyncQdrantClient):
    """Async Qdrant client configured for plausibility-check collections."""

    def __init__(
        self,
    ) -> None:
        """Initialize the client from environment settings."""

        super().__init__(url=ENV.QDRANT.CLUSTER_ENDPOINT, port=None, timeout=120)

    def _get_collection_name(
        self,
        project_id: str,
        collection_type: Literal["claims", "chunks", "parent_chunks", "summaries"],
    ) -> str:
        """Map logical collection types to the configured Qdrant collection names."""

        if collection_type == "claims":
            return Config.QDRANT.CLAIM_COLLECTION_NAME
        if collection_type in ["chunks", "parent_chunks", "summaries"]:
            return Config.QDRANT.DATA_COLLECTION_NAME
        raise ValueError(f"Unknown collection type: {collection_type}")

    def get_collection_must_conditions(
        self,
        project_id: str,
        collection_type: Literal["claims", "chunks", "parent_chunks", "summaries"],
    ) -> list[models.Condition]:
        """Build the base filter conditions shared by a logical collection type."""

        if collection_type == "claims":
            return [
                models.FieldCondition(
                    key="project_id",
                    match=models.MatchValue(value=project_id),
                )
            ]
        elif collection_type in ["chunks", "parent_chunks", "summaries"]:
            must_conditions: list[models.Condition] = [
                models.FieldCondition(
                    key="project_id",
                    match=models.MatchValue(value=project_id),
                ),
            ]
            if collection_type == "chunks":
                must_conditions.append(
                    models.FieldCondition(
                        key="type",
                        match=models.MatchValue(value="chunk"),
                    )
                )
            elif collection_type == "parent_chunks":
                must_conditions.append(
                    models.FieldCondition(
                        key="type",
                        match=models.MatchValue(value="parent_chunk"),
                    )
                )
            elif collection_type == "summaries":
                must_conditions.append(
                    models.FieldCondition(
                        key="type",
                        match=models.MatchValue(value="summary"),
                    )
                )
            return must_conditions
        else:
            raise ValueError(f"Unknown collection type: {collection_type}")

    async def _get_record_ids(
        self,
        collection_name: str,
        collection_filter: models.Filter,
    ) -> list[str]:
        """Scroll a collection and return unique record IDs in encounter order."""

        seen: set[str] = set()
        ordered_ids: list[str] = []

        offset = None
        while True:
            response, offset = await self.scroll(
                collection_name=collection_name,
                scroll_filter=collection_filter,
                limit=1000,
                offset=offset,
                with_payload=False,
                with_vectors=False,
            )

            for record in response:
                record_id = str(record.id)
                if record_id not in seen:
                    seen.add(record_id)
                    ordered_ids.append(record_id)

            if offset is None:
                break

        return ordered_ids

    async def _get_record_payloads(
        self,
        project_id: str,
        point_ids: list[str],
        collection: Literal["claims", "chunks", "summaries", "parent_chunks"],
        with_vectors: bool = False,
    ) -> list[Any]:
        """Retrieve Qdrant payload records by point ID."""

        collection_name = self._get_collection_name(project_id, collection)

        unique_ids = list(set(point_ids))

        return await self.retrieve(
            collection_name=collection_name,
            ids=unique_ids,
            with_payload=True,
            with_vectors=with_vectors,
        )

    _MATCH_ANY_BATCH_SIZE: int = 500

    async def _get_record_payloads_by_payload_field(
        self,
        project_id: str,
        payload_field: str,
        field_values: list[str],
        collection: Literal["chunks", "parent_chunks"],
        with_vectors: bool = False,
    ) -> list[Any]:
        """Retrieve records by matching a payload field value instead of Qdrant point ID.

        Use this for collections where the caller-supplied IDs are payload field
        values (e.g. chunk_id) rather than Qdrant point IDs.

        Splits large ID lists into sub-batches to avoid overloading the Qdrant
        ``MatchAny`` filter.
        """
        unique_values = list(set(field_values))
        if not unique_values:
            return []

        records: list[Any] = []
        seen: set[str] = set()

        for i in range(0, len(unique_values), self._MATCH_ANY_BATCH_SIZE):
            batch_values = unique_values[i : i + self._MATCH_ANY_BATCH_SIZE]
            batch_records = await self._scroll_by_payload_field(
                project_id=project_id,
                payload_field=payload_field,
                values=batch_values,
                collection=collection,
                with_vectors=with_vectors,
            )
            for record in batch_records:
                record_id = str(record.id)
                if record_id not in seen:
                    seen.add(record_id)
                    records.append(record)

        return records

    async def _scroll_by_payload_field(
        self,
        project_id: str,
        payload_field: str,
        values: list[str],
        collection: Literal["chunks", "parent_chunks"],
        with_vectors: bool = False,
    ) -> list[Any]:
        """Scroll a single MatchAny batch and return all matching records."""
        collection_name = self._get_collection_name(project_id, collection)
        must_conditions = self.get_collection_must_conditions(project_id, collection)
        must_conditions.append(
            models.FieldCondition(
                key=payload_field,
                match=models.MatchAny(any=values),
            )
        )
        collection_filter = models.Filter(must=must_conditions)

        records: list[Any] = []
        offset = None

        while True:
            response, offset = await self.scroll(
                collection_name=collection_name,
                scroll_filter=collection_filter,
                limit=1000,
                offset=offset,
                with_payload=True,
                with_vectors=with_vectors,
            )
            records.extend(response)
            if offset is None:
                break

        return records

    def _build_knn_filter(
        self,
        claim_id: str,
        claim_payload: "ClaimPayload",
        chunk_payload: "ChunkPayload | None",
        same_doc_claims_only: bool,
        erlaeuterungsbericht_claims_only: bool,
        exclude_local_claims: bool,
        exclude_claim_ids: list[str] | None,
    ) -> models.Filter:
        """Build a Qdrant filter for KNN claim queries."""
        must_conditions: list[models.Condition] = []
        must_not_conditions: list[models.Condition] = []

        excluded = [claim_id] + (exclude_claim_ids or [])
        must_not_conditions.append(models.HasIdCondition(has_id=excluded))

        if exclude_local_claims and chunk_payload is not None:
            local_chunk_ids = [
                chunk_payload.chunk_id,
                chunk_payload.previous_chunk_id,
                chunk_payload.next_chunk_id,
            ]
            local_chunk_ids = [chunk_id for chunk_id in local_chunk_ids if chunk_id is not None]
            if local_chunk_ids:
                must_not_conditions.append(
                    models.FieldCondition(
                        key="chunk_id",
                        match=models.MatchAny(any=local_chunk_ids),
                    )
                )

        must_conditions.append(
            models.FieldCondition(
                key="project_id",
                match=models.MatchValue(value=claim_payload.project_id),
            )
        )

        if same_doc_claims_only:
            must_conditions.append(
                models.FieldCondition(
                    key="document_id",
                    match=models.MatchValue(value=claim_payload.document_id),
                )
            )

        if erlaeuterungsbericht_claims_only:
            must_conditions.append(
                models.FieldCondition(
                    key="erlauterungsbericht",
                    match=models.MatchValue(value=True),
                )
            )

        return models.Filter(must=must_conditions, must_not=must_not_conditions)

    async def init_claim_collection(self) -> None:
        """Initialize Qdrant collection for claims with the appropriate schema."""
        # Collection creation is idempotent, so this is safe to call multiple times
        if await self.collection_exists(collection_name=Config.QDRANT.CLAIM_COLLECTION_NAME):
            return

        collection_name = Config.QDRANT.CLAIM_COLLECTION_NAME

        await self.create_collection(
            collection_name=collection_name,
            vectors_config=models.VectorParams(size=ENV.QDRANT.VECTOR_SIZE, distance=models.Distance.COSINE),
        )

        for keyword_field in Config.QDRANT.INDEX_KEYWORDS:
            await self.create_payload_index(
                collection_name=collection_name, field_name=keyword_field, field_schema=models.PayloadSchemaType.KEYWORD
            )
        for text_field in Config.QDRANT.INDEX_TEXT:
            await self.create_payload_index(
                collection_name=collection_name, field_name=text_field, field_schema=models.PayloadSchemaType.TEXT
            )
        for bool_field in Config.QDRANT.INDEX_BOOLS:
            await self.create_payload_index(
                collection_name=collection_name, field_name=bool_field, field_schema=models.PayloadSchemaType.BOOL
            )

    async def clear_document_claims(self, project_id: str, document_id: str) -> None:
        """Delete all claims associated with a specific document ID."""
        collection_name = Config.QDRANT.CLAIM_COLLECTION_NAME

        if not await self.collection_exists(collection_name=collection_name):
            return

        await self.delete(
            collection_name=collection_name,
            points_selector=models.FilterSelector(
                filter=models.Filter(
                    must=[
                        models.FieldCondition(
                            key="document_id",
                            match=models.MatchValue(value=document_id),
                        ),
                        models.FieldCondition(
                            key="project_id",
                            match=models.MatchValue(value=project_id),
                        ),
                    ]
                )
            ),
        )

    async def get_claim_knn_ids_all_claims_batched(
        self,
        project_id: str,
        claim_payloads: list["ClaimPayload"],
        chunk_payloads_by_id: dict[str, "ChunkPayload"],
        queries_per_claim: list[dict[str, Any]],
        batch_size: int = 50,
        score_lower_threshold: float = 0.5,
        score_upper_threshold: float = 0.95,
    ) -> list[list[list[str]]]:
        """Issue KNN queries for all claims in configurable-size batches.

        For each claim, the same set of query specs (``queries_per_claim``) is applied.
        All (claim × query) combinations are flattened into a single list of
        ``QueryRequest`` objects, then sent to Qdrant in slices of ``batch_size``.

        Returns a nested list indexed as ``[claim_index][query_index]``, each entry
        being the list of matching claim IDs for that (claim, query) combination.
        """
        collection_name = self._get_collection_name(project_id, "claims")
        n_queries = len(queries_per_claim)

        # Build flat list of (claim_payload, query_spec) pairs in (claim, query) order.
        flat_requests: list[models.QueryRequest] = []
        for claim_payload in claim_payloads:
            chunk_payload = chunk_payloads_by_id.get(claim_payload.chunk_id)
            for q in queries_per_claim:
                flat_requests.append(
                    models.QueryRequest(
                        query=claim_payload.vector,
                        filter=self._build_knn_filter(
                            claim_id=claim_payload.claim_id,
                            claim_payload=claim_payload,
                            chunk_payload=chunk_payload,
                            same_doc_claims_only=q.get("same_doc_claims_only", True),
                            erlaeuterungsbericht_claims_only=q.get("erlaeuterungsbericht_claims_only", False),
                            exclude_local_claims=q.get("exclude_local_claims", False),
                            exclude_claim_ids=q.get("exclude_claim_ids"),
                        ),
                        limit=q["k_neighbors"],
                        with_payload=False,
                        with_vector=False,
                        score_threshold=score_lower_threshold,
                    )
                )

        # Send in batches, collect flat responses.
        flat_responses: list[Any] = []
        for i in range(0, len(flat_requests), batch_size):
            batch = flat_requests[i : i + batch_size]
            batch_result = await self.query_batch_points(
                collection_name=collection_name,
                requests=batch,
            )
            flat_responses.extend(batch_result)

        # Re-shape flat responses back to [claim_index][query_index].
        result: list[list[list[str]]] = []
        for claim_idx in range(len(claim_payloads)):
            claim_results: list[list[str]] = []
            for q_idx in range(n_queries):
                resp = flat_responses[claim_idx * n_queries + q_idx]
                claim_results.append(
                    [
                        str(record.id)
                        for record in resp.points
                        if record.score is not None and score_lower_threshold <= record.score <= score_upper_threshold
                    ]
                )
            result.append(claim_results)

        return result

    def _parse_payload_records(
        self,
        records: list[Any],
        model_cls: type[TPayload],
        with_vectors: bool,
        payload_name: str,
    ) -> list[TPayload]:
        parsed_payloads: list[TPayload] = []

        for record in records:
            if not record.payload:
                activity.logger.warning("%s %s has no payload; skipping", payload_name, record.id)
                continue

            payload_data = dict(record.payload)
            if model_cls is ChunkPayload and "source_file_id" in payload_data:
                # Normalize data-collection payloads to the raw DMS source document id.
                payload_data["document_id"] = payload_data["source_file_id"]
            if with_vectors:
                payload_data["vector"] = record.vector

            parsed_payloads.append(model_cls.model_validate(payload_data))

        return parsed_payloads

    async def get_chunk_payloads(
        self, project_id: str, chunk_ids: list[str], with_vectors: bool = False
    ) -> list[ChunkPayload]:
        """Retrieve chunk payloads for the provided chunk IDs."""
        if not chunk_ids:
            return []

        records = await self._get_record_payloads_by_payload_field(
            project_id=project_id,
            payload_field="chunk_id",
            field_values=chunk_ids,
            collection="chunks",
            with_vectors=with_vectors,
        )

        return self._parse_payload_records(
            records=records,
            model_cls=ChunkPayload,
            with_vectors=with_vectors,
            payload_name="Chunk",
        )

    async def get_claim_payloads(
        self, project_id: str, claim_ids: list[str], with_vectors: bool = False
    ) -> list[ClaimPayload]:
        """Retrieve claim payloads for the provided claim IDs."""
        if not claim_ids:
            return []

        records = await self._get_record_payloads(
            project_id=project_id,
            point_ids=claim_ids,
            collection="claims",
            with_vectors=with_vectors,
        )

        return self._parse_payload_records(
            records=records,
            model_cls=ClaimPayload,
            with_vectors=with_vectors,
            payload_name="Claim",
        )

    async def get_chunk_ids_by_document_id(self, project_id: str, document_id: str) -> list[str]:
        """Retrieve all chunk_id payload values for chunks associated with a specific document ID."""
        collection_name = self._get_collection_name(project_id, "chunks")
        collection_must_conditions = self.get_collection_must_conditions(project_id, "chunks")
        collection_must_conditions.append(
            models.FieldCondition(
                key="source_file_id",
                match=models.MatchValue(value=document_id),
            )
        )
        collection_filter = models.Filter(
            must=collection_must_conditions,
            must_not=[
                models.FieldCondition(
                    key="is_deleted",
                    match=models.MatchValue(value=True),
                )
            ],
        )

        seen: set[str] = set()
        chunk_ids: list[str] = []
        offset = None

        while True:
            response, offset = await self.scroll(
                collection_name=collection_name,
                scroll_filter=collection_filter,
                limit=1000,
                offset=offset,
                with_payload=["chunk_id"],
                with_vectors=False,
            )
            for record in response:
                chunk_id = record.payload and record.payload.get("chunk_id")
                if isinstance(chunk_id, str) and chunk_id not in seen:
                    seen.add(chunk_id)
                    chunk_ids.append(chunk_id)
            if offset is None:
                break

        return chunk_ids

    async def get_claim_ids(self, document_id: str, project_id: str) -> list[str]:
        """Retrieve all claim IDs for a given document."""
        collection_name = self._get_collection_name(project_id, "claims")
        collection_must_conditions = self.get_collection_must_conditions(project_id, "claims")
        collection_must_conditions.append(
            models.FieldCondition(
                key="document_id",
                match=models.MatchValue(value=document_id),
            )
        )
        collection_filter = models.Filter(must=collection_must_conditions)

        all_claim_ids = await self._get_record_ids(
            collection_name=collection_name,
            collection_filter=collection_filter,
        )

        return all_claim_ids
