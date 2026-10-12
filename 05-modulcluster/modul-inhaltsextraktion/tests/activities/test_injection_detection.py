import pytest
from pydantic import ValidationError

from src.activities.injection_detection import InjectionDetector
from src.env import ENV, Settings


def test_rejects_disabling_both_injection_scanners() -> None:
    with pytest.raises(ValidationError, match="at least one prompt injection scanner must be enabled"):
        Settings(INJECTION_LLM_SCAN_ENABLED=False, INJECTION_MODEL_SCAN_ENABLED=False)


def test_classifier_credentials_are_only_required_when_classifier_is_enabled() -> None:
    settings = Settings(
        INJECTION_LLM_SCAN_ENABLED=True,
        INJECTION_MODEL_SCAN_ENABLED=False,
        INJECTION_MODEL_URL="",
        INJECTION_MODEL_TOKEN="",
    )
    assert settings.INJECTION_MODEL_URL == ""

    with pytest.raises(ValidationError, match="classifier URL and token are required"):
        Settings(
            INJECTION_LLM_SCAN_ENABLED=True,
            INJECTION_MODEL_SCAN_ENABLED=True,
            INJECTION_MODEL_URL="",
            INJECTION_MODEL_TOKEN="",
        )


@pytest.mark.asyncio
async def test_llm_only_mode_does_not_call_remote_classifier(monkeypatch: pytest.MonkeyPatch) -> None:
    detector = InjectionDetector()

    async def scan_with_llm(_: str) -> None:
        return None

    async def fail_if_called(_: list[tuple[int, str]]) -> list[tuple[int, float]]:
        raise AssertionError("remote classifier must not run in LLM-only mode")

    monkeypatch.setattr(ENV, "INJECTION_LLM_SCAN_ENABLED", True)
    monkeypatch.setattr(ENV, "INJECTION_MODEL_SCAN_ENABLED", False)
    monkeypatch.setattr(detector, "_verify_full_text", scan_with_llm)
    monkeypatch.setattr(detector, "_classify_chunk_batch", fail_if_called)

    result = await detector.predict("ordinary objection text")

    assert result.is_attack is False
    assert result.flagged == []
