"""LLM-free candidate sources for pairs outside the screener's cosine window.

Above the window, a copied sentence with an outdated value is discarded as a near-duplicate;
below it, a cross-reference and its cited table are too dissimilar for the vector search.
Detector (copied sentences with differing numbers; more than two occurrences are a template
line) and overflow hits go straight to the context checker; cross-reference candidates run
through the normal screener.
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field

from temporalio import activity

from src.activities.identifiers import identifiers
from src.activities.scoring import NUM, PROBE_CHARS, number_words, quantities, similarity
from src.config.config import config
from src.qdrant.schemas import ChunkPayload, ClaimPayload
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import ScreeningHit
from src.workflows.clients import qdrant_client
from src.workflows.qdrant_wf.schemas.workflow import DocumentActivityInput

# ---------------------------------------------------------------------------
# Text primitives
# ---------------------------------------------------------------------------

_SENT_SPLIT = re.compile(r"(?<=[.!?])\s+")
_MARKUP = re.compile(r"<table|<tr>|<td|<th|img_path|</")
_HEADING = re.compile(r"^##\s*([^#]{0,120})")
_SENTENCE = re.compile(r"[A-ZÄÖÜ][^.!?]{25,}[.!?]")
_IDENTIFIER_WINDOW = 300
_MIN_SENTENCE, _MAX_SENTENCE = 40, 600


def candidate_sentences(text: str | None) -> list[str]:
    """Candidate sentences: 40-600 chars, contain a number and real words."""
    out: list[str] = []
    for raw in _SENT_SPLIT.split(re.sub(r"\s+", " ", text or "")):
        s = raw.strip()
        if _MIN_SENTENCE <= len(s) <= _MAX_SENTENCE and NUM.search(s) and re.search(r"[a-zäöüß]{4,}", s):
            out.append(s)
    return out


def wordmask(s: str) -> str:
    """Sentence without numbers."""
    return NUM.sub("#", s).strip().lower()


def _window(chunk_text: str, sentence: str) -> str:
    t = re.sub(r"\s+", " ", chunk_text or "")
    i = t.find(sentence[:PROBE_CHARS])
    if i < 0:
        return sentence
    return t[max(0, i - _IDENTIFIER_WINDOW) : i + len(sentence) + _IDENTIFIER_WINDOW]


def _outline(sentence: str, toc_path: list[str]) -> str:
    parts = list(toc_path)
    m = _HEADING.match(sentence.strip())
    if m:
        parts.append(m.group(1))
    return " ".join(parts)


def _is_structural_index(diffs: list[tuple[str, str]], sa: str, sb: str, toc_a: list[str], toc_b: list[str]) -> bool:
    """All deviations are outline numbers of the respective page."""
    oa, ob = _outline(sa, toc_a), _outline(sb, toc_b)
    if not diffs or not (oa.strip() and ob.strip()):
        return False
    return all(x in oa and y in ob for x, y in diffs)


# ---------------------------------------------------------------------------
# Detector
# ---------------------------------------------------------------------------


@dataclass
class Repetition:
    """A repeated sentence with differing numbers (candidate pair on chunk level)."""

    document_id: str
    chunk_a_id: str
    chunk_b_id: str
    sentence_a: str
    sentence_b: str
    differences: list[tuple[str, str]] = field(default_factory=list)

    @property
    def note(self) -> str:
        """Screener-style Prüfauftrag handed to the context checker."""
        diffs = ", ".join(f"{x} gegen {y}" for x, y in self.differences[:4])
        return f"Prüfen, ob derselbe Satz mit abweichenden Zahlen wiederholt wird ({diffs})."


_RawPair = tuple[tuple[str, str], ChunkPayload, ChunkPayload, str, str, list[tuple[str, str]]]


def _raw_pairs(chunks: list[ChunkPayload]) -> list[_RawPair]:
    """All sentence pairs with identical word mask and different number signature."""
    by_mask: dict[tuple[str, str], list[tuple[ChunkPayload, str]]] = defaultdict(list)
    for c in chunks:
        if c.chunk_type != "text":
            continue
        for s in candidate_sentences(c.chunk_content):
            key = (c.document_id, wordmask(s))
            by_mask[key].append((c, s))

    raw: list[_RawPair] = []
    for key, items in by_mask.items():
        signatures: dict[tuple[str, ...], list[tuple[ChunkPayload, str]]] = defaultdict(list)
        for c, s in items:
            signatures[tuple(NUM.findall(s))].append((c, s))
        if len(signatures) < 2:  # noqa: PLR2004
            continue
        keys = sorted(signatures)
        for i in range(len(keys)):
            for j in range(i + 1, len(keys)):
                (ca, sa), (cb, sb) = signatures[keys[i]][0], signatures[keys[j]][0]
                if ca.chunk_id == cb.chunk_id:
                    continue
                diffs = [(x, y) for x, y in zip(keys[i], keys[j], strict=False) if x != y]
                raw.append((key, ca, cb, sa, sb, diffs))
    return raw


def find_repetitions(chunks: list[ChunkPayload]) -> list[Repetition]:
    """Detect copied sentences with outdated values."""
    raw = _raw_pairs(chunks)
    # Rule 4: the sentence occurs exactly twice (one pair per mask) — more is a template line.
    occurrences = Counter(r[0] for r in raw)
    out: list[Repetition] = []
    for key, ca, cb, sa, sb, diffs in raw:
        if occurrences[key] != 1:
            continue
        if _MARKUP.search(sa) or _MARKUP.search(sb):
            continue
        if not (_SENTENCE.search(sa) and _SENTENCE.search(sb)):
            continue
        ia, ib = identifiers(_window(ca.chunk_content, sa)), identifiers(_window(cb.chunk_content, sb))
        if ia and ib and (ia ^ ib):
            continue
        if _is_structural_index(diffs, sa, sb, ca.toc_path, cb.toc_path):
            continue
        out.append(Repetition(ca.document_id, ca.chunk_id, cb.chunk_id, sa, sb, diffs))
    return out


# ---------------------------------------------------------------------------
# Sentence -> claim mapping
# ---------------------------------------------------------------------------


def _tokens(text: str) -> set[str]:
    return {t for t in re.findall(r"[\wäöüß]+", text.lower()) if len(t) >= 4 or t.isdigit()}  # noqa: PLR2004


def claim_for_sentence(sentence: str, claims: list[ClaimPayload]) -> ClaimPayload | None:
    """The claim of the carrier chunk that best covers the sentence (token overlap), or None."""
    ts = _tokens(sentence)
    if not ts:
        return None
    best: tuple[float, ClaimPayload] | None = None
    for c in claims:
        tc = _tokens(" ".join([c.claim_text, *c.evidence_sentences]))
        if not tc:
            continue
        overlap = len(ts & tc) / len(ts)
        if overlap >= config.CANDIDATES.MIN_CLAIM_OVERLAP and (best is None or overlap > best[0]):
            best = (overlap, c)
    return best[1] if best else None


def hits_from_repetitions(reps: list[Repetition], claims_by_chunk: dict[str, list[ClaimPayload]]) -> list[ScreeningHit]:
    """Turn chunk-level repetitions into screening hits on claim level (skips pairs without a covering claim)."""
    hits: list[ScreeningHit] = []
    seen: set[frozenset[str]] = set()
    for r in reps:
        ca = claim_for_sentence(r.sentence_a, claims_by_chunk.get(r.chunk_a_id, []))
        cb = claim_for_sentence(r.sentence_b, claims_by_chunk.get(r.chunk_b_id, []))
        if ca is None or cb is None:
            continue
        key = frozenset((ca.claim_id, cb.claim_id))
        if key in seen:
            continue
        seen.add(key)
        hits.append(
            ScreeningHit(
                claim_id=ca.claim_id,
                reference_id=cb.claim_id,
                claim_chunk_id=ca.chunk_id,
                reference_chunk_id=cb.chunk_id,
                rating=100,
                note=r.note,
                reasoning="Deterministischer Wiederholungs-Detektor: identische Wortmaske, abweichende Zahlen, "
                "genau zwei Vorkommen, keine abweichende Objektkennung.",
            )
        )
    return hits


# ---------------------------------------------------------------------------
# Overflow pairs (> upper cosine window)
# ---------------------------------------------------------------------------


def copied_with_different_numbers(text_a: str, text_b: str) -> list[tuple[str, str]] | None:
    """Same word mask, different numbers, no differing identifiers — else None."""
    a, b = re.sub(r"\s+", " ", text_a or "").strip(), re.sub(r"\s+", " ", text_b or "").strip()
    if not a or not b or wordmask(a) != wordmask(b):
        return None
    na, nb = NUM.findall(a), NUM.findall(b)
    diffs = [(x, y) for x, y in zip(na, nb, strict=False) if x != y]
    if not diffs:
        return None
    ia, ib = identifiers(a), identifiers(b)
    if ia and ib and (ia ^ ib):
        return None
    return diffs


_NUMBER_WORD_WITHOUT_ARTICLE = re.compile(
    r"\b(null|zwei|drei|vier|f(?:ü|ue)nf|sechs|sieben|acht|neun|zehn|elf|zw(?:ö|oe)lf)\b", re.I
)


# DIN 5008 thousands separator: 1-3 digits, a (narrow) space, exactly three digits.
# A four-digit group on the left is a year ("bis 2025 300 m"), not a thousands group.
_THOUSANDS_SPACE = re.compile(r"(?<![\d.,])(\d{1,3})[ \u202f\u00a0](?=\d{3}\b)")
_STATION_DECIMAL = re.compile(r"(\d\+\d{3})\.000\b")


def _number_words_without_articles(text: str) -> str:
    """Normalise number words, space-separated thousands and chainage suffixes to plain digits."""
    t = _THOUSANDS_SPACE.sub(r"\1", text)
    t = _STATION_DECIMAL.sub(r"\1", t)
    return _NUMBER_WORD_WITHOUT_ARTICLE.sub(lambda m: number_words(m.group(0)), t)


def number_sets_differ(text_a: str, text_b: str) -> list[tuple[str, str]] | None:
    """Paraphrase test for near-duplicates: the normalised sets of quantities differ.

    Differing object identifiers still veto (two instances of a template).
    """
    a, b = _number_words_without_articles(text_a or ""), _number_words_without_articles(text_b or "")
    # High cosine alone is not enough (degenerate embeddings pair unrelated sentences);
    # the statements must share most of their wording.
    sim = similarity(a, b)
    if sim is None or sim < config.CANDIDATES.OVERFLOW_MIN_OVERLAP:
        return None
    ga, gb = quantities(a), quantities(b)
    if not ga or not gb:
        return None
    ia, ib = identifiers(a), identifiers(b)
    if ia and ib and (ia ^ ib):
        return None

    def key(g: tuple[str, float, str]) -> tuple[str, float]:
        kind, value, unit = g
        scale = {"mm": 0.001, "cm": 0.01, "dm": 0.1, "km": 1000.0, "qm": 1.0, "ha": 10000.0, "km²": 1e6}.get(unit, 1.0)
        return kind, round(value * scale, 6)

    sa, sb = {key(g) for g in ga}, {key(g) for g in gb}
    only_a, only_b = sorted(sa - sb), sorted(sb - sa)
    if not only_a and not only_b:
        return None
    if not only_a or not only_b:
        return None  # one side merely adds a quantity (more detail), no contradiction
    return [(f"{x[1]:g}", f"{y[1]:g}") for x, y in zip(only_a, only_b, strict=False)]


def hits_from_overflow(pairs: list[tuple[ClaimPayload, ClaimPayload]]) -> list[ScreeningHit]:
    """Near-duplicate neighbours that differ only in numbers become candidates."""
    hits: list[ScreeningHit] = []
    for a, b in pairs:
        diffs = copied_with_different_numbers(a.claim_text, b.claim_text)
        if diffs is None:
            diffs = number_sets_differ(a.claim_text, b.claim_text)
        if diffs is None:
            # claims may be paraphrased identically while the quotes differ — test the quotes too
            for qa in a.evidence_sentences:
                for qb in b.evidence_sentences:
                    diffs = copied_with_different_numbers(qa, qb)
                    if diffs:
                        break
                if diffs:
                    break
        if not diffs:
            continue
        shown = ", ".join(f"{x} gegen {y}" for x, y in diffs[:4])
        hits.append(
            ScreeningHit(
                claim_id=a.claim_id,
                reference_id=b.claim_id,
                claim_chunk_id=a.chunk_id,
                reference_chunk_id=b.chunk_id,
                rating=100,
                note=f"Prüfen, ob eine nahezu wortgleiche Aussage abweichende Zahlen trägt ({shown}).",
                reasoning="Screener-Fensterüberläufer (Kosinus über der Obergrenze) mit identischer Wortmaske und "
                "abweichenden Zahlen.",
            )
        )
    return hits


# ---------------------------------------------------------------------------
# Cross-references
# ---------------------------------------------------------------------------

_CROSS_REFERENCE = re.compile(
    r"\b(Unterlage|Anlage|Anhang|Kapitel|Kap\.|Abschnitt|Abs\.)\s*(\d{1,2}(?:[.\-]\d{1,2}){0,3})\b", re.I
)


@dataclass(frozen=True)
class CrossReference:
    """A cross-reference found in a sentence."""

    kind: str  # unterlage | kapitel
    number: str
    sentence: str


def find_cross_references(text: str | None) -> list[CrossReference]:
    """Cross-references in sentences that also carry a number (a claim-worthy statement)."""
    out: list[CrossReference] = []
    for s in candidate_sentences(text):
        for m in _CROSS_REFERENCE.finditer(s):
            kind = "kapitel" if m.group(1).lower().startswith(("kap", "abs")) else "unterlage"
            number = m.group(2).replace("-", ".")
            # the reference number itself must not be the only number in the sentence
            if NUM.sub("", s.replace(m.group(0), "")).strip() == s.replace(m.group(0), "").strip():
                continue
            out.append(CrossReference(kind, number, s))
    return out


def document_matches_reference(title: str, number: str) -> bool:
    """Does a document path denote Unterlage/Anlage ``number`` (e.g. 14.1 -> '14_1', '14.1', '14-1')?"""
    parts = number.split(".")
    variants = {"_".join(parts), ".".join(parts), "-".join(parts)}
    for seg in title.split("/"):
        for v in variants:
            if re.search(rf"(?<![\d.]){re.escape(v)}(?![\d])", seg):
                return True
    return False


def target_document_ids(cross_reference: CrossReference, own_document_id: str, titles: dict[str, str]) -> list[str]:
    """Documents a cross-reference points to."""
    if cross_reference.kind == "kapitel":
        return [own_document_id]
    return [
        doc
        for doc, title in titles.items()
        if doc != own_document_id and document_matches_reference(title, cross_reference.number)
    ]


# ---------------------------------------------------------------------------
# Activities
# ---------------------------------------------------------------------------


@activity.defn
async def detect_candidates(inp: DocumentActivityInput) -> list[ScreeningHit]:
    """Detector hits for one document (0 LLM calls): copied sentences with outdated values."""
    chunk_ids = await qdrant_client.get_chunk_ids_by_document_id(project_id=inp.project_id, document_id=inp.document_id)
    chunks = await qdrant_client.get_chunk_payloads(project_id=inp.project_id, chunk_ids=chunk_ids)
    reps = find_repetitions(chunks)
    if not reps:
        return []
    involved = list({cid for r in reps for cid in (r.chunk_a_id, r.chunk_b_id)})
    claims = await qdrant_client.get_claim_payloads_by_chunk_ids(project_id=inp.project_id, chunk_ids=involved)
    by_chunk: dict[str, list[ClaimPayload]] = defaultdict(list)
    for c in claims:
        by_chunk[c.chunk_id].append(c)
    hits = hits_from_repetitions(reps, by_chunk)
    activity.logger.info(
        "Detector: %d repetitions, %d candidates with a claim for document %s", len(reps), len(hits), inp.document_id
    )
    return hits
