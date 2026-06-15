"""Tests for planner prompt helpers."""

from typing import Any

from src.prompts.planner import build_planner_correction_prompt

_MICROS_TEXT = "[0001] Kernaussage 1\n[0002] Kernaussage 2\n[0003] Kernaussage 3"


def _build(**overrides: Any) -> tuple[str, str]:
    """Build a correction prompt with default test values."""
    defaults = {
        "failed_json": '{"kapitel": []}',
        "errors": ["Fehler 1"],
        "unassigned_svm_ids": ["0002"],
        "tbm": "Test TBM",
        "norm": "§ 1 TestG",
        "micros_text": _MICROS_TEXT,
    }
    defaults.update(overrides)
    return build_planner_correction_prompt(**defaults)


class TestBuildPlannerCorrectionPrompt:
    """Tests for build_planner_correction_prompt."""
    def test_returns_system_and_user_prompt(self) -> None:
        """Test that both system and user prompts are returned."""
        system, user = _build()
        assert isinstance(system, str)
        assert isinstance(user, str)
        assert len(system) > 0
        assert len(user) > 0

    def test_user_prompt_contains_failed_json(self) -> None:
        """Test that failed JSON is included in user prompt."""
        _, user = _build(failed_json='{"kapitel": [{"titel": "Test"}]}')
        assert '{"kapitel": [{"titel": "Test"}]}' in user

    def test_user_prompt_contains_errors(self) -> None:
        """Test that errors are included in user prompt."""
        _, user = _build(
            errors=["Kapitel 'Einleitung' hat keine zugeordneten SVMs.", "SVMs nicht zugeordnet: 0003"],
        )
        assert "Kapitel 'Einleitung' hat keine zugeordneten SVMs." in user
        assert "SVMs nicht zugeordnet: 0003" in user

    def test_user_prompt_contains_all_svms_as_micros_text(self) -> None:
        """Test that all SVMs appear in the micros text."""
        _, user = _build()
        assert "[0001]" in user
        assert "[0002]" in user
        assert "[0003]" in user
        assert "Kernaussage" in user

    def test_user_prompt_contains_unassigned_svm_ids(self) -> None:
        """Test that unassigned SVM-IDs are listed."""
        _, user = _build(unassigned_svm_ids=["0002", "0003"])
        assert "0002" in user
        assert "0003" in user

    def test_no_unassigned_shows_all_assigned_message(self) -> None:
        """Test message when all SVMs are assigned."""
        _, user = _build(unassigned_svm_ids=[])
        assert "Alle SVMs sind zugeordnet" in user

    def test_user_prompt_contains_tbm_and_norm(self) -> None:
        """Test that TBM and norm appear in user prompt."""
        _, user = _build(tbm="Naturschutzrechtliche Belange", norm="§ 34 BNatSchG")
        assert "Naturschutzrechtliche Belange" in user
        assert "§ 34 BNatSchG" in user

    def test_system_prompt_contains_anti_hallucination_instruction(self) -> None:
        """Test anti-hallucination instruction is present."""
        system, _ = _build()
        assert "AUSSCHLIESSLICH" in system or "Erfinde KEINE" in system

    def test_system_prompt_contains_legal_correctness_rule(self) -> None:
        """Test legal correctness rule is present."""
        system, _ = _build()
        assert "inhaltlich nicht" in system or "Rechtliche Korrektheit" in system

    def test_system_prompt_describes_removal_as_fallback(self) -> None:
        """Test removal fallback instruction is present."""
        system, _ = _build()
        assert "Entferne das Kapitel" in system or "Überarbeite" in system
