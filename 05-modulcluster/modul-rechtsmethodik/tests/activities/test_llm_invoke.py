"""Tests for _get_system_prompt in llm_invoke."""

import pytest

from src.activities.llm_invoke import SUPPORTED_THINKING_MODELS, _get_system_prompt

_ULTRA = "nvidia/llama-3.1-nemotron-ultra-253b-v1"
_SUPER = "nvidia/llama-3.3-nemotron-super-49b-v1.5"
_UNKNOWN = "some/other-model"


class TestGetSystemPrompt:
    def test_ultra_thinking_on(self) -> None:
        """Tests if the ultra model with thinking=True returns 'detailed thinking on'."""
        assert _get_system_prompt(True, _ULTRA) == "detailed thinking on"

    def test_ultra_thinking_off(self) -> None:
        """Tests if the ultra model with thinking=False returns 'detailed thinking off'."""
        assert _get_system_prompt(False, _ULTRA) == "detailed thinking off"

    def test_super_thinking_on(self) -> None:
        """Tests if the super model with thinking=True returns '/think'."""
        assert _get_system_prompt(True, _SUPER) == "/think"

    def test_super_thinking_off(self) -> None:
        """Tests if the super model with thinking=False returns '/no_think'."""
        assert _get_system_prompt(False, _SUPER) == "/no_think"

    def test_unknown_model_thinking_false_returns_empty(self) -> None:
        """Tests if an unknown model with thinking=False returns an empty string."""
        assert _get_system_prompt(False, _UNKNOWN) == ""

    def test_unknown_model_thinking_none_returns_empty(self) -> None:
        """Tests if an unknown model with thinking=None returns an empty string."""
        assert _get_system_prompt(None, _UNKNOWN) == ""

    def test_unsupported_model_thinking_true_raises(self) -> None:
        """Tests if an unsupported model with thinking=True raises a ValueError."""
        with pytest.raises(ValueError, match="Thinking mode is not implemented"):
            _get_system_prompt(True, _UNKNOWN)

    def test_supported_models_set_is_complete(self) -> None:
        """Tests if both the ultra and super models are present in SUPPORTED_THINKING_MODELS."""
        assert _ULTRA in SUPPORTED_THINKING_MODELS
        assert _SUPER in SUPPORTED_THINKING_MODELS

    @pytest.mark.parametrize("thinking", [None, False])
    def test_thinking_falsy_treated_as_false_for_unknown(self, thinking: bool | None) -> None:
        """Tests if falsy thinking values (None or False) for an unknown model return an empty string."""
        assert _get_system_prompt(thinking, _UNKNOWN) == ""
