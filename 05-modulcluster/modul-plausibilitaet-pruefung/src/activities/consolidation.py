"""Deterministic duplicate consolidation and output composition (no LLM).

A group inherits the maximum scores of its members; title and description come from the
best member, occurrences are the union. Notes merge by complete linkage over :func:`same_conflict`.
"""

from __future__ import annotations

import re
from typing import Any

from temporal.contracts import (
    PlausibilityConflictLocation as ConflictLocation,
)
from temporal.contracts import (
    PlausibilityContradiction as Contradiction,
)
from temporal.contracts import (
    PlausibilityContradictionOccurrence as Occurrence,
)
from temporal.contracts import (
    PlausibilityStatus as ContradictionStatus,
)

from src.activities.identifiers import REFERENT_EXCLUSIONS, normalise_object
from src.activities.scoring import norm_words, numeric_conflict, similarity, tokens
from src.config.config import config
from src.workflows.check_logic_wf.schemas.note_schemas import (
    EvidenceLocation,
    Note,
    NoteScores,
    RubricLocation,
    RubricResponse,
)

# An evidence location is identified by the full normalised excerpt: two table rows on one
# page with the same leading words and different values are two locations, not one.


def evidence_keys(fs: list[EvidenceLocation]) -> set[tuple[str, int | None, str]]:
    """Evidence-location keys of a note."""
    return {(f.document_id, f.page, norm_words(f.excerpt)) for f in fs}


# The project road itself (an A, B, L or K road number) names the whole project, not an object.
_ROAD = re.compile(r"^[ABLK] \d+[A-Z]?$")


def _symmetric(x: str, y: str) -> float:
    """Token overlap divided by the larger side, so a one-word field does not match every longer one.

    Whole words only: prefix stems collide on German compounds.
    """
    tx, ty = tokens(x), tokens(y)
    return len(tx & ty) / max(len(tx), len(ty)) if tx and ty else 0.0


def _same_value(x: str, y: str) -> bool:
    z = numeric_conflict([x, y])
    if z is not None:
        return not z
    return (similarity(x, y) or 0.0) >= config.CONSOLIDATION.VALUE_MIN_SIMILARITY


def _same_object(ga: list[str], gb: list[str]) -> bool | None:
    """Same object? True / False (disjoint specific identifiers) / None (undecidable).

    Identifiers shared by whole chapters and the project road never decide.
    """
    ia = set().union(*(normalise_object(g) for g in ga))
    ib = set().union(*(normalise_object(g) for g in gb))

    def specific(ids: set[str]) -> set[str]:
        return {
            x
            for x in ids
            if not x.startswith("OBJ ") and x.split(" ", 1)[0] not in REFERENT_EXCLUSIONS and not _ROAD.match(x)
        }

    sa, sb = specific(ia), specific(ib)
    if sa and sb:
        return bool(sa & sb)
    best = max((_symmetric(x, y) for x in ga for y in gb), default=0.0)
    return True if best >= config.CONSOLIDATION.VALUE_MIN_SIMILARITY else None


def same_conflict(a: RubricResponse | None, b: RubricResponse | None, evidence_shared: bool = False) -> bool:
    """Do two rubric extractions describe the same conflict?

    Same object plus a similar attribute or the same values; with an undecidable object both must
    match, or one of them plus a shared evidence location. A shared location alone never merges.
    """
    if a is None or b is None:
        return False
    ga = [s.gegenstand for s in a.stellen if norm_words(s.gegenstand)]
    gb = [s.gegenstand for s in b.stellen if norm_words(s.gegenstand)]
    objekt = _same_object(ga, gb) if ga and gb else None
    if objekt is False:
        return False
    ma = [s.merkmal for s in a.stellen if norm_words(s.merkmal)]
    mb = [s.merkmal for s in b.stellen if norm_words(s.merkmal)]
    attribute_ok = bool(ma and mb) and (
        max(_symmetric(x, y) for x in ma for y in mb) >= config.RUBRIC.ATTRIBUTE_MIN_SIMILARITY
    )
    wa = [s.wert for s in a.stellen if norm_words(s.wert)]
    wb = [s.wert for s in b.stellen if norm_words(s.wert)]
    smaller, larger = sorted((wa, wb), key=len)
    matched = sum(1 for x in smaller if any(_same_value(x, y) for y in larger))
    values_ok = matched >= 2  # noqa: PLR2004 -- both sides of the conflict recur
    if objekt is True:
        return attribute_ok or values_ok
    if attribute_ok and values_ok:
        return True
    return evidence_shared and (attribute_ok or values_ok)


def groups(notes: list[Note], note_scores: dict[str, NoteScores]) -> list[list[Note]]:
    """Complete-linkage grouping by same conflict; identical evidence sets always merge."""

    def rubric(n: Note) -> RubricResponse | None:
        b = note_scores.get(n.note_id)
        return b.rubric if b else None

    def strength(n: Note) -> tuple[float, int]:
        b = note_scores.get(n.note_id)
        return ((b.score_a + (b.score_b or 0.0)) if b else n.score_det, n.rating)

    def matches(n: Note, group: list[Note]) -> bool:
        bk = evidence_keys(n.locations)
        return all(
            (bk and evidence_keys(m.locations) == bk)
            or same_conflict(rubric(n), rubric(m), evidence_shared=bool(bk & evidence_keys(m.locations)))
            for m in group
        )

    out: list[list[Note]] = []
    for n in sorted(notes, key=lambda x: (-strength(x)[0], -strength(x)[1], x.note_id)):
        target = next((g for g in out if matches(n, g)), None)
        if target is None:
            out.append([n])
        else:
            target.append(n)
    return out


def _occurrence_text(location_index: int, rubric: RubricResponse | None) -> str | None:
    """'Merkmal: Wert [Bezugsrahmen]' from the rubric, or None — never prose from the checker."""
    if rubric is not None and location_index < len(rubric.stellen):
        s = rubric.stellen[location_index]
        if s.merkmal or s.wert:
            text = f"{s.merkmal}: {s.wert}".strip(": ")
            return f"{text} [{s.bezugsrahmen}]" if s.bezugsrahmen else text
    return None


def occurrences(note: Note, bew: NoteScores | None) -> list[Occurrence]:
    """Occurrences of one note, in Fundstellen order (strongest edge first)."""
    rubric = bew.rubric if bew else None
    out: list[Occurrence] = []
    for i, f in enumerate(note.locations):
        out.append(
            Occurrence(  # pyrefly: ignore[missing-argument]  # populate_by_name=True allows snake_case
                document_id=f.document_id,
                document_name=f.document_name,
                page_number=f.page,
                content_excerpt=f.excerpt,
                contradiction=_occurrence_text(i, rubric),
            )
        )
    return out


def _evidence_lines(note: Note, bew: NoteScores | None) -> list[str]:
    s = note.signals
    flags = [
        name
        for name, on in (
            ("same_id_conflict", s.same_id_conflict),
            ("status_conflict", s.status_conflict),
            ("numeric_conflict_same_id", s.numeric_conflict_same_id),
            ("name_conflict_same_values", s.name_conflict_same_values),
            ("id_mismatch", s.id_mismatch),
            ("template_serial", s.template_serial),
            ("steckbrief_mismatch", s.profile_mismatch),
            ("version_pair", s.version_pair),
            ("within_version_pair", s.within_version_pair),
            ("wortlaut_auch_aktuell", s.wording_also_current),
            ("mojibake", s.mojibake),
            ("ki_text_only", s.ai_text_only),
        )
        if on
    ]
    lines = [
        f"Prüfung/Evidenz: score_det={note.score_det:.0f}; {', '.join(flags) or 'keine Signale'}; anker_fehlt={s.anchor_fail_share:.2f}"
    ]
    if bew is None:
        return lines
    if bew.verifier_skipped:
        lines.append("Prüfung/Verifier: übersprungen (deterministisch gedeckelt oder Rubrik unter MIN_SCORE_B)")
    for v in bew.votes:
        lines.append(f"Prüfung/Verifier[{v.stage}]: {v.urteil} ({v.kategorie}) — {v.grund}")
    if note.gate_reason:
        lines.append(f"Rubrik/Gate: {note.gate_reason}")
    rubric_score = bew.rubric_score.score if bew.rubric_score.evaluated else "n/a"
    lines.append(f"Rubrik/Bewertung: {rubric_score} — {bew.rubric_score.grund}")
    if bew.rubric is not None:
        for i, st in enumerate(bew.rubric.stellen, 1):
            lines.append(
                f"Rubrik/Stelle {i}: rolle={st.rolle}; gegenstand={st.gegenstand}; merkmal={st.merkmal}; "
                f"wert={st.wert}; bezugsrahmen={st.bezugsrahmen}"
            )
        lines.append(
            f"Rubrik/Urteil: gleicher_gegenstand={bew.rubric.gleicher_gegenstand}; unvereinbar={bew.rubric.unvereinbar}; "
            f"{bew.rubric.begruendung}"
        )
    return lines


def _dedupe_occurrences(occs: list[Occurrence]) -> list[Occurrence]:
    seen: set[tuple[str, int | None, str]] = set()
    out: list[Occurrence] = []
    for o in occs:
        k = (o.document_id, o.page_number, norm_words(o.content_excerpt))
        if k in seen:
            continue
        seen.add(k)
        out.append(o)
    return out


def compose(
    group: list[Note],
    note_scores: dict[str, NoteScores],
    contradiction_id: str,
) -> Contradiction:
    """Compose one delivered contradiction from a matter group. Scores are the group maxima."""

    def score_a(n: Note) -> float:
        b = note_scores.get(n.note_id)
        return b.score_a if b else n.score_det

    def score_b(n: Note) -> float | None:
        b = note_scores.get(n.note_id)
        return b.score_b if b else None

    def score_sum(n: Note) -> float:
        return score_a(n) + (score_b(n) or 0.0)

    best = max(group, key=lambda n: (score_sum(n), n.rating))
    occs: list[Occurrence] = []
    evidence: list[str] = []
    for n in sorted(group, key=lambda n: (-score_sum(n), -n.rating)):
        occs.extend(occurrences(n, note_scores.get(n.note_id)))
        evidence.extend(_evidence_lines(n, note_scores.get(n.note_id)))
    description = best.description
    if len(group) > 1:
        description += f"\n\nZusammengeführt aus {len(group)} Meldungen zum selben Sachverhalt."
    conflict: list[ConflictLocation] = []
    for n in group:
        b = note_scores.get(n.note_id)
        if b and b.rubric:
            conflict.extend(
                ConflictLocation(gegenstand=st.gegenstand, merkmal=st.merkmal, wert=st.wert) for st in b.rubric.stellen
            )
    return Contradiction(  # pyrefly: ignore[missing-argument]  # populate_by_name=True allows snake_case
        id=contradiction_id,
        title=best.title,
        description=description,
        rating=max(n.rating for n in group),
        score_a=max(score_a(n) for n in group),
        score_b=max((b for n in group if (b := score_b(n)) is not None), default=None),
        evidence=evidence,
        merged_count=len(group),
        conflict=conflict,
        status=ContradictionStatus.OPEN,
        occurrences=_dedupe_occurrences(occs),
    )


# ---------------------------------------------------------------------------
# Project-wide consolidation on raw checkpoint dicts (both key spellings)
# ---------------------------------------------------------------------------


def _g(d: dict[str, Any], *keys: str) -> Any:
    for k in keys:
        if k in d:
            return d[k]
    return None


def _rubric_from_dict(c: dict[str, Any]) -> RubricResponse | None:
    raw = c.get("conflict") or []
    stellen = [
        RubricLocation(
            rolle="",
            gegenstand=str(s.get("gegenstand") or ""),
            merkmal=str(s.get("merkmal") or ""),
            wert=str(s.get("wert") or ""),
            bezugsrahmen="",
        )
        for s in raw
        if isinstance(s, dict)
    ]
    if not stellen:
        return None
    return RubricResponse(stellen=stellen, gleicher_gegenstand="unklar", unvereinbar="unklar", begruendung="")


def _evidence_keys_dict(c: dict[str, Any]) -> set[tuple[str, int | None, str]]:
    out: set[tuple[str, int | None, str]] = set()
    for o in c.get("occurrences") or []:
        out.add(
            (
                str(_g(o, "document_id", "documentId") or ""),
                _g(o, "page_number", "pageNumber"),
                norm_words(str(_g(o, "content_excerpt", "contentExcerpt") or "")),
            )
        )
    return out


def _score_sum(c: dict[str, Any]) -> float:
    a = _g(c, "score_a", "scoreA") or 0.0
    b = _g(c, "score_b", "scoreB") or 0.0
    return float(a) + float(b)


def _merge_dicts(group: list[dict[str, Any]]) -> dict[str, Any]:
    best = max(group, key=lambda c: (_score_sum(c), c.get("rating") or 0))
    out = dict(best)
    if len(group) == 1:
        return out
    sa = "score_a" if "score_a" in best else "scoreA"
    sb = "score_b" if "score_b" in best else "scoreB"
    mc = "merged_count" if "merged_count" in best else "mergedCount"
    out["rating"] = max(c.get("rating") or 0 for c in group)
    out[sa] = max(float(_g(c, "score_a", "scoreA") or 0.0) for c in group)
    bs = [float(b) for c in group if (b := _g(c, "score_b", "scoreB")) is not None]
    out[sb] = max(bs) if bs else None
    out[mc] = sum(int(_g(c, "merged_count", "mergedCount") or 1) for c in group)
    seen: set[tuple[str, int | None, str]] = set()
    occs: list[dict[str, Any]] = []
    evidence: list[str] = []
    for c in sorted(group, key=lambda c: (-_score_sum(c), -(c.get("rating") or 0))):
        for o in c.get("occurrences") or []:
            k = (
                str(_g(o, "document_id", "documentId") or ""),
                _g(o, "page_number", "pageNumber"),
                norm_words(str(_g(o, "content_excerpt", "contentExcerpt") or "")),
            )
            if k not in seen:
                seen.add(k)
                occs.append(o)
        evidence.extend(c.get("evidence") or [])
    out["occurrences"] = occs
    out["evidence"] = evidence
    out["description"] = (
        f"{best.get('description') or ''}\n\nProjektweit zusammengeführt aus {len(group)} Meldungen zum selben Sachverhalt."
    )
    return out


def project_wide(contradictions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Consolidate the contradictions of a whole project run; drops the consumed ``conflict`` field."""
    rubrics = {id(c): _rubric_from_dict(c) for c in contradictions}
    evidence_sets = {id(c): _evidence_keys_dict(c) for c in contradictions}
    groups_: list[list[dict[str, Any]]] = []
    for c in sorted(contradictions, key=lambda c: (-_score_sum(c), -(c.get("rating") or 0), str(c.get("id")))):
        target = next(
            (
                g
                for g in groups_
                if all(
                    (evidence_sets[id(c)] and evidence_sets[id(c)] == evidence_sets[id(m)])
                    or same_conflict(
                        rubrics[id(c)],
                        rubrics[id(m)],
                        evidence_shared=bool(evidence_sets[id(c)] & evidence_sets[id(m)]),
                    )
                    for m in g
                )
            ),
            None,
        )
        if target is None:
            groups_.append([c])
        else:
            target.append(c)
    out = [_merge_dicts(g) for g in groups_]
    for c in out:
        c.pop("conflict", None)
    return out
