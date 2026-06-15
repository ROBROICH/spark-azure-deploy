"""Tests for plan sanitisation helpers."""

from typing import Any

from src.utils.plan_validation import sanitise_plan


class TestSanitisePlan:
    """Tests for sanitise_plan()."""

    def _make_plan(self, kapitel: list[dict[str, Any]]) -> dict[str, Any]:
        """Create a raw plan dict for testing."""
        return {"kapitel": kapitel}

    def test_valid_plan_no_unassigned(self) -> None:
        """Test a fully valid plan has no unassigned SVMs."""
        plan = self._make_plan([
            {"titel": "Einleitung", "svm_ids": ["0001", "0002"], "ziel": "...", "unterkapitel": []},
            {"titel": "Prüfung", "svm_ids": ["0003", "0004"], "ziel": "...", "unterkapitel": []},
            {"titel": "Ergebnis", "svm_ids": ["0005"], "ziel": "...", "unterkapitel": []},
        ])
        result = sanitise_plan(plan, {"0001", "0002", "0003", "0004", "0005"})

        assert result.unassigned_svm_ids == []

    def test_svm_assigned_to_multiple_chapters(self) -> None:
        """Test that shared SVM assignment works."""
        plan = self._make_plan([
            {"titel": "Einleitung", "svm_ids": ["0001"], "ziel": "..."},
            {"titel": "Prüfung", "svm_ids": ["0001", "0002"], "ziel": "..."},
            {"titel": "Ergebnis", "svm_ids": ["0002"], "ziel": "..."},
        ])
        result = sanitise_plan(plan, {"0001", "0002"})

        assert result.unassigned_svm_ids == []

    def test_unassigned_svms_tracked(self) -> None:
        """Test that unassigned SVMs are tracked."""
        plan = self._make_plan([
            {"titel": "Einleitung", "svm_ids": ["0001"], "ziel": "..."},
            {"titel": "Ergebnis", "svm_ids": ["0002"], "ziel": "..."},
        ])
        result = sanitise_plan(plan, {"0001", "0002", "0003", "0007"})

        assert "0003" in result.unassigned_svm_ids
        assert "0007" in result.unassigned_svm_ids

    def test_hallucinated_ids_removed(self) -> None:
        """Test that hallucinated IDs are stripped."""
        plan = self._make_plan([
            {"titel": "Einleitung", "svm_ids": ["0001", "9999"], "ziel": "..."},
            {"titel": "Ergebnis", "svm_ids": ["0002", "FAKE"], "ziel": "..."},
        ])
        result = sanitise_plan(plan, {"0001", "0002"})

        assert result.plan_data["kapitel"][0]["svm_ids"] == ["0001"]
        assert result.plan_data["kapitel"][1]["svm_ids"] == ["0002"]

    def test_hallucinated_ids_removal_can_leave_empty_chapter(self) -> None:
        """Test hallucinated ID removal can leave empty svm_ids list."""
        plan = self._make_plan([
            {"titel": "Einleitung", "svm_ids": ["9999"], "ziel": "..."},
            {"titel": "Ergebnis", "svm_ids": ["0001"], "ziel": "..."},
        ])
        result = sanitise_plan(plan, {"0001"})

        assert result.plan_data["kapitel"][0]["svm_ids"] == []

    def test_empty_kapitel_list(self) -> None:
        """Test that empty chapter list tracks all SVMs as unassigned."""
        plan = self._make_plan([])
        result = sanitise_plan(plan, {"0001", "0002"})

        assert sorted(result.unassigned_svm_ids) == ["0001", "0002"]

    def test_all_svms_hallucinated(self) -> None:
        """Test that all hallucinated IDs are stripped, tracking all as unassigned."""
        plan = self._make_plan([
            {"titel": "Einleitung", "svm_ids": ["FAKE1"], "ziel": "..."},
            {"titel": "Ergebnis", "svm_ids": ["FAKE2"], "ziel": "..."},
        ])
        result = sanitise_plan(plan, {"0001", "0002"})

        assert result.plan_data["kapitel"][0]["svm_ids"] == []
        assert result.plan_data["kapitel"][1]["svm_ids"] == []
        assert sorted(result.unassigned_svm_ids) == ["0001", "0002"]

    def test_plan_data_is_mutated_in_place(self) -> None:
        """sanitise_plan modifies the dict in-place (removes hallucinated IDs)."""
        plan = self._make_plan([
            {"titel": "Kap", "svm_ids": ["0001", "FAKE"], "ziel": "..."},
        ])
        original_kapitel = plan["kapitel"][0]
        sanitise_plan(plan, {"0001"})

        assert original_kapitel["svm_ids"] == ["0001"]
