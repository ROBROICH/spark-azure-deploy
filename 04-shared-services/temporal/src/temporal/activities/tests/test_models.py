"""Tests for temporal.activities.models — Model → Provider → Queue mapping."""

import pytest
from temporal.activities.models import Provider, get_queue_for_model, resolve_provider


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("nvidia/some-model", Provider.NVIDIA),
        ("ionos/some-model", Provider.IONOS),
        ("mistral/some-model", Provider.MISTRAL),
        ("gcp/some-model", Provider.VERTEX),
        ("hf/some-model", Provider.HUGGINGFACE),
        ("self-hosted/some-model", Provider.CUSTOM),
    ],
)
def test_resolve_provider(model: str, expected: Provider) -> None:
    assert resolve_provider(model) is expected


def test_resolve_provider_unknown_prefix_falls_back_to_custom() -> None:
    assert resolve_provider("unknown/model") is Provider.CUSTOM


def test_resolve_provider_no_slash_falls_back_to_custom() -> None:
    assert resolve_provider("bare-model-name") is Provider.CUSTOM


@pytest.mark.parametrize(
    ("model", "expected"),
    [
        ("Qwen/Qwen3-235B-A22B-Instruct-2507", Provider.VERTEX),
        ("meta/llama-3.3-70b-instruct-maas", Provider.VERTEX),
        ("mistral-small-2506", Provider.MISTRAL),
    ],
)
def test_resolve_provider_overrides(model: str, expected: Provider) -> None:
    """Models whose name doesn't follow prefix convention are routed correctly."""
    assert resolve_provider(model) is expected


@pytest.mark.parametrize(
    ("model", "expected_queue"),
    [
        ("nvidia/x", "llm-nvidia"),
        ("ionos/x", "llm-ionos"),
        ("mistral/x", "llm-mistral"),
        ("gcp/x", "llm-vertex"),
        ("hf/x", "llm-huggingface"),
        ("self-hosted/x", "llm-custom"),
    ],
)
def test_get_queue_for_model(model: str, expected_queue: str) -> None:
    assert get_queue_for_model(model) == expected_queue
