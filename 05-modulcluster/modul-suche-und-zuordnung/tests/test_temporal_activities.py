"""
Tests for Temporal activity input models.
"""

from src.Activities.processing_activities import (
    FetchRuleBasedInput,
    RetrieveChunksInput,
    RetrieveQuestionsInput,
    RetrieveSummariesInput,
)

EXPECTED_QUERY_COUNT = 2
EXPECTED_EMBEDDING_COUNT = 2
EXPECTED_THRESHOLD = 0.5
DEFAULT_CHUNKS_THRESHOLD = 0.4
EXPECTED_TBM_LIST_COUNT = 1


class TestRetrievalActivityInputModels:
    """Tests for the granular retrieval activity input models."""

    def test_retrieve_chunks_input(self) -> None:
        input_data = RetrieveChunksInput(
            queries=["query1", "query2"],
            embeddings=[[0.1, 0.2], [0.3, 0.4]],
            project_id="test-project",
            threshold=0.5,
        )
        assert input_data.project_id == "test-project"
        assert len(input_data.queries) == EXPECTED_QUERY_COUNT
        assert len(input_data.embeddings) == EXPECTED_EMBEDDING_COUNT
        assert input_data.threshold == EXPECTED_THRESHOLD

    def test_retrieve_chunks_default_threshold(self) -> None:
        input_data = RetrieveChunksInput(
            queries=["q"],
            embeddings=[[0.1, 0.2]],
            project_id="p",
        )
        assert input_data.threshold == DEFAULT_CHUNKS_THRESHOLD

    def test_retrieve_summaries_input(self) -> None:
        input_data = RetrieveSummariesInput(
            queries=["query"],
            embeddings=[[0.1, 0.2]],
            project_id="test-project",
        )
        assert input_data.project_id == "test-project"

    def test_retrieve_questions_input(self) -> None:
        input_data = RetrieveQuestionsInput(
            queries=["query"],
            embeddings=[[0.1, 0.2]],
            project_id="test-project",
        )
        assert input_data.project_id == "test-project"

    def test_fetch_rule_based_input(self) -> None:
        input_data = FetchRuleBasedInput(
            project_id="test-project",
            tbm_list=[{"prueffrage": "test"}],
        )
        assert input_data.project_id == "test-project"
        assert len(input_data.tbm_list) == EXPECTED_TBM_LIST_COUNT
