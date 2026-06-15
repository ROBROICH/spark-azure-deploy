"""Tests for the RedactionWorkflow Temporal workflow."""

from unittest.mock import AsyncMock, patch

from src.models.schemas import (
    ApplyRedactionsResult,
    DetectPiiPresidioResult,
    ExtractTextsInput,
    ExtractTextsResult,
    PagePiiData,
    PageTextData,
)
from src.utils.pii_extraction import PiiItem, PiiResponseSchema
from src.workflows.redaction_workflow import RedactionWorkflow

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_PDF_BYTES = b"%PDF-fake-content"
_REDACTED_PDF = b"%PDF-redacted"


def _input() -> bytes:
    return _PDF_BYTES


def _pages(*texts: list[str]) -> list[PageTextData]:
    return [PageTextData(page_number=i, page_lines=lines) for i, lines in enumerate(texts)]


def _extract_result(pages: list[PageTextData] | None = None) -> ExtractTextsResult:
    if pages is None:
        pages = _pages(["Hello Max Mustermann"], ["Straße 123"])
    return ExtractTextsResult(pages=pages, ocr_pdf_data=_PDF_BYTES)


def _presidio_result(page_pii: dict[int, list[str]]) -> DetectPiiPresidioResult:
    return DetectPiiPresidioResult(
        page_pii=[PagePiiData(page_number=pn, pii_terms=terms) for pn, terms in page_pii.items()]
    )


def _redaction_result(pages: int = 2, matches: int = 3) -> ApplyRedactionsResult:
    return ApplyRedactionsResult(
        redacted_pdf=_REDACTED_PDF,
        pages_processed=pages,
        matches_found=matches,
        error_pages=[],
    )


def _pii_schema(terms: list[str]) -> PiiResponseSchema:
    return PiiResponseSchema(items=[PiiItem(text=t) for t in terms])


# ---------------------------------------------------------------------------
# Patches context manager
# ---------------------------------------------------------------------------


def _workflow_patches(
    *,
    extract_return=None,
    presidio_return=None,
    redaction_return=None,
    llm_enabled=False,
    llm_return=None,
):
    """Build a combined patch context for common workflow dependencies."""
    if extract_return is None:
        extract_return = _extract_result()
    if presidio_return is None:
        presidio_return = _presidio_result({0: ["Max Mustermann"], 1: []})
    if redaction_return is None:
        redaction_return = _redaction_result()

    mock_execute_activity = AsyncMock(side_effect=[extract_return, presidio_return, redaction_return])
    mock_llm = AsyncMock(return_value=llm_return) if llm_return else AsyncMock()

    patches = (
        patch("temporalio.workflow.execute_activity", mock_execute_activity),
        patch("src.workflows.redaction_workflow.ENV.LLM_ENABLED", llm_enabled),
        patch("src.workflows.redaction_workflow.llm_invoke_structured", mock_llm),
        patch("src.workflows.redaction_workflow.workflow.logger"),
    )
    return patches, mock_execute_activity, mock_llm


# ---------------------------------------------------------------------------
# Tests: RedactionWorkflow.run() — full pipeline
# ---------------------------------------------------------------------------


class TestRedactionWorkflowRun:
    """Tests for the main workflow run method."""

    async def test_full_pipeline_llm_disabled(self):
        """LLM disabled: extract → presidio → redact."""
        patches, mock_act, _ = _workflow_patches(llm_enabled=False)
        wf = RedactionWorkflow()

        with patches[0], patches[1], patches[2], patches[3]:
            result = await wf.run(_input())

        assert result == _REDACTED_PDF
        extract_arg = mock_act.await_args_list[0].args[1]
        assert extract_arg == ExtractTextsInput(pdf_data=_PDF_BYTES)

    async def test_full_pipeline_with_llm(self):
        """LLM enabled: extract → (presidio+filter || llm) → redact."""
        llm_result = _pii_schema(["Max Mustermann"])
        # With LLM enabled, execute_activity is called for: extract, presidio, redact
        # Plus llm_invoke_structured is called for filter + per-page detection
        extract = _extract_result()
        presidio = _presidio_result({0: ["Max Mustermann", "FalsePositive"], 1: []})
        redaction = _redaction_result()

        mock_execute_activity = AsyncMock(side_effect=[extract, presidio, redaction])
        # llm_invoke_structured called for: filter call + per-page call(s)
        mock_llm = AsyncMock(return_value=llm_result)

        wf = RedactionWorkflow()
        with (
            patch("temporalio.workflow.execute_activity", mock_execute_activity),
            patch("src.workflows.redaction_workflow.ENV.LLM_ENABLED", True),
            patch("src.workflows.redaction_workflow.llm_invoke_structured", mock_llm),
            patch("src.workflows.redaction_workflow.workflow.logger"),
        ):
            result = await wf.run(_input())

        assert result == _REDACTED_PDF
        assert mock_llm.await_count >= 1

    async def test_returns_redacted_pdf_bytes(self):
        """Workflow result is only the redacted PDF bytes."""
        redaction = ApplyRedactionsResult(
            redacted_pdf=_REDACTED_PDF,
            pages_processed=2,
            matches_found=1,
            error_pages=[1],
        )
        patches, _, _ = _workflow_patches(redaction_return=redaction)
        wf = RedactionWorkflow()

        with patches[0], patches[1], patches[2], patches[3]:
            result = await wf.run(_input())

        assert result == _REDACTED_PDF


# ---------------------------------------------------------------------------
# Tests: _detect_pii_combined (LLM disabled path)
# ---------------------------------------------------------------------------


class TestDetectPiiCombinedNoLlm:
    """Tests for _detect_pii_combined when LLM is disabled."""

    async def test_presidio_only(self):
        """Without LLM, only Presidio results are returned."""
        pages = _pages(["Max Mustermann wohnt hier"], ["Keine PII"])
        presidio = _presidio_result({0: ["Max Mustermann"], 1: []})

        mock_act = AsyncMock(return_value=presidio)
        wf = RedactionWorkflow()

        with (
            patch("temporalio.workflow.execute_activity", mock_act),
            patch("src.workflows.redaction_workflow.ENV.LLM_ENABLED", False),
        ):
            result = await wf._detect_pii_combined(pages, _llm_cfg())

        assert 0 in result
        assert "Max Mustermann" in result[0]
        assert result[1] == set()


# ---------------------------------------------------------------------------
# Tests: _detect_pii_combined (LLM enabled path)
# ---------------------------------------------------------------------------


class TestDetectPiiCombinedWithLlm:
    """Tests for _detect_pii_combined when LLM is enabled."""

    async def test_presidio_and_llm_merged(self):
        """Both Presidio (filtered) and LLM results are merged."""
        pages = _pages(["Max Mustermann hier"], ["Erika Beispiel dort"])
        presidio = _presidio_result({0: ["Max Mustermann"], 1: ["Erika Beispiel"]})
        llm_result = _pii_schema(["Max Mustermann", "Erika Beispiel"])

        mock_act = AsyncMock(return_value=presidio)
        mock_llm = AsyncMock(return_value=llm_result)
        wf = RedactionWorkflow()

        with (
            patch("temporalio.workflow.execute_activity", mock_act),
            patch("src.workflows.redaction_workflow.ENV.LLM_ENABLED", True),
            patch("src.workflows.redaction_workflow.llm_invoke_structured", mock_llm),
            patch("src.workflows.redaction_workflow.workflow.logger"),
        ):
            result = await wf._detect_pii_combined(pages, _llm_cfg())

        # Both sources should be merged
        assert "Max Mustermann" in result[0]
        assert "Erika Beispiel" in result[0] or "Erika Beispiel" in result[1]


# ---------------------------------------------------------------------------
# Tests: _filter_presidio_with_llm
# ---------------------------------------------------------------------------


class TestFilterPresidioWithLlm:
    """Tests for the Presidio → LLM filter step."""

    async def test_filters_to_accepted_terms(self):
        """LLM filter accepts a subset of Presidio candidates."""
        presidio = _presidio_result({0: ["Max Mustermann", "Berlin GmbH"], 1: ["Max Mustermann"]})
        llm_result = _pii_schema(["Max Mustermann"])

        wf = RedactionWorkflow()
        with (
            patch("src.workflows.redaction_workflow.llm_invoke_structured", AsyncMock(return_value=llm_result)),
            patch("src.workflows.redaction_workflow.workflow.logger"),
        ):
            result = await wf._filter_presidio_with_llm(presidio, _llm_cfg())

        # Only accepted term broadcast to all pages
        assert result[0] == ["Max Mustermann"]
        assert result[1] == ["Max Mustermann"]

    async def test_empty_candidates_returns_unchanged(self):
        """No Presidio candidates → returns empty lists without calling LLM."""
        presidio = _presidio_result({0: [], 1: []})
        mock_llm = AsyncMock()
        wf = RedactionWorkflow()

        with patch("src.workflows.redaction_workflow.llm_invoke_structured", mock_llm):
            result = await wf._filter_presidio_with_llm(presidio, _llm_cfg())

        assert result == {0: [], 1: []}
        mock_llm.assert_not_awaited()

    async def test_llm_failure_returns_unfiltered(self):
        """On LLM error, falls back to unfiltered Presidio results."""
        presidio = _presidio_result({0: ["Max Mustermann"], 1: ["Erika"]})
        mock_llm = AsyncMock(side_effect=RuntimeError("LLM down"))
        wf = RedactionWorkflow()

        with (
            patch("src.workflows.redaction_workflow.llm_invoke_structured", mock_llm),
            patch("src.workflows.redaction_workflow.workflow.logger"),
        ):
            result = await wf._filter_presidio_with_llm(presidio, _llm_cfg())

        # Unfiltered fallback
        assert result[0] == ["Max Mustermann"]
        assert result[1] == ["Erika"]


# ---------------------------------------------------------------------------
# Tests: _detect_pii_llm
# ---------------------------------------------------------------------------


class TestDetectPiiLlm:
    """Tests for the per-page LLM PII detection path."""

    async def test_successful_detection(self):
        """LLM returns PII terms, broadcast to all pages."""
        pages = _pages(["Max Mustermann hier"], ["Erika dort"])
        llm_result = _pii_schema(["Max Mustermann", "Erika"])
        mock_llm = AsyncMock(return_value=llm_result)

        wf = RedactionWorkflow()
        with (
            patch("src.workflows.redaction_workflow.llm_invoke_structured", mock_llm),
            patch("src.workflows.redaction_workflow.workflow.logger"),
        ):
            result = await wf._detect_pii_llm(pages, _llm_cfg())

        # Terms broadcast to all pages
        assert "Max Mustermann" in result[0]
        assert "Erika" in result[0]
        assert "Max Mustermann" in result[1]
        assert "Erika" in result[1]

    async def test_llm_failure_adds_error_token(self):
        """LLM exception → error token added to affected pages only."""
        pages = _pages(["some text"])
        mock_llm = AsyncMock(side_effect=RuntimeError("LLM timeout"))

        wf = RedactionWorkflow()
        with (
            patch("src.workflows.redaction_workflow.llm_invoke_structured", mock_llm),
            patch("src.workflows.redaction_workflow.workflow.logger"),
        ):
            result = await wf._detect_pii_llm(pages, _llm_cfg())

        from src.config import config as cfg

        assert cfg.ERROR_TOKEN in result[0]

    async def test_empty_pages(self):
        """No pages → returns empty dict."""
        wf = RedactionWorkflow()
        mock_llm = AsyncMock()
        with patch("src.workflows.redaction_workflow.llm_invoke_structured", mock_llm):
            result = await wf._detect_pii_llm([], _llm_cfg())

        assert result == {}
        mock_llm.assert_not_awaited()


# ---------------------------------------------------------------------------
# Helper: LLM config stub
# ---------------------------------------------------------------------------


def _llm_cfg():
    from src.env import LLMConfig

    return LLMConfig(MODEL="mistral-small-2506", TEMPERATURE=0.0, TOP_P=1.0, MAX_PROMPT_SIZE=300000)
