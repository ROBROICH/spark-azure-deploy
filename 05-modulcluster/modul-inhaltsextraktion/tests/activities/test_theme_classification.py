"""Unit tests for the theme_classification_task activity and helpers."""

import pytest
from uuid import uuid4
from unittest.mock import patch, AsyncMock

from src.schemas import DocumentTopic
from src.activities.theme_classification import (
    _sanitize_theme_selection,
    _theme_classification_task,
    ThemeClassificationTaskInput,
    ThemeClassificationTaskOutput,
)
from src.workflows.theme_classification.output_format import (
    ThemeClassificationOutput,
    _NAME_NO_THEME,
)

def test_sanitize_theme_selection_exact_match():
    """When the LLM output exactly matches an existing topic, it should be selected."""
    themes = [
        DocumentTopic(id=uuid4(), name="Topic A"),
        DocumentTopic(id=uuid4(), name="Topic B"),
    ]
    result = ThemeClassificationOutput(name="Topic A", reasoning="Because A matches.")
    
    out = _sanitize_theme_selection(result, themes)
    
    assert out.topic == themes[0]
    assert out.reasoning == "Because A matches."

def test_sanitize_theme_selection_no_match_fallback():
    """When the LLM output does not match, but a 'no theme' fallback exists, it should use the fallback."""
    themes = [
        DocumentTopic(id=uuid4(), name="Topic A"),
        DocumentTopic(id=uuid4(), name=_NAME_NO_THEME),
    ]
    result = ThemeClassificationOutput(name="Missing Topic", reasoning="Because it does not match A.")
    
    out = _sanitize_theme_selection(result, themes)
    
    assert out.topic == themes[1]
    assert "not found" in out.reasoning

def test_sanitize_theme_selection_no_match_no_fallback():
    """When the LLM output does not match and there's no fallback, it should return None topic."""
    themes = [
        DocumentTopic(id=uuid4(), name="Topic A"),
    ]
    result = ThemeClassificationOutput(name="Missing Topic", reasoning="Because it does not match A.")
    
    out = _sanitize_theme_selection(result, themes)
    
    assert out.topic is None
    assert "ERROR" in out.reasoning

async def test_theme_classification_task_empty_themes():
    """Test early return when no themes are provided."""
    inp = ThemeClassificationTaskInput(theme_info=[], summary="Test summary")
    out = await _theme_classification_task(inp)
    assert out.topic is None
    assert "Empty topic list" in out.reasoning

async def test_theme_classification_task_null_summary():
    """Test early return when summary is empty."""
    themes = [DocumentTopic(id=uuid4(), name="Topic A")]
    inp = ThemeClassificationTaskInput(theme_info=themes, summary="")
    out = await _theme_classification_task(inp)
    assert out.topic is None
    assert "Empty or Null summary" in out.reasoning

@patch("src.activities.theme_classification.llm_invoke_structured", new_callable=AsyncMock)
async def test_theme_classification_task_valid(mock_llm):
    """Test standard flow with mock LLM response."""
    themes = [DocumentTopic(id=uuid4(), name="Topic A")]
    mock_llm.return_value = ThemeClassificationOutput(name="Topic A", reasoning="Matches.")
    
    inp = ThemeClassificationTaskInput(theme_info=themes, summary="This is a summary.")
    out = await _theme_classification_task(inp)
    
    mock_llm.assert_called_once()
    assert out.topic == themes[0]
    assert out.reasoning == "Matches."
