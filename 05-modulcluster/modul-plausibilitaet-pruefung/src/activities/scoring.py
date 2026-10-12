"""Deterministic scoring of the extractive rubric (LLM-free): gate, pair filters, pair score.

The model extracts, the code decides.
"""

from __future__ import annotations

import contextlib
import itertools
import re

from src.activities.identifiers import class_conflict
from src.activities.mojibake import is_mojibake
from src.config.config import config
from src.workflows.check_logic_wf.schemas.note_schemas import (
    EvidenceLocation,
    PageContext,
    RubricLocation,
    RubricResponse,
    RubricScore,
)

# ---------------------------------------------------------------------------
# Normalisation helpers
# ---------------------------------------------------------------------------

NUM = re.compile(r"\d+(?:[.,]\d+)*")
# Token similarity: same object from, different object below; value field names the object from.
_SAME_OBJECT_SIMILARITY = 0.5
_DIFFERENT_OBJECT_SIMILARITY = 0.2
_VALUE_IS_OBJECT_SIMILARITY = 0.8
_SAME_ATTRIBUTE_SIMILARITY = 0.25
# Leading characters of an excerpt used to locate it in a text.
PROBE_CHARS = 60
# Text after a located excerpt checked for mojibake.
_MOJIBAKE_LOOKAHEAD_CHARS = 120
_STOP = re.compile(
    r"\b(der|die|das|des|dem|den|und|von|im|in|am|zur|zum|bei|ca|etwa|rd|nach|fuer|für|auf|mit|ein|eine|einer|eines"
    r"|beim|als|dieser|diese)\b",
    re.I,
)


def norm_ws(text: str | None) -> str:
    """Collapse whitespace and unify typographic dashes/quotes."""
    s = text or ""
    for a, b in (
        ("\u2011", "-"),
        ("\u2010", "-"),
        ("\u2013", "-"),
        ("\u2014", "-"),
        ("\u00a0", " "),
        ("\u2026", "..."),
        ("„", '"'),
        ("“", '"'),
        ("\u2018", "'"),
        ("\u2019", "'"),
    ):
        s = s.replace(a, b)
    return re.sub(r"\s+", " ", s).strip()


def norm_words(text: str | None) -> str:
    """Lower-case word characters only (for identity checks)."""
    return re.sub(r"[^\w]+", " ", (text or "").lower()).strip()


def mask_numbers(text: str | None) -> str:
    """Word mask: numbers replaced by '#'."""
    return NUM.sub("#", norm_ws(text)).lower()


def _n(text: str | None) -> str:
    s = (text or "").lower().replace("\u00df", "ss")
    s = _STOP.sub(" ", s)
    return " ".join(re.sub(r"[^\wäöü]+", " ", s).split())


def tokens(text: str | None) -> set[str]:
    return {t for t in _n(text).split() if len(t) >= 4 or any(c.isdigit() for c in t)}  # noqa: PLR2004


def similarity(a: str | None, b: str | None) -> float | None:
    """Token overlap similarity in [0, 1]; None if one side has no tokens."""
    na, nb = _n(a), _n(b)
    if na and na == nb:
        return 1.0
    ta, tb = tokens(a), tokens(b)
    if not ta or not tb:
        return None
    return max(len(ta & tb) / len(ta), len(ta & tb) / len(tb))


# ---------------------------------------------------------------------------
# Number comparison: all quantities in order, dates recognised,
# integers exact, decimals with relative tolerance. No clock-time pattern: it misreads decimal
# points and thousands separators as hours and minutes.
# ---------------------------------------------------------------------------

_MONTHS: dict[str, int] = {
    m: i + 1
    for i, m in enumerate(
        [
            "januar",
            "februar",
            "maerz",
            "april",
            "mai",
            "juni",
            "juli",
            "august",
            "september",
            "oktober",
            "november",
            "dezember",
        ]
    )
}
_MONTHS["märz"] = 3
_LENGTH = {"mm": 0.001, "cm": 0.01, "dm": 0.1, "m": 1.0, "km": 1000.0}
_AREA = {"m²": 1.0, "qm": 1.0, "ha": 10000.0, "km²": 1e6}
_DATE = re.compile(r"(\d{1,2})\.\s*(" + "|".join(_MONTHS) + r")", re.I)
_DATE_NUM = re.compile(r"\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b")
# Numbers: German thousands groups ("1.100", "45.000,5"), a comma decimal ("4,70") or a
# point decimal with one or two digits ("4.70", as docling often renders PDF text).
_NUMBER = re.compile(
    r"(?<![\w.,:])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+\.\d{1,2}(?!\d)|\d+(?:,\d+)?)"
    r"\s*(gon|km²|km|m²|qm|ha|mm|cm|dm|m|%|BP|St|kN|kg|t)?\b",
    re.I,
)
_NUMBER_WORD: dict[str, int] = {
    "null": 0,
    "ein": 1,
    "eine": 1,
    "eins": 1,
    "zwei": 2,
    "drei": 3,
    "vier": 4,
    "fuenf": 5,
    "fünf": 5,
    "sechs": 6,
    "sieben": 7,
    "acht": 8,
    "neun": 9,
    "zehn": 10,
    "elf": 11,
    "zwoelf": 12,
    "zwölf": 12,
}
_NUMBER_WORD_RX = re.compile(r"\b(" + "|".join(_NUMBER_WORD) + r")\b", re.I)

Quantity = tuple[str, float, str]  # (kind, value, unit)


def _float(raw: str) -> float:
    """German notation: '.' groups thousands (exactly three digits), ',' is the decimal mark;
    a point followed by one or two digits is a decimal point."""
    if "," in raw:
        return float(raw.replace(".", "").replace(",", "."))
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", raw):
        return float(raw.replace(".", ""))
    return float(raw)


def number_words(text: str | None) -> str:
    """Replace German number words by digits."""
    return _NUMBER_WORD_RX.sub(lambda m: str(_NUMBER_WORD[m.group(0).lower()]), text or "")


def quantities(text: str | None) -> list[Quantity]:
    """All quantities of a value field in text order."""
    t = (text or "").replace("\u00a0", " ").replace("\u202f", " ")
    hits: list[tuple[int, str, float, str]] = []
    taken: list[tuple[int, int]] = []

    def free(s: int, e: int) -> bool:
        return not any(not (e <= a or s >= b) for a, b in taken)

    for rx, kind in ((_DATE_NUM, "datum"), (_DATE, "datum")):
        for m in rx.finditer(t):
            if not free(m.start(), m.end()):
                continue
            taken.append((m.start(), m.end()))
            if rx is _DATE:
                # day + month name, no year in the pattern
                value = _MONTHS[m.group(2).lower()] * 100 + int(m.group(1))
            else:
                year = int(m.group(3))
                year = year + 2000 if year < 100 else year  # noqa: PLR2004 -- two-digit year
                value = year * 10000 + int(m.group(2)) * 100 + int(m.group(1))
            hits.append((m.start(), kind, float(value), ""))

    for m in _NUMBER.finditer(t):
        if not free(m.start(), m.end()):
            continue
        with contextlib.suppress(ValueError):
            hits.append((m.start(), "zahl", _float(m.group(1)), (m.group(2) or "").lower()))

    hits.sort()
    return [(k, v, u) for _, k, v, u in hits]


def _equal(x: Quantity, y: Quantity) -> bool | None:
    """None = not comparable, True = equal, False = different."""
    (ka, va, ua), (kb, vb, ub) = x, y
    if ka != kb:
        return None
    if ua and ub and ua != ub:
        for tab in (_LENGTH, _AREA):
            if ua in tab and ub in tab:
                return abs(vb * tab[ub] / tab[ua] - va) <= 0.005 * max(abs(va), 1)
        return None
    if ka == "datum" or (va == int(va) and vb == int(vb)):
        return va == vb
    return abs(va - vb) <= 0.005 * max(abs(va), abs(vb), 1)


def numeric_conflict(values: list[str]) -> bool | None:
    """True = conflict, False = equal, None = undecidable."""
    value_lists = [quantities(number_words(w)) for w in values]
    if any(not g for g in value_lists) or len(value_lists) < 2:  # noqa: PLR2004
        return None
    for a, b in itertools.combinations(value_lists, 2):
        comparable = False
        for x, y in zip(a, b, strict=False):  # common prefix (value fields are cut at 70 chars)
            g = _equal(x, y)
            if g is None:
                continue
            comparable = True
            if g is False:
                return True
        if not comparable:
            return None
    return False


_NUM_LEGACY = re.compile(
    r"(?<![\w.,])(\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:,\d+)?)\s*(gon|km|m²|qm|ha|mm|cm|m|%|BP|St)?\b", re.I
)
_LENGTH_LEGACY = {"mm": 0.001, "cm": 0.01, "m": 1.0, "km": 1000.0}
_AREA_LEGACY = {"m²": 1.0, "qm": 1.0, "ha": 10000.0}


def _number_legacy(text: str | None) -> tuple[float, str] | None:
    m = _NUM_LEGACY.search(text or "")
    if not m:
        return None
    try:
        return _float(m.group(1)), (m.group(2) or "").lower()
    except ValueError:
        return None


def numeric_conflict_legacy(values: list[str]) -> bool | None:
    """First-number comparison with relative tolerance; ``pair_score`` uses it, the top tier uses :func:`numeric_conflict`."""
    zs = [_number_legacy(w) for w in values]
    if any(z is None for z in zs) or len(zs) < 2:  # noqa: PLR2004
        return None
    pairs = [z for z in zs if z is not None]
    result = False
    for (v1, u1), (v2, u2) in itertools.combinations(pairs, 2):
        if u1 and u2 and u1 != u2:
            done = False
            for tab in (_LENGTH_LEGACY, _AREA_LEGACY):
                if u1 in tab and u2 in tab:
                    if abs(v2 * tab[u2] / tab[u1] - v1) > 0.005 * max(abs(v1), 1):
                        return True
                    done = True
                    break
            if not done:
                return None
        elif abs(v1 - v2) > 0.005 * max(abs(v1), abs(v2), 1):
            result = True
    return result


# ---------------------------------------------------------------------------
# Pair score building blocks
# ---------------------------------------------------------------------------

_NO_FACTUAL_STATEMENT = frozenset({"formularoption", "schriftfeld"})
_CODE = re.compile(
    r"\b(?:[A-ZÄÖÜ]{1,4}\s?\d{1,4}(?:[.,\-\u2013]\d{1,3})*[a-z]?|\d{1,2}\.\d{1,2}[a-z]?\s?(?:CEF|FCS|FFH)?|km\s?\d{1,3}\+\d{3})\b"
)
_FRAME = re.compile(
    r"(baubedingt|anlagebedingt|betriebsbedingt|nullfall|planfall|bezugsfall|variante\s*[\w.]*|prognose\w*"
    r"|vor\s+ma(ss|ß)nahme|nach\s+ma(ss|ß)nahme|20\d\d)",
    re.I,
)
_THRESHOLD = re.compile(
    r"(ab einem|mindestens|maximal|h(ö|oe)chstens|Grenzwert|Schwellenwert|zul(ä|ae)ssig|darf nicht|nicht mehr als"
    r"|Richtwert|Orientierungswert|erforderlich|vorzusehen|mind\.)",
    re.I,
)
CHECK_INSTRUCTION = re.compile(
    r"(ist zu (kl(ä|ae)ren|pr(ü|ue)fen|untersuchen|beachten|ermitteln)|"
    r"sind zu (kl(ä|ae)ren|pr(ü|ue)fen|untersuchen|beachten|ermitteln)|"
    r"zu kl(ä|ae)ren(?: sind| ist)?|folgende Inhalte|im Rahmen der (weiteren |Ausf(ü|ue)hrungs)"
    r"planung (zu|festzulegen)|bleibt (zu pr(ü|ue)fen|vorbehalten)|noch festzulegen)",
    re.I,
)


def codes(text: str | None) -> set[str]:
    """Instance codes in a Gegenstand field."""
    return {re.sub(r"\s+", "", c).lower() for c in _CODE.findall(text or "")}


def same_object(a: str | None, b: str | None) -> bool | None:
    """True/False/None (undecidable) for two Gegenstand fields."""
    ca, cb = codes(a), codes(b)
    if ca and cb:
        if ca == cb:
            return True
        if not (ca & cb):
            return False  # different codes -> different objects
    s = similarity(a, b)
    if s is None:
        return None
    if s >= _SAME_OBJECT_SIMILARITY:
        return True
    if s < _DIFFERENT_OBJECT_SIMILARITY:
        return False
    return None


def frame_conflict(x: str | None, y: str | None, values: str) -> bool:
    """Frames of reference differ in a way not already explained by the value fields."""
    ka = {m.group(0).lower().strip() for m in _FRAME.finditer(x or "")}
    kb = {m.group(0).lower().strip() for m in _FRAME.finditer(y or "")}
    if not ka or not kb:
        return False
    diff = (ka | kb) - (ka & kb)
    return bool({d for d in diff if d not in values.lower()})


def _is_threshold(s: RubricLocation) -> bool:
    return bool(_THRESHOLD.search(f"{s.wert} {s.merkmal}"))


def _value_is_object(s: RubricLocation) -> bool:
    if not s.gegenstand or not s.wert:
        return False
    a = similarity(s.gegenstand, s.wert)
    return a is not None and a >= _VALUE_IS_OBJECT_SIMILARITY


# Pair score levels below the top tier; an undecided object costs _PENALTY_UNCERTAIN_OBJECT or
# selects the lower level.
_SCORE_THRESHOLD_VS_FACT = 26
_SCORE_NO_FACTUAL_ROLE = 12
_SCORE_DIFFERENT_OBJECTS = 18
_SCORE_DIFFERENT_FRAME = 22
_SCORE_DIFFERENT_ATTRIBUTES = 28
_SCORE_EQUAL_VALUES_DESPITE_INCOMPATIBLE = 30
_SCORE_INCOMPATIBLE_NUMERIC = 92
_SCORE_INCOMPATIBLE = 86
_PENALTY_UNCERTAIN_OBJECT = 22
_SCORE_NUMERIC_DESPITE_COMPATIBLE = 74
_SCORE_NUMERIC_DESPITE_COMPATIBLE_UNCERTAIN = 55
_SCORE_UNCLEAR = 55
_SCORE_UNCLEAR_UNCERTAIN = 40
_SCORE_COMPATIBLE = 18


def pair_score(a: RubricLocation, b: RubricLocation, incompatible: str) -> tuple[int, str]:  # noqa: PLR0911
    """Score one pair of locations below the top tier. ``incompatible`` = note-level model judgement."""
    if _is_threshold(a) != _is_threshold(b):
        return _SCORE_THRESHOLD_VS_FACT, "normative Schwelle gegen Sachangabe"
    if {a.rolle, b.rolle} & _NO_FACTUAL_STATEMENT:
        return _SCORE_NO_FACTUAL_ROLE, "Rolle ist keine Sachaussage"
    go = same_object(a.gegenstand, b.gegenstand)
    if go is False:
        return _SCORE_DIFFERENT_OBJECTS, "verschiedene Gegenstaende"
    values = f"{a.wert} {b.wert}"
    if frame_conflict(a.bezugsrahmen, b.bezugsrahmen, values):
        return _SCORE_DIFFERENT_FRAME, "verschiedener Bezugsrahmen"
    zk = numeric_conflict_legacy([a.wert, b.wert])
    ms = similarity(a.merkmal, b.merkmal)
    same_attribute = ms is None or ms >= _SAME_ATTRIBUTE_SIMILARITY
    if not same_attribute and zk is not True and incompatible != "ja":
        return _SCORE_DIFFERENT_ATTRIBUTES, "verschiedene Merkmale"
    certain = go is True
    if incompatible == "ja":
        if zk is False:
            return _SCORE_EQUAL_VALUES_DESPITE_INCOMPATIBLE, "Werte gleich trotz Urteil unvereinbar"
        base = _SCORE_INCOMPATIBLE_NUMERIC if zk else _SCORE_INCOMPATIBLE
        reason = "Zahlenkonflikt, gleicher Gegenstand" if zk else "unvereinbare Aussagen, gleicher Gegenstand"
        return (base if certain else base - _PENALTY_UNCERTAIN_OBJECT), reason
    if zk is True:
        return (
            _SCORE_NUMERIC_DESPITE_COMPATIBLE if certain else _SCORE_NUMERIC_DESPITE_COMPATIBLE_UNCERTAIN
        ), "Zahlenkonflikt trotz Urteil 'vereinbar'"
    if incompatible == "unklar":
        return (_SCORE_UNCLEAR if certain else _SCORE_UNCLEAR_UNCERTAIN), "Unvereinbarkeit unklar"
    return _SCORE_COMPATIBLE, "Aussagen vereinbar"


def _frame_asymmetric(a: RubricLocation, b: RubricLocation) -> bool:
    return bool(a.bezugsrahmen.strip()) != bool(b.bezugsrahmen.strip())


def pair_score_strict(a: RubricLocation, b: RubricLocation, v: RubricResponse) -> int | None:  # noqa: PLR0911
    """Top tier, pairwise: everything must fit for THIS pair, with an asymmetric frame of reference."""
    if {a.rolle, b.rolle} - {"sachaussage"}:
        return None
    if v.gleicher_gegenstand != "ja" or v.unvereinbar != "ja":
        return None
    if same_object(a.gegenstand, b.gegenstand) is False:
        return None
    w = f"{a.wert} {b.wert}"
    if frame_conflict(a.bezugsrahmen, b.bezugsrahmen, w):
        return None
    k = numeric_conflict([a.wert, b.wert])
    numeric = k is True
    ms = similarity(a.merkmal, b.merkmal)
    if ms is not None and ms < config.RUBRIC.ATTRIBUTE_MIN_SIMILARITY:
        return None
    if not numeric:
        if _frame_asymmetric(a, b):
            return None
        if CHECK_INSTRUCTION.search(f"{w} {a.merkmal} {b.merkmal}"):
            return None
        if k is False:
            return None
    return config.RUBRIC.SCORE_TOP_NUMERIC if numeric else config.RUBRIC.SCORE_TOP_QUALITATIVE


# ---------------------------------------------------------------------------
# Pair filters
# ---------------------------------------------------------------------------


def trivial_pair(a: EvidenceLocation, b: EvidenceLocation) -> bool:
    """Same quote (one excerpt contains the other); pairs within one page stay."""
    na, nb = norm_words(a.excerpt), norm_words(b.excerpt)
    if not na or not nb:
        return True
    return na == nb or na in nb or nb in na


def version_duplicate(a: EvidenceLocation, b: EvidenceLocation) -> bool:
    """Two editions of the same document (same basename, different document_id)."""
    if a.document_id == b.document_id:
        return False
    return (a.document_name or "").split("/")[-1] == (b.document_name or "").split("/")[-1]


# ---------------------------------------------------------------------------
# Gate: note-level rules that set the rubric score to 0
# ---------------------------------------------------------------------------

_TITLE_BLOCK = re.compile(
    r"(Stand\s+Kataster|Bestandsvermessung|PSP[\s\-]?Element|PROJIS|Blatt[\s\-]?Nr|"
    r"Unterlagen?[\s\-]?Nr|Ma(ß|ss)stab\s*[:=]|Aufgestellt|Seite\s+\d+\s+von\s+\d+|"
    r"Bundesautobahn\s*:|Lagesystem|H(ö|oe)hensystem|Anlage\s*:\s*\d|Bericht\s*:\s*\d|"
    r"Netzknoten|Kreuzungswinkel|Streckenabschnitt\s*:)",
    re.I,
)
_FORM_FIELD = re.compile(r"^\s*##\s*([^\n#]{3,70})")
_IDENTIFIER_B: tuple[re.Pattern[str], ...] = tuple(
    re.compile(p)
    for p in (
        r"\bBW\s?\d{1,2}\s?[-\u2013]\s?\d{1,2}(?:\.\d{1,2})?\b",
        r"\b(?:A|B|L|K|St)\s?\d{1,4}n?\b",
        r"\bVariante\s+\d{1,2}(?:\.\d{1,2})?\b",
        r"\b\d{1,2}\.\d{1,2}[a-z]?\s?(?:V|A|E|G)(?:CEF|FFH|FCS)?\b",
        r"\b(?:OWK|LRT|RBF|RKB|EA|RQ|Bk|N)\s?\d{1,6}\b",
        r"\bBau-?km\s?\d{1,3}\+\d{3}",
        r"\bDE\s?\d{4}-\d{3}\b",
    )
)


def _identifiers_b(text: str) -> set[str]:
    out: set[str] = set()
    for p in _IDENTIFIER_B:
        out |= {re.sub(r"\s+", "", m).lower() for m in p.findall(text)}
    return out


def _identifiers_differ(fs: list[EvidenceLocation]) -> bool:
    ks = [k for k in (_identifiers_b(norm_ws(f.excerpt)) for f in fs) if k]
    if len(ks) < 2:  # noqa: PLR2004 -- no identifier visible -> template rule may apply
        return True
    return bool(set.union(*ks) - set.intersection(*ks))


def _has_mojibake(fs: list[EvidenceLocation]) -> bool:
    """Any location whose excerpt, or the chunk text right behind it, is glyph-shifted."""
    for f in fs:
        e = norm_ws(f.excerpt)
        if is_mojibake(e):
            return True
        tn = norm_ws(f.chunk_text)
        i = tn.find(e[:PROBE_CHARS])
        if i >= 0 and is_mojibake(tn[i + len(e) : i + len(e) + _MOJIBAKE_LOOKAHEAD_CHARS]):
            return True
    return False


def _same_form_field(fs: list[EvidenceLocation]) -> bool:
    """All locations in the same document under the identical '##' form-field heading."""
    if len({f.document_id for f in fs}) != 1 or len(fs) < 2:  # noqa: PLR2004
        return False
    heads: list[str | None] = []
    for f in fs:
        head: str | None = None
        if norm_ws(f.excerpt)[:50] and norm_ws(f.excerpt)[:50] in norm_ws(f.chunk_text):
            m = _FORM_FIELD.match((f.chunk_text or "").strip())
            if m:
                head = m.group(1).strip().lower()
        heads.append(head)
    if not (all(heads) and len(set(heads)) == 1):
        return False
    return _identifiers_differ(fs)


def _artefact(x: str, y: str) -> bool:
    xs, ys = x.replace(".", "").replace(",", "."), y.replace(".", "").replace(",", ".")
    try:
        return abs(float(xs) - float(ys)) < 1e-9 and x != y  # noqa: PLR2004
    except ValueError:
        return False


def _notation_artefact(fs: list[EvidenceLocation]) -> bool:
    """Only if the excerpts share the word mask and EVERY deviation is a notation artefact."""
    ex = [norm_ws(f.excerpt) for f in fs]
    for a, b in itertools.combinations(ex, 2):
        if mask_numbers(a) != mask_numbers(b):
            continue
        na, nb = NUM.findall(a), NUM.findall(b)
        if len(na) != len(nb) or na == nb:
            continue
        diffs = [(x, y) for x, y in zip(na, nb, strict=True) if x != y]
        if diffs and all(_artefact(x, y) for x, y in diffs):
            return True
    return False


def _identical_quotes(fs: list[EvidenceLocation]) -> bool:
    return len({norm_ws(f.excerpt).lower() for f in fs}) == 1


def _title_block(fs: list[EvidenceLocation]) -> bool:
    return all(_TITLE_BLOCK.search(norm_ws(f.excerpt)) for f in fs)


def gate_reason(fs: list[EvidenceLocation]) -> str | None:
    """First gate rule that rejects the note, or None."""
    rules: tuple[tuple[str, bool], ...] = (
        ("identische-zitate", _identical_quotes(fs)),
        ("schriftfeld", _title_block(fs)),
        ("zeichensalat", _has_mojibake(fs)),
        ("gleiches-formularfeld", _same_form_field(fs)),
        ("notationsartefakt", _notation_artefact(fs)),
    )
    return next((name for name, hit in rules if hit), None)


# ---------------------------------------------------------------------------
# Note score = maximum over evidence pairs
# ---------------------------------------------------------------------------


def _pair_excluded(oa: EvidenceLocation, ob: EvidenceLocation, pages: dict[str, PageContext]) -> bool:
    if trivial_pair(oa, ob):
        return True
    pa = pages.get(f"{oa.document_id}#{oa.page}")
    pb = pages.get(f"{ob.document_id}#{ob.page}")
    if pa and pb and class_conflict(pa.identifiers, pb.identifiers):
        return True
    return version_duplicate(oa, ob)


def score_note(
    v: RubricResponse | None,
    locations: list[EvidenceLocation],
    pages: dict[str, PageContext],
) -> RubricScore:
    """Deterministic note score from the rubric extraction. ``locations`` are prompt-aligned (same order)."""
    if v is None:
        return RubricScore(score=50, grund="Extraktion fehlgeschlagen")
    st = v.stellen
    if len(st) < 2:  # noqa: PLR2004
        return RubricScore(score=30, grund="weniger als zwei Stellen")
    occ = locations[: config.RUBRIC.MAX_LOCATIONS_IN_PROMPT]
    best = RubricScore(score=0, grund="keine Belegpaare")
    for i, j in itertools.combinations(range(len(st)), 2):
        if i < len(occ) and j < len(occ) and _pair_excluded(occ[i], occ[j], pages):
            continue
        a, b = st[i], st[j]
        top = pair_score_strict(a, b, v)
        if top:
            candidate = RubricScore(
                score=top,
                grund="Spitzenstufe",
                art="zahl" if top == config.RUBRIC.SCORE_TOP_NUMERIC else "qualitativ",
            )
        else:
            aa, bb = a, b
            if _value_is_object(a) or _value_is_object(b):
                aa, bb = a.model_copy(update={"gegenstand": ""}), b.model_copy(update={"gegenstand": ""})
            p, g = pair_score(aa, bb, v.unvereinbar)
            candidate = RubricScore(score=min(p, config.RUBRIC.SCORE_CAP_NON_TOP), grund=g)
        if candidate.score > best.score:
            best = candidate
    return best
