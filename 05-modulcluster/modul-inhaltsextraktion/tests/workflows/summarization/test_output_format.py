"""Tests for summarization output format."""

from src.workflows.summarization.output_format import SummaryOutput


class TestSummaryOutput:
    """Tests for SummaryOutput model."""

    def test_create_summary_output(self) -> None:
        """Test creating a SummaryOutput instance."""
        output = SummaryOutput(summary="Test summary content")
        assert output.summary == "Test summary content"

    def test_summary_output_json_schema(self) -> None:
        """Test that JSON schema extra is set correctly."""
        schema = SummaryOutput.model_json_schema()
        assert "summary" in schema["properties"]

    def test_summary_output_serialization(self) -> None:
        """Test serialization to dict."""
        output = SummaryOutput(summary="Another test summary")
        data = output.model_dump()
        assert data["summary"] == "Another test summary"
