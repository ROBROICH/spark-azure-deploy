"""
Tests for src/pageindex_svm/consensus.py — consensus_vote pure function.
"""

import pytest

from src.config import CONFIG
from src.pageindex_svm.consensus import consensus_vote
from src.pageindex_svm.prompts import Stage1Response

_THRESHOLD_ATTR = "src.pageindex_svm.consensus.CONFIG.PAGEINDEX_SVM.CONSENSUS_THRESHOLD"


class TestConsensusVote:
    """Tests for consensus_vote filtering node selections by vote threshold."""

    def test_empty_results(self) -> None:
        """No Stage1 results produces empty selection."""
        assert consensus_vote([]) == {}

    def test_single_run_above_threshold_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """With threshold=1, a single vote suffices."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 1)
        results = [Stage1Response(node_list=[1, 2, 3])]
        assert list(consensus_vote(results)) == ["1", "2", "3"]

    def test_single_run_above_threshold_fails(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """With threshold=2, a single vote is not enough."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 2)
        results = [Stage1Response(node_list=[1, 2, 3])]
        assert consensus_vote(results) == {}

    def test_multiple_runs_consensus(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Nodes voted by enough runs pass the threshold; others are excluded."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 2)
        # node 5 appears in 2 runs (meets threshold), node 99 appears in 1 run (does not)
        results = [
            Stage1Response(node_list=[5]),
            Stage1Response(node_list=[5]),
            Stage1Response(node_list=[99]),
        ]
        selected = consensus_vote(results)
        assert "5" in selected
        assert "99" not in selected

    def test_all_nodes_meet_threshold(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """When all runs agree, all nodes are selected."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 2)
        results = [Stage1Response(node_list=[10, 20, 30]) for _ in range(2)]
        assert list(consensus_vote(results)) == ["10", "20", "30"]

    def test_output_is_sorted(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Selected nodes are returned sorted numerically (as strings), not lexicographically."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 1)
        results = [Stage1Response(node_list=[2, 10, 1])]
        selected = list(consensus_vote(results))
        # Lexicographic sort — "10" sorts before "2". If numeric sort is ever added, update this.
        assert selected == ["1", "10", "2"]


class TestConsensusRatio:
    """Tests for the vote ratio that consensus_vote returns next to the selection."""

    def test_ratio_uses_the_configured_run_count(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A node voted by two of three runs has a ratio of two thirds."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 2)
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_RUNS", 3)
        results = [
            Stage1Response(node_list=[5, 7]),
            Stage1Response(node_list=[5, 7]),
            Stage1Response(node_list=[7]),
        ]
        ratios = consensus_vote(results)
        assert ratios["5"] == pytest.approx(2 / 3)
        assert ratios["7"] == pytest.approx(1.0)

    def test_only_selected_nodes_carry_a_ratio(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A node below the threshold appears in neither the keys nor the values."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 2)
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_RUNS", 3)
        results = [
            Stage1Response(node_list=[5]),
            Stage1Response(node_list=[5]),
            Stage1Response(node_list=[99]),
        ]
        ratios = consensus_vote(results)
        assert "5" in ratios
        assert "99" not in ratios

    def test_ratio_stays_within_range(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Every returned ratio lies between 0 and 1 inclusive."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 1)
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_RUNS", 3)
        results = [Stage1Response(node_list=[1, 2]) for _ in range(3)]
        ratios = consensus_vote(results)
        assert all(0.0 <= value <= 1.0 for value in ratios.values())

    def test_a_repeated_node_counts_once_per_run(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """A run that names the same node twice still casts a single vote."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 2)
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_RUNS", 3)
        results = [Stage1Response(node_list=[5, 5]) for _ in range(3)]
        ratios = consensus_vote(results)
        assert ratios["5"] == pytest.approx(1.0)

    def test_a_single_run_cannot_reach_the_threshold_by_repeating(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Repeating a node in one run does not satisfy a threshold of two runs."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 2)
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_RUNS", 3)
        results = [
            Stage1Response(node_list=[5, 5, 5]),
            Stage1Response(node_list=[7]),
            Stage1Response(node_list=[7]),
        ]
        ratios = consensus_vote(results)
        assert "5" not in ratios
        assert ratios["7"] == pytest.approx(2 / 3)

    def test_a_missing_run_lowers_the_ratio(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Fewer results than configured runs keep the configured denominator.

        The surviving runs must not count for more just because one is absent.
        """
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 2)
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_RUNS", 3)
        results = [Stage1Response(node_list=[5]) for _ in range(2)]
        ratios = consensus_vote(results)
        assert ratios["5"] == pytest.approx(2 / 3)

    def test_more_results_than_configured_cannot_exceed_one(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """A caller passing more results than configured still yields a valid ratio."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 2)
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_RUNS", 3)
        results = [Stage1Response(node_list=[5]) for _ in range(5)]
        ratios = consensus_vote(results)
        assert ratios["5"] == pytest.approx(1.0)
