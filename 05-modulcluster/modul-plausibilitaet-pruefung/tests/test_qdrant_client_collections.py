"""Qdrant client tests for collection helpers and KNN filter construction."""

import pytest
from qdrant_client import models

from src.config.config import Config
from src.qdrant.client import PlausibilityQdrantClient

from .conftest import make_chunk_payload, make_claim_payload


def _bare_client() -> PlausibilityQdrantClient:
    return object.__new__(PlausibilityQdrantClient)


class TestCollectionHelpers:
    def test_get_collection_name_claims(self) -> None:
        client = _bare_client()
        assert client._get_collection_name("p", "claims") == Config.QDRANT.CLAIM_COLLECTION_NAME

    @pytest.mark.parametrize("ctype", ["chunks", "parent_chunks", "summaries"])
    def test_get_collection_name_data_variants(self, ctype: str) -> None:
        client = _bare_client()
        assert client._get_collection_name("p", ctype) == Config.QDRANT.DATA_COLLECTION_NAME  # type: ignore[arg-type]

    def test_get_collection_name_invalid_raises(self) -> None:
        client = _bare_client()
        with pytest.raises(ValueError, match="Unknown collection type"):
            client._get_collection_name("p", "bogus")  # type: ignore[arg-type]

    def test_collection_must_conditions_claims(self) -> None:
        client = _bare_client()
        conds = client.get_collection_must_conditions("p", "claims")
        assert len(conds) == 1

    @pytest.mark.parametrize(
        "ctype, type_value",
        [("chunks", "chunk"), ("parent_chunks", "parent_chunk"), ("summaries", "summary")],
    )
    def test_collection_must_conditions_data_variants(self, ctype: str, type_value: str) -> None:
        client = _bare_client()
        conds = client.get_collection_must_conditions("p", ctype)  # type: ignore[arg-type]
        type_cond = conds[1]

        assert len(conds) == 2
        assert isinstance(type_cond, models.FieldCondition)
        assert type_cond.key == "type"
        assert isinstance(type_cond.match, models.MatchValue)
        assert type_cond.match.value == type_value

    def test_collection_must_conditions_invalid_raises(self) -> None:
        client = _bare_client()
        with pytest.raises(ValueError, match="Unknown collection type"):
            client.get_collection_must_conditions("p", "bogus")  # type: ignore[arg-type]


class TestBuildKnnFilter:
    def test_excludes_local_chunk_ids_when_requested(self) -> None:
        client = _bare_client()
        claim = make_claim_payload(claim_id="c1", chunk_id="k1")
        chunk = make_chunk_payload(chunk_id="k1", previous_chunk_id="k0", next_chunk_id="k2")

        filt = client._build_knn_filter(
            claim_id="c1",
            claim_payload=claim,
            chunk_payload=chunk,
            same_doc_claims_only=True,
            erlaeuterungsbericht_claims_only=False,
            exclude_local_claims=True,
            exclude_claim_ids=None,
        )

        assert any(isinstance(c, models.HasIdCondition) for c in (filt.must_not or []))
        assert any(
            isinstance(c, models.FieldCondition) and c.key == "chunk_id"
            for c in (filt.must_not or [])
        )

    def test_adds_erlaeuterungsbericht_must_condition(self) -> None:
        client = _bare_client()
        filt = client._build_knn_filter(
            claim_id="c1",
            claim_payload=make_claim_payload(claim_id="c1"),
            chunk_payload=None,
            same_doc_claims_only=False,
            erlaeuterungsbericht_claims_only=True,
            exclude_local_claims=False,
            exclude_claim_ids=None,
        )

        keys = [c.key for c in (filt.must or []) if isinstance(c, models.FieldCondition)]
        assert "erlauterungsbericht" in keys

    def test_appends_exclude_claim_ids(self) -> None:
        client = _bare_client()
        filt = client._build_knn_filter(
            claim_id="c1",
            claim_payload=make_claim_payload(claim_id="c1"),
            chunk_payload=None,
            same_doc_claims_only=True,
            erlaeuterungsbericht_claims_only=False,
            exclude_local_claims=False,
            exclude_claim_ids=["x", "y"],
        )

        has_id = next(c for c in (filt.must_not or []) if isinstance(c, models.HasIdCondition))
        assert set(has_id.has_id) == {"c1", "x", "y"}
