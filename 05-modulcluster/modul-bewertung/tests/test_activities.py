"""Tests für die LLM Activity (llm-client Integration)."""

from temporal.activities.models import LlmActivityInput


class TestLlmActivityInput:
    """Tests for LlmActivityInput model."""

    def test_creation(self) -> None:
        """Test creating an LlmActivityInput with explicit values."""
        input_data = LlmActivityInput(
            prompt="Test prompt",
            system_prompt="System prompt",
            model="nvidia/llama-3.1-nemotron-ultra-253b-v1",
            temperature=0.3,
        )
        assert input_data.prompt == "Test prompt"
        assert input_data.model == "nvidia/llama-3.1-nemotron-ultra-253b-v1"
        assert input_data.temperature == 0.3

    def test_defaults(self) -> None:
        """Test default values for optional fields."""
        input_data = LlmActivityInput(
            prompt="Test",
            system_prompt="System",
            model="nvidia/llama-3.1-nemotron-ultra-253b-v1",
        )
        assert input_data.temperature == 0.3
        assert input_data.top_p == 0.95
        assert input_data.max_tokens is None
        assert input_data.response_schema is None

    def test_serialization(self) -> None:
        """Test roundtrip serialization via model_dump."""
        input_data = LlmActivityInput(
            prompt="User prompt",
            system_prompt="System prompt",
            model="nvidia/llama-3.1-nemotron-ultra-253b-v1",
            temperature=0.3,
        )
        data = input_data.model_dump()
        restored = LlmActivityInput(**data)
        assert restored == input_data
