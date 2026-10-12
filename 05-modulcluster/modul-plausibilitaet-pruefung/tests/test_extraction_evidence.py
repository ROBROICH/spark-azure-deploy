"""Unit tests for extraction-time evidence: glyph-shift detection, extraction-time evidence, superseded handling."""

from unittest.mock import AsyncMock, patch

import pytest

from src.activities import prefilter
from src.activities.extraction_evidence import annotate_chunks
from src.activities.mojibake import is_mojibake
from src.activities.risk_screener import build_screening_bundles_for_document
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import DocumentBundleRequest, ScreeningHit

from .conftest import make_chunk_payload, make_chunk_with_context, make_claim_payload


class TestMojibake:
    def test_shifted_text_is_detected_by_share(self) -> None:
        raw = "$XIUHFKWHUKDOWXQJ GHU )XQNWLRQ GHV :LOGVFKXW]]DXQHV ZlKUHQG GHU %DXSKDVH   28.03.18   CEF"
        assert is_mojibake(raw)
        assert is_mojibake("0D\x89QDKPH I\x81U GLH 6WUD\x89H XQG )OlFKH *HK|O]")

    def test_clean_text_and_abbreviations_are_not_mojibake(self) -> None:
        assert not is_mojibake("Die Maßnahme A 4.3 umfasst einen Gehölzsaum von ca. 580 m².")
        # short capital abbreviations look shiftable but are outnumbered by real words
        assert not is_mojibake("DN 300 PE-HD Rohr, RQ 31 im Regelfall, OK UK NN der Fahrbahn")
        # a single shifted-looking token is not enough
        assert not is_mojibake("Bauwerk BW 3-03 GHV")

    def test_mixed_chunk_is_judged_as_a_whole(self) -> None:
        """One shifted legend line inside a normal chunk does not turn the chunk into Zeichensalat."""
        chunk = "\n".join(
            [
                "GHU %HUHLFK GHV 0DQDKPH",
                "Der Regelquerschnitt RQ 31 wird auf der freien Strecke angewendet.",
                "Die Entwässerung erfolgt über Mulden und Rohrleitungen DN 300 in die Vorfluter.",
                "Die Lärmschutzwand wird hochabsorbierend ausgeführt.",
            ]
        )
        assert not is_mojibake(chunk)


class TestAnnotateChunks:
    def test_page_identifiers_and_object_ids_land_on_every_chunk(self) -> None:
        chunks = [
            make_chunk_payload(
                chunk_id="head",
                document_id="d",
                page_numbers=[7],
                chunk_content="Maßnahmen-Nr. 11.4 ACEF Gehölzpflanzung",
            ),
            make_chunk_payload(
                chunk_id="body", document_id="d", page_numbers=[7], chunk_content="Dornensträucher 15 % an der B 101"
            ),
            make_chunk_payload(chunk_id="other", document_id="d", page_numbers=[9], chunk_content="Text ohne Kennung"),
        ]
        out = annotate_chunks(chunks)
        by = {c.chunk_id: c for c in out}
        assert by["body"].instance_identifiers == {"MASSNAHME": ["11.4 ACEF"]}
        assert "B 101" in by["body"].object_ids
        assert by["other"].instance_identifiers == {}


class TestPrefilterPrefersStoredIdentifiers:
    def test_stored_identifiers_decide_without_page_fetch(self) -> None:
        a = make_chunk_with_context(document_id="d", page_numbers=[1])
        b = make_chunk_with_context(document_id="d", page_numbers=[2])
        ids_a = {"MASSNAHME": ["6.2A ACEF"]}
        ids_b = {"MASSNAHME": ["11.4 ACEF"]}
        assert prefilter.instance_conflict(a, b, {}, ids_a, ids_b) == "MASSNAHME"
        assert prefilter.instance_conflict(a, b, {}, ids_a, None) is None  # legacy side -> needs pages
        hit = ScreeningHit(
            claim_id="k1",
            reference_id="k2",
            claim_chunk_id="ca",
            reference_chunk_id="cb",
            rating=80,
            note="n",
            reasoning="r",
        )
        ctx = {"ca": a, "cb": b}
        assert prefilter.page_keys_for_hits([hit], {"k1": "ca", "k2": "cb"}, ctx, {"k1": ids_a, "k2": ids_b}) == []
        assert len(prefilter.page_keys_for_hits([hit], {"k1": "ca", "k2": "cb"}, ctx, {"k1": ids_a})) == 2  # noqa: PLR2004


class TestSupersededClaims:
    @pytest.mark.asyncio
    async def test_superseded_claims_are_not_screened_as_check_claims(self) -> None:
        current = make_claim_payload(claim_id="c1", chunk_id="ch1", vector=[0.1] * 4)
        old = make_claim_payload(claim_id="c2", chunk_id="ch2", vector=[0.1] * 4).model_copy(
            update={"superseded": True}
        )
        with patch("src.activities.risk_screener.qdrant_client") as mock:
            mock.get_claim_payloads = AsyncMock(return_value=[current, old])
            mock.get_chunk_payloads = AsyncMock(return_value=[])
            mock.get_claim_knn_batched = AsyncMock(return_value=[[(["r1"], []), ([], []), ([], [])]])
            mock.list_document_titles = AsyncMock(return_value={})
            result = await build_screening_bundles_for_document(
                DocumentBundleRequest(project_id="p", document_id="d", claim_ids=["c1", "c2"])
            )
        assert [b.claim_id for b in result.bundles] == ["c1"]
