"""Tests for VerweisWorkflow output assembly."""

from unittest.mock import AsyncMock, patch

import pytest
from temporal.workflows.rechtsmethodik.types import ExplicitVerweiseInfo

from src.workflows.tbm_workflow.tbm_types import VerweisWorkflowInput
from src.workflows.tbm_workflow.verweis.verweis_workflow import VerweisWorkflow

_PATCH_CHILD = "temporalio.workflow.execute_child_workflow"
_PATCH_GATHER = "asyncio.gather"
_PATCH_POSTPROCESS = "src.workflows.tbm_workflow.verweis.verweis_workflow.postprocess_explizite_verweise"
_PATCH_FETCH_CONTEXT = "src.workflows.tbm_workflow.verweis.verweis_workflow.fetch_context_for_verweise"


def _make_input(atomare: list[str]) -> VerweisWorkflowInput:
    return VerweisWorkflowInput(
        gesetz="BNatSchG",
        paragraph_nr="44",
        absatz_nr="1",
        satz_nr="1",
        satz_text="Wer eine Anlage betreibt, bedarf einer Genehmigung.",
        atomare_tatbestandsmerkmale=atomare,
        rechtsfolge="Genehmigung erforderlich.",
    )


def _empty_explizit() -> list[ExplicitVerweiseInfo]:
    return []


class TestVerweisWorkflow:
    @pytest.mark.parametrize("count", [1, 3])
    async def test_output_tbms_length_matches_atomare_count(self, count: int) -> None:
        """Tests if the output TBMs list length matches the number of atomare TBMs."""
        a_tbms = [f"TBM {i}" for i in range(count)]
        # vi_tbms: list[list[str]] — one list of implicit strings per TBM
        vi_tbms: list[list[str]] = [[] for _ in a_tbms]
        # vi_rf: list[str] — implicit strings for rechtsfolge
        vi_rf: list[str] = []
        ve_a_tbms_ctx = [_empty_explizit() for _ in a_tbms]
        ve_rf_ctx = _empty_explizit()

        with (
            patch(_PATCH_CHILD, new_callable=AsyncMock),
            patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather,
            patch(_PATCH_POSTPROCESS, new_callable=AsyncMock) as mock_post,
            patch(_PATCH_FETCH_CONTEXT, new_callable=AsyncMock) as mock_ctx,
        ):
            ve_explizit: list[ExplicitVerweiseInfo] = []
            mock_gather.return_value = (ve_explizit, (vi_tbms, vi_rf))
            mock_post.return_value = (
                [_empty_explizit() for _ in a_tbms],
                _empty_explizit(),
            )
            mock_ctx.return_value = (ve_a_tbms_ctx, ve_rf_ctx)

            tbms_out, _rf_out = await VerweisWorkflow().run(_make_input(a_tbms))

        assert len(tbms_out) == count

    async def test_rf_output_uses_vi_rf_implizit(self) -> None:
        """Tests if the rechtsfolge output implizit field is populated from the verweis implizit rf output."""
        empty_vi: list[str] = []
        vi_tbms = [empty_vi]
        vi_rf = ["§ 3 BNatSchG"]
        ve_a_tbms_ctx = [_empty_explizit()]
        ve_rf_ctx = _empty_explizit()

        with (
            patch(_PATCH_CHILD, new_callable=AsyncMock),
            patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather,
            patch(_PATCH_POSTPROCESS, new_callable=AsyncMock) as mock_post,
            patch(_PATCH_FETCH_CONTEXT, new_callable=AsyncMock) as mock_ctx,
        ):
            ve_explizit: list[ExplicitVerweiseInfo] = []
            mock_gather.return_value = (ve_explizit, (vi_tbms, vi_rf))
            mock_post.return_value = ([_empty_explizit()], _empty_explizit())
            mock_ctx.return_value = (ve_a_tbms_ctx, ve_rf_ctx)

            _, rf_out = await VerweisWorkflow().run(_make_input(["TBM A"]))

        assert rf_out.implizit == ["§ 3 BNatSchG"]

    async def test_tbms_use_vi_tbms_implizit(self) -> None:
        """Tests if the TBM verweis implizit field is populated from the verweis implizit tbms output."""
        vi_tbms = [["§ 7 BImSchG"]]
        vi_rf: list[str] = []
        ve_a_tbms_ctx = [_empty_explizit()]
        ve_rf_ctx = _empty_explizit()

        with (
            patch(_PATCH_CHILD, new_callable=AsyncMock),
            patch(_PATCH_GATHER, new_callable=AsyncMock) as mock_gather,
            patch(_PATCH_POSTPROCESS, new_callable=AsyncMock) as mock_post,
            patch(_PATCH_FETCH_CONTEXT, new_callable=AsyncMock) as mock_ctx,
        ):
            ve_explizit: list[ExplicitVerweiseInfo] = []
            mock_gather.return_value = (ve_explizit, (vi_tbms, vi_rf))
            mock_post.return_value = ([_empty_explizit()], _empty_explizit())
            mock_ctx.return_value = (ve_a_tbms_ctx, ve_rf_ctx)

            tbms_out, _ = await VerweisWorkflow().run(_make_input(["TBM A"]))

        assert tbms_out[0].implizit == ["§ 7 BImSchG"]
