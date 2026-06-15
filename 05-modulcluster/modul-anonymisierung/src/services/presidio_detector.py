"""Deterministic PII detection via Microsoft Presidio + spaCy.

Runs as a baseline detector alongside the LLM path. Returns the surface
forms (matched substrings) of detected PII so the existing fuzzy matcher
and redactor can be reused unchanged.

The Presidio ``AnalyzerEngine`` is initialized lazily as a process-wide
singleton: the spaCy ``de_core_news_lg`` model (~540 MB on disk, ~400 MB
RAM) is loaded **once per worker process** and reused across all
activity invocations. Call :func:`get_analyzer` eagerly at worker
startup to amortize the load cost off the critical path.
"""

from __future__ import annotations

import logging
import threading
import time

from presidio_analyzer import AnalyzerEngine
from presidio_analyzer.nlp_engine import NlpEngineProvider

from src.config import PresidioConfig

logger = logging.getLogger(__name__)

_analyzer: AnalyzerEngine | None = None
_analyzer_lock = threading.Lock()


def get_analyzer(cfg: PresidioConfig) -> AnalyzerEngine:
    """Return a process-wide singleton :class:`AnalyzerEngine`.

    Thread-safe and idempotent. The first call loads the configured
    spaCy model (slow, ~5-10s); subsequent calls return the cached
    instance instantly.
    """
    global _analyzer
    if _analyzer is not None:
        return _analyzer

    with _analyzer_lock:
        if _analyzer is not None:
            return _analyzer

        start = time.perf_counter()
        nlp_engine = NlpEngineProvider(
            nlp_configuration={
                "nlp_engine_name": "spacy",
                "models": [{"lang_code": cfg.LANGUAGE, "model_name": cfg.SPACY_MODEL}],
            }
        ).create_engine()

        _analyzer = AnalyzerEngine(
            nlp_engine=nlp_engine,
            supported_languages=[cfg.LANGUAGE],
        )
        elapsed = time.perf_counter() - start
        logger.info(
            "Presidio analyzer initialized (spaCy=%s, lang=%s) in %.2fs",
            cfg.SPACY_MODEL,
            cfg.LANGUAGE,
            elapsed,
        )
        return _analyzer


def detect_pii_in_lines(page_lines: list[str], cfg: PresidioConfig) -> list[str]:
    """Detect PII surface forms in a single page's text.

    Joins the page lines into one document, runs Presidio analysis,
    deduplicates matches and filters by minimum length. The returned
    strings are the actual matched substrings (not entity types), ready
    to be fed into the existing fuzzy matcher.
    """
    text = " ".join(line for line in page_lines if line.strip())
    if not text:
        return []

    analyzer = get_analyzer(cfg)
    entities = cfg.ENTITIES or None  # None => all built-in recognizers
    results = analyzer.analyze(
        text=text,
        language=cfg.LANGUAGE,
        entities=entities,
        score_threshold=cfg.SCORE_THRESHOLD,
    )

    seen: set[str] = set()
    matches: list[str] = []
    for r in results:
        surface = text[r.start : r.end].strip()
        if len(surface) < cfg.MIN_TERM_LENGTH:
            continue
        if surface in seen:
            continue
        seen.add(surface)
        matches.append(surface)

        # Split compound names (e.g. "Johanna Müller") into parts
        if r.entity_type == "PERSON" and " " in surface:
            for part in surface.split():
                part = part.strip()
                if len(part) >= cfg.MIN_TERM_LENGTH and part not in seen:
                    seen.add(part)
                    matches.append(part)

    return matches
