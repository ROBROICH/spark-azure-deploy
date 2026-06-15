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
        assert consensus_vote([]) == []

    def test_single_run_above_threshold_passes(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """With threshold=1, a single vote suffices."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 1)
        results = [Stage1Response(node_list=[1, 2, 3])]
        selected = consensus_vote(results)
        assert selected == ["1", "2", "3"]

    def test_single_run_above_threshold_fails(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """With threshold=2, a single vote is not enough."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 2)
        results = [Stage1Response(node_list=[1, 2, 3])]
        selected = consensus_vote(results)
        assert selected == []

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
        selected = consensus_vote(results)
        assert selected == ["10", "20", "30"]

    def test_output_is_sorted(self, monkeypatch: pytest.MonkeyPatch) -> None:
        """Selected nodes are returned sorted numerically (as strings), not lexicographically."""
        monkeypatch.setattr(CONFIG.PAGEINDEX_SVM, "CONSENSUS_THRESHOLD", 1)
        results = [Stage1Response(node_list=[2, 10, 1])]
        selected = consensus_vote(results)
        # Lexicographic sort — "10" sorts before "2". If numeric sort is ever added, update this.
        assert selected == ["1", "10", "2"]
