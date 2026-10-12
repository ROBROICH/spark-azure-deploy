"""Object identifiers in planning documents, in project-independent structural forms:

``kuerzel``     capital abbreviation + number: ``RRB 3``, ``BE 1``, ``LSW 2``, ``BW 3.06``,
                ``EA 12``, ``A 9``, ``V 11``, ``DE 1234-567`` (class = the abbreviation)
``schluessel``  keyword + number: ``Maßnahme 4.3``, ``Maßnahmen-Nr. 6.2a ACEF``, ``Variante 2``,
                ``Bauwerk 7``, ``Abschnitt 3``, ``Flurstück 112``, ``Becken 2``, ``Immissionsort 14``
                (class = canonical keyword)
``station``     chainage ``Bau-km 3+300`` (class = ``km``)
``art``         Latin species name ``Columba oenas`` (class = ``art``)
``name``        hyphenated proper name ``ABC-Musterfeld`` (class = ``name``)

plus page-header forms (``betroffene Art …``, ``Artsteckbrief …``, ``Nachweis (…)``).
"""

from __future__ import annotations

import re

# Abbreviations that look like identifiers but are units, norms, legal or typographic references.
_BLOCKLIST = frozenset(
    {
        "ABB",
        "ABS",
        "ART",
        "BGBL",
        "BIMSCHV",
        "BK",
        "DB",
        "DIN",
        "DN",
        "DTV",
        "EN",
        "EUR",
        "GVBL",
        "KAP",
        "KFZ",
        "KN",
        "LKW",
        "MW",
        "NR",
        "NRW",
        "OGEWV",
        "PKW",
        "RQ",
        "S",
        "SV",
        "TAB",
        "UVPG",
        "WHG",
        "Z",
    }
)

_ABBREVIATION = re.compile(r"(?<![\w./-])([A-ZÄÖÜ]{1,4})[\s\u00a0]?(\d{1,4}(?:[.,+/-]\d{1,4}){0,3}[a-z]?)(?![\w%])")
_KEY = re.compile(
    r"\b(Ma(?:ß|ss)nahmen?(?:[- ]?Nr\.?)?|Variante|Bauwerk(?:s[- ]?Nr\.?)?|Abschnitt|Flurst(?:ü|ue)ck|Messstelle"
    r"|Probefl(?:ä|ae)che|Immissionsort|Entw(?:ä|ae)sserungsabschnitt|Bezugsraum|Konflikt|Becken|Unterlage|Anlage"
    r"|Blatt|Kartenblatt|Baufeld|Teilfl(?:ä|ae)che|Knotenpunkt|Anschlussstelle)"
    r"[\s\u00a0]+([A-Z]?[\s\u00a0]?\d{1,4}(?:[.,/-]\d{1,3}){0,2}[a-z]?)(?:[\s\u00a0]?(ACEF|AFCS|AFFH|CEF|FCS|FFH))?\b",
    re.I,
)
_STATION = re.compile(r"\bBau-?km[\s\u00a0]?(\d{1,3})\+(\d{3})(?:[.,]\d+)?\b", re.I)
_SPECIES = re.compile(r"\b([A-Z][a-z]{3,})[\s\u00a0](?!aus\b|des\b|der\b)([a-z]{4,}(?:us|is|or|ix|um|ae|ii))\b")
_NAME = re.compile(r"\b([A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,}(?:-[A-ZÄÖÜ][A-Za-zÄÖÜäöüß]{1,})+)\b")
_AFFECTED_SPECIES = re.compile(r"betroffene[\s\u00a0]+Art[\s\u00a0]+([A-ZÄÖÜ][\wÄÖÜäöüß\- ]{2,40}?)[\s\u00a0]*\(")
_SPECIES_PROFILE = re.compile(r"Artsteckbrief[\s\u00a0]+([A-ZÄÖÜ][\wÄÖÜäöüß\-]{2,30})")
_DETECTION = re.compile(r"Nachweis[^\n:]{0,60}?\(([^)]{3,60})\)")
_YEAR = re.compile(r"^(?:19|20)\d\d$")

_KEY_CANON = {
    "massnahme": "MASSNAHME",
    "variante": "VARIANTE",
    "bauwerk": "BW",
    "abschnitt": "ABSCHNITT",
    "flurstueck": "FLURSTUECK",
    "messstelle": "MESSSTELLE",
    "probeflaeche": "PROBEFLAECHE",
    "immissionsort": "IO",
    "entwaesserungsabschnitt": "EA",
    "bezugsraum": "BEZUGSRAUM",
    "konflikt": "KONFLIKT",
    "becken": "BECKEN",
    "unterlage": "UNTERLAGE",
    "anlage": "ANLAGE",
    "blatt": "BLATT",
    "kartenblatt": "BLATT",
    "baufeld": "BE",
    "teilflaeche": "TEILFLAECHE",
    "knotenpunkt": "KNOTEN",
    "anschlussstelle": "AS",
}


def _canon_key(word: str) -> str:
    w = word.lower().replace("ß", "ss").replace("ä", "ae").replace("ö", "oe").replace("ü", "ue")
    w = re.sub(r"[-\s]?nr\.?$", "", w).rstrip("n")  # "maßnahmen-nr." -> "massnahme"
    for k, v in _KEY_CANON.items():
        if w.startswith(k.rstrip("n")):
            return v
    return w.upper()


def _num(n: str) -> str:
    return re.sub(r"[\s\u00a0]", "", n).upper()


def identifier_classes(text: str | None) -> dict[str, set[str]]:
    """Identifier values per class found in ``text``."""
    t = text or ""
    out: dict[str, set[str]] = {}

    def add(klasse: str, value: str) -> None:
        if value:
            out.setdefault(klasse, set()).add(value)

    for m in _ABBREVIATION.finditer(t):
        k, n = m.group(1).upper(), m.group(2)
        if k in _BLOCKLIST or (len(k) == 1 and k not in "ABLKVEGS") or _YEAR.match(n):
            continue
        add(k, _num(n))
    for m in _KEY.finditer(t):
        k = _canon_key(m.group(1))
        add(k, _num(m.group(2)) + (f" {m.group(3).upper()}" if m.group(3) else ""))
    for m in _STATION.finditer(t):
        add("KM", f"{int(m.group(1))}+{m.group(2)}")
    for m in _SPECIES.finditer(t):
        add("ART", f"{m.group(1)} {m.group(2)}".lower())
    for m in _AFFECTED_SPECIES.finditer(t):
        add("STECKBRIEF", m.group(1).strip().lower())
    for m in _SPECIES_PROFILE.finditer(t):
        add("STECKBRIEF", m.group(1).strip().lower())
    for m in _DETECTION.finditer(t):
        add("NACHWEIS", re.sub(r"\s+", " ", m.group(1)).strip().lower())
    for m in _NAME.finditer(t):
        add("NAME", m.group(1).lower())
    return out


def identifiers(text: str | None) -> set[str]:
    """Flat, normalised identifier set (``"<class> <value>"``)."""
    return {f"{k} {v}" for k, vs in identifier_classes(text).items() for v in vs}


def normalise_object(objekt: str | None) -> set[str]:
    """Identifiers of a model-extracted object name; falls back to the normalised name itself."""
    if not objekt:
        return set()
    ids = identifiers(objekt)
    if ids:
        return ids
    name = re.sub(r"[^\wäöüß ]+", " ", objekt.lower())
    name = re.sub(r"\s+", " ", name).strip()
    return {f"OBJ {name}"} if len(name) >= 4 else set()  # noqa: PLR2004


# Classes shared by whole chapters never count as evidence that two locations name the same object.
# Document references still count: a wrong reference is itself an inconsistency.
REFERENT_EXCLUSIONS = frozenset({"NAME", "ANLAGE", "BLATT", "ABSCHNITT"})


def referents(text: str | None) -> set[str]:
    """Identifiers that may serve as referent evidence (see ``REFERENT_EXCLUSIONS``)."""
    return {i for i in identifiers(text) if i.split(" ", 1)[0] not in REFERENT_EXCLUSIONS}


# Instance rule (pre-filter): only explicit sheet-header forms may reject a pair, never generic
# abbreviations in running text ("BW 3-15", "Maßnahme A 4.3"), which also occur outside sheet headers.
_TEMPLATE_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "MASSNAHME",
        re.compile(r"Ma(?:ß|ss)nahmen[- ]?Nr\.?\s*((?:\d+\.\d+[a-zA-Z]?\s*(?:ACEF|AFCS|AFFH|CEF|FCS|FFH|A|E|V)?\s*)+)"),
    ),
    ("STECKBRIEF", _AFFECTED_SPECIES),
    ("STECKBRIEF", _SPECIES_PROFILE),
    ("NACHWEIS", _DETECTION),
    ("BW", re.compile(r"Bauwerk(?:s)?[- ]?Nr\.?\s*([\d./\-]+)")),
    ("VARIANTE", re.compile(r"\bVariante\s+(V\s?\d+[a-z]?)\b")),
)
TEMPLATE_CLASSES = frozenset(k for k, _ in _TEMPLATE_PATTERNS)


def template_identifiers(text: str | None) -> dict[str, list[str]]:
    """Template-instance identifiers from page headers (sorted lists, JSON-friendly)."""
    out: dict[str, set[str]] = {}
    for klasse, rx in _TEMPLATE_PATTERNS:
        for m in rx.finditer(text or ""):
            value = re.sub(r"\s+", " ", m.group(1)).strip(" .,;:").upper()
            if value:
                out.setdefault(klasse, set()).add(value)
    return {k: sorted(v) for k, v in out.items()}


def class_conflict(
    a: dict[str, set[str]] | dict[str, list[str]], b: dict[str, set[str]] | dict[str, list[str]]
) -> str | None:
    """Template class present on both sides with disjoint values (two instances of one template), or None."""
    for klasse in sorted(set(a) & set(b)):
        if klasse not in TEMPLATE_CLASSES:
            continue
        va, vb = set(a[klasse]), set(b[klasse])
        if va and vb and not (va & vb):
            return klasse
    return None
