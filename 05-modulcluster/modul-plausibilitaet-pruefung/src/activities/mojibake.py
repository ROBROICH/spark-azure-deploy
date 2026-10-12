"""Detection of glyph-shifted text ("Mojibake") from PDF extraction.

Characters shifted by a constant -29 code points (``GHU`` = ``der``) carry no usable claim and are skipped.
A token counts as shifted if reversing the offset yields a plain word. The text is not reversed:
that would also rewrite ordinary abbreviations (DN, RQ) in chunks with one shifted line.
"""

from __future__ import annotations

import re

SHIFT = 29
_SPECIAL = {"l": "ä", "|": "ö", "\x81": "ü", "\x89": "ß"}
_SHIFTABLE = re.compile(r"^[!-\]l|\x81\x89]{3,}$")
_LOWER = re.compile(r"[a-zäöüß]")
_WORD = re.compile(r"^[A-Za-zÄÖÜäöüß]+$")
# A reversed token counts only if it is shaped like a word: all lower case or capitalised.
_WORDSHAPE = re.compile(r"^[A-ZÄÖÜ]?[a-zäöüß]+$")
_TOKEN = re.compile(r"\S+")
_PUNCT = ".,;:!?()[]\"'«»„“"

MIN_SHARE = 0.3
MIN_TOKENS = 3


def _reversed_word(token: str) -> str | None:
    """Reverse the glyph shift for one token; None if the result is not a plain word."""
    if not _SHIFTABLE.match(token):
        return None
    out: list[str] = []
    for ch in token:
        out.append(_SPECIAL[ch] if ch in _SPECIAL else chr(ord(ch) + SHIFT))
    word = "".join(out)
    return word if _WORDSHAPE.match(word) else None


def is_mojibake(text: str | None) -> bool:
    """Is the text dominated by glyph-shifted tokens?"""
    if not text:
        return False
    shifted = 0
    words = 0
    for m in _TOKEN.finditer(text):
        token = m.group(0).strip(_PUNCT)
        if not token:
            continue
        if _reversed_word(token) is not None:
            shifted += 1
        elif _WORD.match(token) and _LOWER.search(token):
            words += 1
    return shifted >= MIN_TOKENS and shifted / (shifted + words) >= MIN_SHARE
