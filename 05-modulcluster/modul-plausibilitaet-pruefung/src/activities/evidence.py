"""Deterministic evidence per note for the verification (pure, LLM-free).

Signals and score per note (:func:`signals_for_note`, :func:`deterministic_score`) and
mechanical corpus facts appended to the verifier prompt (:class:`Corpus`, :func:`evidence_block_for`).
"""

from __future__ import annotations

import re
from collections import Counter, defaultdict
from dataclasses import dataclass

from src.activities.identifiers import normalise_object, referents
from src.activities.mojibake import is_mojibake
from src.activities.scoring import NUM
from src.activities.scoring import norm_ws as norm
from src.config.config import config
from src.workflows.check_logic_wf.schemas.note_schemas import AnchorKind, EvidenceLocation, EvidenceSignals

# --- patterns ----------------------------------------------------------------

# Species fact sheet / form instance: "A 1.14 Artsteckbrief Feldschwirl" etc.
PROFILE = re.compile(
    r"\bA\s?\d{1,2}\.\d{1,2}\s+Artsteckbrief\s+(\S+)|Artsteckbrief\s+([A-ZÄÖÜ]\w+)|betroffene Art\s+([A-ZÄÖÜ]\w+)",
    re.I,
)

NEGATION = re.compile(
    r"entfällt|entfallen|nicht mehr zur Verfügung|ausgeschlossen werden|"
    r"wird nicht (?:erforderlich|umgesetzt)|keine? .{0,40}(?:erforderlich|vorgesehen|nachgewiesen)|"
    r"nicht erhalten|zurückgebaut",
    re.I,
)
# Version markers in document paths (superseded editions)
VERSION_DIR = re.compile(r"Prüfexemplar|Pruefexemplar|wird ersetzt durch Deckblatt", re.I)
AI_TEXT_MARKER = re.compile(r"<summary>|<description>|<<<BEGIN_LLM_SUMMARY_NON_VERBATIM>>>")
# The verbatim part of a mixed chunk ends where the LLM summary starts.
AI_TEXT_SPLIT = re.compile(r"<summary>|<<<BEGIN_LLM_SUMMARY_NON_VERBATIM>>>")

_MIN_SENTENCE_CHARS = 30
# Share of locations whose excerpt is not found verbatim in its chunk.
_ANCHOR_FAIL_ALL = 0.99
_ANCHOR_FAIL_MOST = 0.5


def ids(text: str | None) -> set[str]:
    """Referent-capable object identifiers of a text."""
    return referents(text)


def skeleton(text: str | None) -> str:
    """Mask numbers -> sentence skeleton (repetition / serial-sheet pattern)."""
    t = norm(text).lower()
    return NUM.sub("#", t)


def numbers(text: str | None) -> list[str]:
    """All numeric tokens in reading order."""
    return re.findall(r"\d+(?:[.,]\d+)?", norm(text))


def sentences(text: str | None) -> list[str]:
    """Sentence split (min. 30 chars)."""
    return [s.strip() for s in re.split(r"(?<=[.!?])\s+|\n", text or "") if len(s.strip()) > _MIN_SENTENCE_CHARS]


def basename(document_name: str | None) -> str:
    """Last path component of a document title."""
    return (document_name or "").split("/")[-1]


def version_key(document_name: str | None) -> str:
    """Coarse edition assignment via the path: superseded editions collapse to 'ALT'."""
    top = (document_name or "").split("/")[0]
    return "ALT" if VERSION_DIR.search(document_name or "") else top


def is_superseded(document_name: str | None) -> bool:
    """Document path marks a superseded edition."""
    return bool(VERSION_DIR.search(document_name or ""))


# --- anchoring ---------------------------------------------------------------


def anchor_kind(excerpt: str, chunk_text: str) -> AnchorKind:
    """Re-anchor the checker's excerpt in the carrier chunk (exakt/teilweise/fragment/fehlt)."""
    e, c = norm(excerpt), norm(chunk_text)
    if not e or not c:
        return "fehlt"
    if e in c:
        return "exakt"
    probes: tuple[tuple[int, AnchorKind], ...] = ((60, "teilweise"), (45, "fragment"))
    for length, label in probes:
        head = e[10 : 10 + length] if len(e) > 10 + length else e[:length]
        if len(head) >= 20 and head in c:  # noqa: PLR2004 -- minimum probe length
            return label
    return "fehlt"


def is_ai_text(chunk_text: str) -> bool:
    """Chunk carries an LLM description instead of verbatim text."""
    return bool(AI_TEXT_MARKER.search(chunk_text or ""))


def _ai_text_only(f: EvidenceLocation) -> bool:
    """Excerpt anchors only inside the LLM-generated part of the chunk."""
    if not (f.chunk_is_ai_text and f.anchor == "exakt"):
        return False
    verbatim_part = AI_TEXT_SPLIT.split(f.chunk_text or "", maxsplit=1)[0]
    return norm(f.excerpt) not in norm(verbatim_part)


# --- signals -------------------------------------------------------------------


def _profile(f: EvidenceLocation) -> str | None:
    for t in ((f.chunk_text or "")[:1500], f.prev_text or ""):
        m = PROFILE.search(t)
        if m:
            return next(g for g in m.groups() if g).lower()
    return None


def _version_signals(fs: list[EvidenceLocation]) -> tuple[bool, bool, bool]:
    """(version_pair, within_version_pair, superseded_doc)."""
    base_to_versions: dict[str, set[str]] = {}
    for f in fs:
        base_to_versions.setdefault(basename(f.document_name), set()).add(version_key(f.document_name))
    version_pair = any(len(v) > 1 for v in base_to_versions.values())

    seen: dict[str, set[tuple[str, tuple[str, ...]]]] = {}
    for f in fs:
        nums = tuple(sorted(set(numbers(f.excerpt))))
        seen.setdefault(version_key(f.document_name), set()).add((basename(f.document_name), nums))
    within_version_pair = any(len(entries) > 1 for entries in seen.values())
    superseded = any(is_superseded(f.document_name) for f in fs)
    return version_pair, within_version_pair, superseded


def _name_conflict_same_values(exc: list[str], ids_per_side: list[set[str]]) -> bool:
    """Same attribute values, disjoint names."""
    for a in range(len(exc)):
        for b in range(a + 1, len(exc)):
            na, nb = set(numbers(exc[a])), set(numbers(exc[b]))
            shared_values = {n for n in (na & nb) if len(n) >= 2}  # noqa: PLR2004 -- single digits carry no identity
            ia, ib = ids_per_side[a], ids_per_side[b]
            if len(shared_values) >= 2 and ia and ib and not (ia & ib):  # noqa: PLR2004
                return True
    return False


def signals_for_note(fs: list[EvidenceLocation], wording_also_current: bool = False) -> EvidenceSignals:
    """Compute all deterministic signals for one note."""
    exc = [norm(f.excerpt) for f in fs]
    chunk = [norm(f.chunk_text) for f in fs]

    anchored = [f.anchor in ("exakt", "teilweise") for f in fs]
    anchor_fail_share = 1.0 - (sum(anchored) / len(fs)) if fs else 1.0
    ai_text_only = any(_ai_text_only(f) for f in fs)

    # Mojibake caps only if fewer than two clean excerpts can carry the contradiction.
    moji_per = [is_mojibake(e) for e in exc]
    n_clean = sum(1 for m in moji_per if not m)
    mojibake = any(moji_per) and n_clean < 2  # noqa: PLR2004 -- a contradiction needs two clean sides

    version_pair, within_version_pair, superseded = _version_signals(fs)

    # One pair of locations naming the same object is enough.
    ids_per_side = [
        (
            ids(e)
            | ids(c[: config.EXTRACTION.OBJECT_ID_TEXT_CHARS])
            | {o for obj in f.objects for o in normalise_object(obj)}
        )
        for e, c, f in zip(exc, chunk, fs, strict=True)
    ]
    nonempty = [i for i in ids_per_side if i]
    id_shared = any(nonempty[a] & nonempty[b] for a in range(len(nonempty)) for b in range(a + 1, len(nonempty)))
    id_mismatch = len(nonempty) >= 2 and not id_shared  # noqa: PLR2004

    profiles = [s for s in (_profile(f) for f in fs) if s]
    profile_mismatch = len(profiles) >= 2 and len(set(profiles)) > 1  # noqa: PLR2004

    skels = [skeleton(e) for e in exc if len(e) > 40]  # noqa: PLR2004 -- short excerpts have no skeleton
    same_skeleton = len(skels) >= 2 and len(set(skels)) < len(skels)  # noqa: PLR2004
    nums_differ = len({tuple(numbers(e)) for e in exc if numbers(e)}) > 1
    template_serial = same_skeleton and nums_differ and id_mismatch
    same_id_conflict = same_skeleton and nums_differ and id_shared

    has_negation = any(NEGATION.search(e) for e in exc)
    status_conflict = has_negation and id_shared
    current_page = any(not is_superseded(f.document_name) for f in fs)

    return EvidenceSignals(
        anchor_fail_share=round(anchor_fail_share, 2),
        ai_text_only=ai_text_only,
        mojibake=mojibake,
        version_pair=version_pair,
        within_version_pair=within_version_pair,
        superseded_doc=superseded,
        id_mismatch=id_mismatch,
        id_shared=id_shared,
        template_serial=template_serial,
        profile_mismatch=profile_mismatch,
        same_id_conflict=same_id_conflict,
        status_conflict=status_conflict,
        current_page=current_page,
        name_conflict_same_values=_name_conflict_same_values(exc, ids_per_side),
        numeric_conflict_same_id=nums_differ and id_shared,
        wording_also_current=wording_also_current,
        n_locations=len(fs),
    )


def deterministic_score(s: EvidenceSignals) -> float:  # noqa: PLR0912
    """Deterministic score: a priori, mechanism-based weights. Base 50, caps for hard FP mechanisms."""
    score = 50.0
    if s.same_id_conflict:
        score += 20
    if s.status_conflict:
        score += 15
    if s.numeric_conflict_same_id and not s.same_id_conflict:
        score += 8
    if s.name_conflict_same_values:
        score += 8  # naming inconsistency suspicion: no id_mismatch penalty, mild bonus
    elif s.id_mismatch:
        score -= 15
    if s.template_serial:
        score = min(score, 25)
    if s.profile_mismatch:
        score = min(score, 25)
    if s.anchor_fail_share >= _ANCHOR_FAIL_ALL:
        score -= 20
    elif s.anchor_fail_share >= _ANCHOR_FAIL_MOST:
        score -= 8
    if s.ai_text_only:
        score = min(score, 30)
    if s.mojibake:
        score = min(score, 15)
    # Version artefact: same document across editions without a conflict within one edition.
    if s.version_artefact:
        score = min(score, 20)
    elif s.superseded_doc and not s.wording_also_current and not s.status_exception:
        score -= 5
    return max(0.0, min(100.0, score))


# --- corpus enrichment ----------------------------------------------------


@dataclass(frozen=True)
class CorpusChunk:
    """Minimal chunk view for the corpus index."""

    document_name: str
    page_numbers: tuple[int, ...]
    text: str


class Corpus:
    """Sentence-skeleton index over all text chunks of a project."""

    def __init__(self, chunks: list[CorpusChunk]) -> None:
        self.chunks = [c for c in chunks if c.text]
        # skeleton -> [(doc, superseded, numbers, sentence)]
        self.sk: dict[str, list[tuple[str, bool, tuple[str, ...], str]]] = defaultdict(list)
        for c in self.chunks:
            alt = is_superseded(c.document_name)
            for s in sentences(c.text):
                nums = tuple(numbers(s))
                if nums and len(s.split()) >= 6:  # noqa: PLR2004 -- skip fragments
                    self.sk[skeleton(s)].append((c.document_name, alt, nums, s))

    @staticmethod
    def edition_status(document_name: str | None) -> str:
        """Human-readable edition status for the prompt."""
        return "ÜBERHOLT (Prüfexemplar / 'wird ersetzt durch Deckblatt')" if is_superseded(document_name) else "aktuell"

    def wording_in_current_edition(self, excerpt: str) -> tuple[bool | None, str | None]:
        """Does a sentence of the excerpt (skeleton + same numbers) occur in a NON-superseded source?

        Returns (True/False/None, evidence document).
        """
        for s in sentences(excerpt) or [norm(excerpt)]:
            nums = tuple(numbers(s))
            if not nums or len(s.split()) < 6:  # noqa: PLR2004
                continue
            hits = self.sk.get(skeleton(s), [])
            current = [h for h in hits if not h[1] and h[2] == nums]
            if current:
                return True, basename(current[0][0])
            if hits:
                return False, None
        return None, None

    def value_support(self, excerpt: str, max_lines: int = 3) -> list[str]:
        """Per numeric sentence: how often does the skeleton occur with which number variants (current editions)?"""
        lines: list[str] = []
        for s in sentences(excerpt) or [norm(excerpt)]:
            nums = tuple(numbers(s))
            if not nums or len(s.split()) < 6:  # noqa: PLR2004
                continue
            hits = [h for h in self.sk.get(skeleton(s), []) if not h[1]]
            if len(hits) < 2:  # noqa: PLR2004
                continue
            variants = Counter(h[2] for h in hits)
            if len(variants) < 2:  # noqa: PLR2004
                continue
            desc = "; ".join(f"Werte {'/'.join(v)}: {n}\u00d7" for v, n in variants.most_common(4))
            warn = " — Achtung: >2 Varianten deutet auf Serienvorlage" if len(variants) > 2 else ""  # noqa: PLR2004
            lines.append(f"Satzmuster kommt mit {len(variants)} Zahlvarianten vor ({desc}){warn}")
            if len(lines) >= max_lines:
                break
        return lines

    def third_party_sources(
        self, shared_ids: set[str], conflict_nums: set[str], exclude_docs: set[str], k: int = 2
    ) -> list[str]:
        """Corpus snippets from other documents naming a shared identifier together with a conflict value."""
        out: list[str] = []
        for sid in sorted(shared_ids)[:2]:
            if len(sid) < 3:  # noqa: PLR2004
                continue
            for c in self.chunks:
                if basename(c.document_name) in exclude_docs or is_superseded(c.document_name):
                    continue
                txt = c.text
                if sid in txt and any(nv in txt for nv in conflict_nums):
                    i = txt.find(sid)
                    out.append(
                        f"[{basename(c.document_name)} S.{list(c.page_numbers)}] …{txt[max(0, i - 120) : i + 240]}…"
                    )
                    break
            if len(out) >= k:
                break
        return out


def wording_also_current(fs: list[EvidenceLocation], corpus: Corpus) -> bool:
    """Any superseded location whose wording provably also occurs in a current source."""
    return any(corpus.wording_in_current_edition(f.excerpt)[0] is True for f in fs if is_superseded(f.document_name))


def evidence_block_for(fs: list[EvidenceLocation], corpus: Corpus) -> str:
    """Mechanically gathered corpus evidence for the verifier prompt (no judgements)."""
    lines = ["\n# Deterministische Korpus-Evidenz (mechanisch erhoben, keine Urteile)"]
    ids_per: list[set[str]] = []
    nums_all: set[str] = set()
    for i, f in enumerate(fs[:6], 1):
        st = corpus.edition_status(f.document_name)
        line = f"Fundstelle {i}: Fassungsstatus {st}"
        if st != "aktuell":
            ja, source = corpus.wording_in_current_edition(f.excerpt)
            if ja:
                line += f"; derselbe Wortlaut (inkl. Zahlen) steht AUCH in aktueller Quelle: {source}"
            elif ja is False:
                line += "; Wortlaut in aktuellen Quellen NICHT mit diesen Zahlen gefunden"
        lines.append(line)
        ids_per.append(ids(norm(f.excerpt)) | ids(norm((f.chunk_text or "")[: config.EXTRACTION.OBJECT_ID_TEXT_CHARS])))
        nums_all |= set(numbers(f.excerpt))
    for f in fs[:4]:
        for wl in corpus.value_support(f.excerpt, max_lines=1):
            lines.append(f"Wert-Support: {wl}")
    shared: set[str] = set()
    for a in range(len(ids_per)):
        for b in range(a + 1, len(ids_per)):
            shared |= ids_per[a] & ids_per[b]
    for d in corpus.third_party_sources(shared, nums_all, {basename(f.document_name) for f in fs}):
        lines.append(f"Drittquelle zu geteilter Kennung: {d}")
    lines.append(
        "Hinweis: 'ÜBERHOLT' entkräftet eine Fundstelle nur, wenn der Wortlaut NICHT auch in einer aktuellen Quelle steht."
    )
    return "\n".join(lines)
