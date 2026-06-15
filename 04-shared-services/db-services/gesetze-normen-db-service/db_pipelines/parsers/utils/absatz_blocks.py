"""Shared HTML-block-based Absatz parsing.
"""

import re

from bs4 import Tag

from db_pipelines.parsers.utils.sentence_split import smart_split_sentences
from db_pipelines.schemas.db import Satz

# non-breaking space character
NBSP = "\xa0"

_MARKER_STRIP_RE = re.compile(r"[\.\)]+$")

# Trailing list-item punctuation that should not survive into a complete
# sentence: comma/semicolon/colon plus any whitespace. The closing period is
# handled separately because list-item text usually omits it.
_TRAILING_PUNCT_RE = re.compile(r"[,;\s]+$")

_LINKING_WORDS_RE = r"\b(und|oder|sowie)\s*$"

def tag_to_text(tag: Tag) -> str:
    """Render a block tag to normalized text.

    For ``<dl>`` produces one ``"<marker> <body>"`` line per dt/dd pair so the
    rendered absatz_text retains the visible enumeration markers.
    """
    if tag.name == "dl":
        items: list[str] = []
        label = ""
        for child in tag.children:
            if not isinstance(child, Tag):
                continue
            if child.name == "dt":
                label = child.get_text(" ", strip=True).replace(NBSP, " ")
            elif child.name == "dd":
                body = child.get_text(" ", strip=True).replace(NBSP, " ")
                items.append(f"{label} {body}".strip())
                label = ""
        return "\n".join(items)
    return tag.get_text(" ", strip=True).replace(NBSP, " ")


def strip_marker(raw: str) -> str:
    """Normalise a dt marker: '1.' → '1', 'a)' → 'a', '–' → '–', '1. –' → '1. –'."""
    return _MARKER_STRIP_RE.sub("", raw.strip())


def dl_to_saetze(
    dl: Tag,
    intro: str,
    parent_markers: list[str],
    satz_id_start: int,
) -> list[Satz]:
    """Recursively parse a <dl> into Satz objects, all with satz_nr=1.

    Each <dt>/<dd>+ group (a <dt> followed by one or more sibling <dd>s)
    becomes one logical item. Within a group, <dd>s before a nested <dl>
    contribute to the intro text, the nested <dl> recurses with that combined
    intro, and any <dd>s after it become a shared suffix appended to each
    recursed item. Duplicate dt markers (e.g. all '–') are disambiguated
    with a numeric prefix before being cleaned.
    """
    # Group children into (dt_marker, [dd, ...]). Multiple sibling dd's after
    # a single dt belong to the same logical item
    groups: list[tuple[str, list[Tag]]] = []
    current_dt: str | None = None
    current_dds: list[Tag] = []
    for child in dl.children:
        if not isinstance(child, Tag):
            continue
        if child.name == "dt":
            if current_dt is not None or current_dds:
                groups.append((current_dt or "", current_dds))
            current_dt = child.get_text(" ", strip=True).replace(NBSP, " ")
            current_dds = []
        elif child.name == "dd":
            current_dds.append(child)
    if current_dt is not None or current_dds:
        groups.append((current_dt or "", current_dds))

    raw_markers = [g[0] for g in groups]
    if len(raw_markers) > 1 and len(set(raw_markers)) == 1:
        disambiguated = [f"{i + 1}. {raw_markers[0]}" for i in range(len(raw_markers))]
    else:
        disambiguated = raw_markers

    result: list[Satz] = []
    satz_id = satz_id_start

    for (_, dds), raw_marker in zip(groups, disambiguated):
        marker = strip_marker(raw_marker)
        markers = parent_markers + [marker]

        # Find a nested <dl> as a direct child of one of the dd siblings.
        inner_dl: Tag | None = None
        inner_dl_dd_index: int | None = None
        for i, dd in enumerate(dds):
            nested = dd.find("dl", recursive=False)
            if nested is not None:
                inner_dl = nested
                inner_dl_dd_index = i
                break

        if inner_dl is not None:
            # Split dds into before/after the dd that carries the nested dl.
            # Inside the carrier dd itself, also collect text before/after the
            # nested dl element.
            before_parts: list[str] = []
            after_parts: list[str] = []
            assert inner_dl_dd_index is not None
            for dd in dds[:inner_dl_dd_index]:
                t = dd.get_text(" ", strip=True).replace(NBSP, " ")
                if t:
                    before_parts.append(t)
            carrier = dds[inner_dl_dd_index]
            past_inner = False
            for c in carrier.children:
                if not isinstance(c, Tag):
                    continue
                if c is inner_dl:
                    past_inner = True
                    continue
                t = c.get_text(" ", strip=True).replace(NBSP, " ")
                if not t:
                    continue
                (after_parts if past_inner else before_parts).append(t)
            for dd in dds[inner_dl_dd_index + 1 :]:
                t = dd.get_text(" ", strip=True).replace(NBSP, " ")
                if t:
                    after_parts.append(t)

            before_text = _TRAILING_PUNCT_RE.sub("", " ".join(before_parts).strip())
            inner_suffix = " ".join(after_parts).strip()
            # intro keeps a trailing ":" intentionally (e.g. "aufgeteilt in:"
            # leads into the list items), only drop commas/whitespace.
            # intro_clean = re.sub(r",\s*$", "", intro).rstrip()
            intro_clean = _TRAILING_PUNCT_RE.sub("", intro).rstrip()
            inner_intro = (intro_clean + " " + before_text).strip() if intro_clean else before_text

            sub_saetze = dl_to_saetze(inner_dl, inner_intro, markers, satz_id)

            if inner_suffix:
                clean_suffix = _TRAILING_PUNCT_RE.sub("", inner_suffix.rstrip(".")).rstrip()
                for s in sub_saetze:
                    txt = _TRAILING_PUNCT_RE.sub("", s.satz_text.rstrip(".")).rstrip()
                    txt = re.sub(_LINKING_WORDS_RE, "", txt, flags=re.IGNORECASE).strip()
                    s.satz_text = f"{txt} {clean_suffix}"
                    if not s.satz_text.endswith("."):
                        s.satz_text += "."

            result.extend(sub_saetze)
            satz_id += len(sub_saetze)
        else:
            simple_text = " ".join(
                t for t in (dd.get_text(" ", strip=True).replace(NBSP, " ") for dd in dds) if t
            )
            item_text = _TRAILING_PUNCT_RE.sub("", simple_text.strip())
            item_text = re.sub(_LINKING_WORDS_RE, "", item_text, flags=re.IGNORECASE).strip()
            intro_clean = re.sub(r",\s*$", "", intro).rstrip() if intro else ""
            sentence = (intro_clean + " " + item_text).strip() if intro_clean else item_text
            if not sentence.endswith("."):
                sentence += "."
            result.append(Satz(satz_id=satz_id, satz_nr=1, markers=markers, satz_text=sentence))
            satz_id += 1

    return result


def parse_absatz_blocks(prefix: str, blocks: list[Tag]) -> list[Satz]:
    """Parse an absatz's HTML content blocks into Satz objects.

    `prefix` is the text that follows the '(N)' marker in the opening <p>.
    <dl> blocks are parsed structurally via dl_to_saetze; any <p> blocks
    after the first <dl> become numbered continuation sentences. <p> blocks
    with no preceding <dl> accumulate into a plain-text absatz that is
    sentence-split with smart_split_sentences.

    A <p> block immediately after a <dl> whose first sentence starts with a
    lowercase letter is treated as a shared endtext: that first sentence is
    appended as a suffix to each list item, and any remaining sentences
    become numbered continuation sentences.
    """
    saetze: list[Satz] = []
    satz_id = 1
    intro = prefix
    dl_seen = False
    continuation_nr = 2
    pending_dl_indices: list[int] = []

    for block in blocks:
        if block.name == "dl":
            dl_saetze = dl_to_saetze(block, intro, [], satz_id)
            start = len(saetze)
            saetze.extend(dl_saetze)
            satz_id += len(dl_saetze)
            dl_seen = True
            intro = ""
            pending_dl_indices = list(range(start, len(saetze)))
        else:
            text = tag_to_text(block)
            if not text:
                continue
            if dl_seen:
                sentences = smart_split_sentences(text)
                if pending_dl_indices and sentences and sentences[0][:1].islower():
                    suffix = re.sub(r"\.\s*$", "", sentences[0]).strip()
                    if suffix:
                        for idx in pending_dl_indices:
                            s = saetze[idx]
                            txt = _TRAILING_PUNCT_RE.sub("", s.satz_text.rstrip(".")).rstrip()
                            txt = re.sub(_LINKING_WORDS_RE, "", txt, flags=re.IGNORECASE).strip()
                            s.satz_text = f"{txt} {suffix}"
                            if not s.satz_text.endswith("."):
                                s.satz_text += "."
                    sentences = sentences[1:]
                pending_dl_indices = []
                for sent in sentences:
                    sent = sent.strip()
                    if not sent.endswith("."):
                        sent += "."
                    if sent == ".":
                        continue
                    saetze.append(Satz(satz_id=satz_id, satz_nr=continuation_nr, satz_text=sent))
                    satz_id += 1
                    continuation_nr += 1
            else:
                intro = (intro + " " + text).strip() if intro else text

    if not dl_seen:
        nr = 1
        for sent in smart_split_sentences(intro):
            sent = sent.strip()
            if not sent.endswith("."):
                sent += "."
            if sent == ".":
                continue
            saetze.append(Satz(satz_id=satz_id, satz_nr=nr, satz_text=sent))
            satz_id += 1
            nr += 1

    return saetze
