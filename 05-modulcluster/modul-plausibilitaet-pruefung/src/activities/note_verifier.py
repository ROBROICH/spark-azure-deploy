"""Payload and score combination for the adversarial note verifier (pure).

score = clamp(score_det + (weighted 'echt' share - 0.5) * VOTE_SPREAD); a 'falsch' vote citing
"Fassung/Version" counts as 'unklar' when the conflict also exists within one edition (facts beat
model claims). The top tier needs deterministic same-object evidence; hard FP caps hold regardless of votes.
"""

from __future__ import annotations

import re

from src.config.config import config
from src.workflows.check_logic_wf.schemas.note_schemas import EvidenceLocation, Note, WeightedVote

VOTE_VALUE: dict[str, float] = {"echt": 1.0, "unklar": 0.5, "falsch": 0.0}
_VERSION_CATEGORY = re.compile(r"fassung|version", re.I)


def _select_locations(fs: list[EvidenceLocation], max_fund: int) -> list[EvidenceLocation]:
    """Document-diverse selection when a note has more locations than the prompt budget."""
    if len(fs) <= max_fund:
        return fs
    seen: set[str] = set()
    keep: list[EvidenceLocation] = []
    for f in fs:
        k = f.document_name or f.document_id
        if k not in seen or len(keep) < max_fund // 2:
            keep.append(f)
            seen.add(k)
        if len(keep) >= max_fund:
            break
    return keep


def verifier_payload(note: Note) -> str:
    """Prompt body: the report plus each location with quote, outline and carrier text."""
    p = config.NOTE_VERIFIER
    fs = _select_locations(note.locations, p.MAX_LOCATIONS_IN_PROMPT)
    parts = [f"# Meldung\nTitel: {note.title}\nBeschreibung: {note.description}\n"]
    for i, f in enumerate(fs, 1):
        parts.append(
            f"\n## Fundstelle {i}\nDokument: {f.document_name}\nSeite: {f.page}\n"
            f"Zitat: {f.excerpt}\n"
            f"Gliederung: {f.toc_path}\n"
            f"Trägertext:\n{(f.chunk_text or '(kein Chunk gefunden)')[: p.MAX_CHUNK_TEXT_CHARS]}\n"
            + (f"Vorkontext: …{f.prev_text[-400:]}\n" if f.prev_text else "")
            + (f"Nachkontext: {f.next_text[:400]}…\n" if f.next_text else "")
        )
    body = "".join(parts)[: p.MAX_PROMPT_CHARS]
    return body + note.evidence_block


def vote_value(vote: WeightedVote, within_version_pair: bool) -> float:
    """Numeric vote value with the fact guard applied."""
    v = VOTE_VALUE.get(vote.urteil, 0.5)
    if v == 0.0 and within_version_pair and _VERSION_CATEGORY.search(vote.kategorie or ""):
        return 0.5
    return v


def base_vote_sum(votes: list[WeightedVote]) -> float:
    """Raw 'echt' mass of the base votes (without fact guard); decides whether the veto pass runs."""
    return sum(VOTE_VALUE.get(v.urteil, 0.5) for v in votes if v.stage == "basis")


def needs_escalation(votes: list[WeightedVote]) -> bool:
    """Escalate notes with a base-pass majority."""
    return base_vote_sum(votes) >= config.NOTE_VERIFIER.ESCALATION_MIN_BASE_SUM


def skip_verifier(note: Note) -> bool:
    """Hard negatives cannot change tier through votes."""
    return note.signals.hard_negative


def score_a(note: Note, votes: list[WeightedVote]) -> float:
    """Final verification score from the deterministic score and the weighted votes."""
    p = config.NOTE_VERIFIER
    s = note.signals
    total_weight = sum(v.weight for v in votes)
    weighted = sum(v.weight * vote_value(v, s.within_version_pair) for v in votes)
    offset = ((weighted / total_weight - 0.5) * p.VOTE_SPREAD) if total_weight else 0.0
    score = note.score_det + offset
    if not s.referent_evidence:
        score = min(score, p.CAP_WITHOUT_REFERENT_EVIDENCE)
    if s.hard_negative:
        score = min(score, p.CAP_HARD_NEGATIVE)
    return round(max(0.0, min(100.0, score)), 1)
