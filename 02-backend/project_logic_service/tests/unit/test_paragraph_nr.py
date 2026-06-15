"""Unit tests for the ``paragraph_nr`` normalizer."""

import pytest

from src.services.projects.default_topic_seed_data import (
    DEFAULT_TOPICS_BY_PROJECT_TYPE_NAME,
    SubtopicSeed,
    TopicNormSeed,
    TopicSeed,
)
from src.utils.paragraph_nr import normalize_paragraph_nr


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("§ 44", "44"),
        ("§44", "44"),
        (" § 44 ", "44"),
        ("44", "44"),
        ("§ 44a", "44a"),
        ("§44a", "44a"),
        ("  44a  ", "44a"),
        ("§ 1a", "1a"),
        ("§ 8a", "8a"),
        ("§ 44 Abs. 1", "44 Abs. 1"),
        ("44 Abs. 1", "44 Abs. 1"),
        ("§§ 44", "44"),
        ("", ""),
        ("   ", ""),
    ],
)
def test_normalize_paragraph_nr(raw: str, expected: str) -> None:
    assert normalize_paragraph_nr(raw) == expected


def test_normalize_paragraph_nr_is_idempotent() -> None:
    once = normalize_paragraph_nr("§ 44a")
    twice = normalize_paragraph_nr(once)
    assert once == twice == "44a"


def test_topic_norm_seed_normalizes_on_construction() -> None:
    seed = TopicNormSeed("BNatSchG", "§ 44")
    assert seed.paragraph_nr == "44"


def test_topic_norm_seed_preserves_already_normalized() -> None:
    seed = TopicNormSeed("BNatSchG", "44a")
    assert seed.paragraph_nr == "44a"


def test_default_seed_data_has_no_paragraph_prefix() -> None:
    def assert_norms_are_normalized(topic_or_subtopic: TopicSeed | SubtopicSeed) -> None:
        for norm in (*topic_or_subtopic.pruefungs_norms, *topic_or_subtopic.verfahrens_norms):
            if norm.paragraph_nr is None:
                continue
            assert "\u00a7" not in norm.paragraph_nr
            assert norm.paragraph_nr == norm.paragraph_nr.strip()

    for topics in DEFAULT_TOPICS_BY_PROJECT_TYPE_NAME.values():
        for topic in topics:
            assert_norms_are_normalized(topic)
            for sub_topic in topic.sub_topics:
                assert_norms_are_normalized(sub_topic)
