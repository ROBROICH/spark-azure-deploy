from __future__ import annotations

import re
from collections import defaultdict
from dataclasses import dataclass
from typing import Any

from temporalio.exceptions import ApplicationError


def normalize_norm_value(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def normalize_paragraph_nr(value: str) -> str:
    """Strip leading '§' and whitespace so '§ 44' and '44' both become '44'."""
    normalized = normalize_norm_value(value)
    return normalized.lstrip("§").strip()


def topic_norm_key(jurabk: str, paragraph_nr: str) -> tuple[str, str]:
    return (normalize_norm_value(jurabk), normalize_paragraph_nr(paragraph_nr))


@dataclass(frozen=True, slots=True)
class TopicNormMatch:
    owner_node_type: str
    owner_node_id: str
    topic_norm_id: str


def build_topic_norm_matches(
    topic_norms: list[dict[str, Any]],
) -> dict[tuple[str, str], list[TopicNormMatch]]:
    entries_by_key: dict[tuple[str, str], list[TopicNormMatch]] = defaultdict(list)
    for topic_norm in topic_norms:
        topic_norm_id = str(topic_norm["id"])
        jurabk = topic_norm.get("jurabk")
        paragraph_nr = topic_norm.get("paragraph_nr")
        if not jurabk or not paragraph_nr:
            raise ApplicationError(
                f"topic_norm {topic_norm_id} is missing required field(s): "
                f"jurabk={jurabk!r}, paragraph_nr={paragraph_nr!r}",
                non_retryable=True,
            )
        topic_id = topic_norm.get("topic_id")
        subtopic_id = topic_norm.get("subtopic_id")
        if not topic_id and not subtopic_id:
            raise ApplicationError(
                f"topic_norm {topic_norm_id} is missing an owner: topic_id={topic_id!r}, subtopic_id={subtopic_id!r}",
                non_retryable=True,
            )
        entries_by_key[topic_norm_key(jurabk, paragraph_nr)].append(
            TopicNormMatch(
                owner_node_type="topic" if topic_id else "subtopic",
                owner_node_id=str(topic_id or subtopic_id),
                topic_norm_id=topic_norm_id,
            )
        )

    return {
        key: sorted(
            values,
            key=lambda value: (value.owner_node_type, value.owner_node_id, value.topic_norm_id),
        )
        for key, values in entries_by_key.items()
    }


def build_existing_gesetz_by_jurabk(
    gesetze: list[dict[str, Any]],
) -> dict[str, dict[str, Any]]:
    """Build a lookup of normalized_jurabk -> gesetz dict."""
    entries_by_key: dict[str, list[dict[str, Any]]] = defaultdict(list)

    for gesetz in gesetze:
        jurabk = gesetz.get("jurabk")
        if jurabk:
            entries_by_key[normalize_norm_value(str(jurabk))].append(gesetz)

    ambiguous = {key: values for key, values in entries_by_key.items() if len(values) > 1}
    if ambiguous:
        formatted = "; ".join(
            f"{jurabk}: {', '.join(str(entry['id']) for entry in values)}"
            for jurabk, values in sorted(ambiguous.items())
        )
        raise ApplicationError(
            f"Ambiguous gesetz matches in examination project: {formatted}",
            non_retryable=True,
        )

    return {key: values[0] for key, values in entries_by_key.items()}


def build_existing_norm_by_gesetz_paragraph(
    norms: list[dict[str, Any]],
) -> dict[tuple[str, str], dict[str, Any]]:
    """Build a lookup of (gesetz_id, normalized_paragraph_nr) -> norm dict."""
    entries_by_key: dict[tuple[str, str], list[dict[str, Any]]] = defaultdict(list)

    for norm in norms:
        gesetz_id = norm.get("gesetz_id")
        paragraph_nr = norm.get("paragraph_nr")
        if gesetz_id and paragraph_nr:
            entries_by_key[(str(gesetz_id), normalize_paragraph_nr(paragraph_nr))].append(norm)

    ambiguous = {key: values for key, values in entries_by_key.items() if len(values) > 1}
    if ambiguous:
        formatted = "; ".join(
            f"gesetz={gesetz_id} §{paragraph_nr}: {', '.join(str(entry['id']) for entry in values)}"
            for (gesetz_id, paragraph_nr), values in sorted(ambiguous.items())
        )
        raise ApplicationError(
            f"Ambiguous norm matches in examination project: {formatted}",
            non_retryable=True,
        )

    return {key: values[0] for key, values in entries_by_key.items()}


def build_existing_absatz_ids_by_norm_and_nr(
    absaetze: list[dict[str, Any]],
) -> dict[str, dict[str, str]]:
    """Build a lookup of norm_id -> {absatz_nr: absatz_id}."""
    result: dict[str, dict[str, list[str]]] = defaultdict(lambda: defaultdict(list))

    for absatz in absaetze:
        norm_id = absatz.get("norm_id")
        absatz_nr = absatz.get("absatz_nr")
        absatz_id = absatz.get("id")
        if norm_id and absatz_nr and absatz_id:
            result[str(norm_id)][str(absatz_nr)].append(str(absatz_id))

    ambiguous = [
        (norm_id, absatz_nr, ids)
        for norm_id, by_nr in result.items()
        for absatz_nr, ids in by_nr.items()
        if len(ids) > 1
    ]
    if ambiguous:
        formatted = "; ".join(
            f"norm={norm_id} absatz={absatz_nr}: {', '.join(ids)}" for norm_id, absatz_nr, ids in sorted(ambiguous)
        )
        raise ApplicationError(
            f"Ambiguous absatz matches in examination project: {formatted}",
            non_retryable=True,
        )

    return {norm_id: {nr: ids[0] for nr, ids in by_nr.items()} for norm_id, by_nr in result.items()}


def build_existing_satz_ids(saetze: list[dict[str, Any]]) -> set[str]:
    """Build the set of existing satz ids (satz.id is stable from JSON)."""
    return {str(satz["id"]) for satz in saetze if satz.get("id")}


def build_existing_satz_keys(
    saetze: list[dict[str, Any]],
) -> set[tuple[str, str, tuple[str, ...]]]:
    """Build the set of existing satz identity keys ``(absatz_id, satz_nr, markers)``.

    Content-based: two saetze with the same absatz_id, satz_nr and markers are
    treated as the same logical row, regardless of their examination-service
    primary key. Needed because satz UUIDs are regenerated per workflow run
    and can't be compared against the upstream IDs from the rechtsmethodik
    output.
    """
    keys: set[tuple[str, str, tuple[str, ...]]] = set()
    for satz in saetze:
        absatz_id = satz.get("absatz_id")
        satz_nr = satz.get("satz_nr")
        if absatz_id is None or satz_nr is None:
            continue
        markers = tuple(satz.get("markers") or [])
        keys.add((str(absatz_id), str(satz_nr), markers))
    return keys
