"""freetext sentence splitting"""

import logging
import re
from typing import Any

from db_pipelines.schemas.db import Satz

logger = logging.getLogger(__name__)


def get_absatz_nr(absatz: str | None) -> tuple[str, str]:
    """extracts the absatz number from a string
    (assuming it starts with `(number)`) and returns
    a tuple of (absatz_nr, absatz_text)"""
    if absatz is None:
        raise ValueError("absatz is None")
    stripped = absatz.strip()
    absatz_nr_match = re.match(r"^\((\d+\w?)\)", stripped)
    if absatz_nr_match is None:
        raise ValueError(f"can't find absatz nr for absatz: {absatz}")
    absatz_nr = absatz_nr_match.group(1)
    # black is adding a space before `:`? skip formatting
    clean_absatz = stripped[absatz_nr_match.end():].strip()  # fmt: skip
    return (absatz_nr, clean_absatz)


def smart_split_sentences(text: str) -> list[str]:
    """
    Split a German text into sentences more intelligently than a simple period split.

    This function separates text into sentences based on periods ('.'), but
    avoids incorrect splits caused by:
    - Month names (e.g., "1. Januar", "5. Februar", ...), which may appear after periods.
    - Words written entirely in uppercase (ABl. EG Nr. L 182 S. 1).
    - Legal references (e.g., "Art. 22", "BGBl. I S. 1440", "4 BImSchV")
    """
    # German month names to avoid splitting after dates
    months = [
        "Januar",
        "Februar",
        "März",
        "April",
        "Mai",
        "Juni",
        "Juli",
        "August",
        "September",
        "Oktober",
        "November",
        "Dezember",
    ]

    pattern = (
        # split at `.`
        r"\.\s+"
        # not before a letter or word directly ending with a `.`
        r"(?!\w+\.)"
        # not before a number or roman numeral like `BGBl. II`
        r"(?![IVXLCDM]+\b)"
        # Not after abbreviations like "Art. 22" or "Art. 19a"
        r"(?!\d+[a-z]?\b)"
        # not before numbered law references like "4. BImSchV"
        r"(?![A-Z]\w+[VG])"
        # not before all caps words (like "ABl. EG Nr. L 182 S. 1", "BGBL. FN 310-4")
        r"(?![A-ZÄÖÜ]+\b)"
        # not before month
        r"(?!(?:" + "|".join(months) + r")\b)"
        # followed by capital or paragraph sign?)
        r"(?=[A-ZÄÖÜ§])"
    )

    parts = re.split(pattern, text)
    return [p.strip() for p in parts if p.strip()]


def parse_hierarchical_listing(text: str) -> dict[str, Any]:
    """
    Parse a hierarchical legal listing using indentation and markers
    to reconstruct a nested data structure.

    This function is designed to process legal documents that use indentation
    and marker patterns such as:
    - Numbered items: ``1.``, ``2.``, ...
    - Lettered sub-items: ``a)``, ``b)``, ...

    The parser uses indentation (leading spaces) to infer nesting depth, allowing it to
    correctly associate subpoints with their parent clauses.
    The output is a hierarchical representation that separates introductory
    text from the main enumerated structure.

    Regular expressions are used to detect specific structural markers:
    - **number_re**: Matches numeric markers like ``1.``, ``2.``, etc.
    - **letter_re**: Matches letter markers like ``a)``, ``B)``, or ``aa)``.
    (case-insensitive)
    - **colon_text_re**: Matches lines starting with a colon followed
    by text (``: explanation``), which typically continues a previous item.

    The resulting nested dictionary reflects the structure of the original text, with
    separate handling for introductory (non-itemized) content.

    Returns a dict:
    {
      "intro": "...",
      "items": [ {number:..., text:..., subitems:[ ... ]}, ... ]
    }
    """
    # Regexes
    number_re = re.compile(r"^\s*(\d+)\.\s*$")
    # letters: one or more letters followed by ')', case-insensitive
    letter_re = re.compile(r"^\s*([a-zA-Z]{1,2})\)\s*$")
    colon_text_re = re.compile(r"^\s*:\s*(.+)$")

    result = {"intro": "", "items": []}
    intro_lines: list[str] = []

    # stack of tuples: (list_of_items_at_level, indent_of_that_level)
    # root level is result["items"] with indent -1
    stack: list[tuple] = [(result["items"], -1)]

    current_item = None  # the most recent item (dict) to attach text to

    lines = text.splitlines()
    for raw in lines:
        # keep raw for indentation detection,
        # but work with a trimmed version for matching
        indent = len(raw) - len(raw.lstrip(" "))
        line = raw.strip()

        if not line:
            continue

        # matchers (use line, which is stripped)
        m_num = number_re.match(line)
        m_let = letter_re.match(line)
        m_col = colon_text_re.match(line)

        if m_num:
            # new numbered item — place at appropriate level
            # (pop until stack indent < indent)
            num = m_num.group(1)
            # pop levels with indent >= this indent
            while stack and stack[-1][1] >= indent:
                stack.pop()
            parent_list = stack[-1][0]
            item = {"number": num, "text": "", "subitems": []}
            parent_list.append(item)
            # push this item's subitems onto stack (child container) with this indent
            stack.append((item["subitems"], indent))
            current_item = item
            continue

        elif m_let:
            # letter marker
            letter = m_let.group(1)
            # pop levels with indent >= this indent (so siblings remain at same parent)
            while stack and stack[-1][1] >= indent:
                stack.pop()
            parent_list = stack[-1][0]
            item = {"letter": letter, "text": "", "subitems": []}
            parent_list.append(item)
            # push this letter's subitems as a new level
            # (so deeper nested markers would go inside)
            stack.append((item["subitems"], indent))
            current_item = item
            continue

        elif m_col:
            txt = m_col.group(1).strip()
            if current_item is None:
                intro_lines.append(txt)
            else:
                current_item["text"] = (
                    current_item.get("text", "") + " " + txt
                ).strip()
                current_item["text"] = re.sub(
                    r"\b(und|oder)\s*$", "", current_item["text"], flags=re.IGNORECASE
                )
                # strip trailing whitespace
                current_item["text"] = current_item["text"].rstrip()
            continue

        else:
            if current_item is None:
                # No numbered or lettered items have been found yet.
                # This line belongs to the introductory section before the first item.
                intro_lines.append(line)
            else:
                # We are inside a list of items, but this line doesn't have
                # a new marker. Such unmarked lines are often shared explanatory
                # text that applies to all items at the current indentation level
                # (common in legal documents), so attach this line to
                # every item (sibling) at the current level.
                if len(stack) > 0:
                    current_level_list = stack[-2][0]  # get list of sibling items
                    for item in current_level_list:
                        # Get current text and remove trailing commas/spaces
                        text = item.get("text", "")
                        text = re.sub(r"[,\s]+$", "", text)

                        # Concatenate and clean up
                        item["text"] = (text + " " + line).strip()

    result["intro"] = " ".join(intro_lines).strip()
    return result


SUB_ITEM_SEPERATOR = "."


def flatten_to_sentences(parsed_dict: dict[str, str]) -> list[tuple[str, str]]:
    """
    Flatten a parsed legal listing into a list of tuples (satz_nr, text).
    Concatenates text from intro -> numbers -> letters -> subletters etc.
    Returns list of (numbering_path, complete_sentence).
    """
    # seperating char for satz_nr concatenation
    sentences = []

    def recurse(prefix, items, numbering_path=""):
        for item in items:
            # Build numbering path
            if "number" in item:
                current_nr = (
                    f"{numbering_path}{item['number']}"
                    if numbering_path
                    else item["number"]
                )
            elif "letter" in item:
                current_nr = (
                    f"{numbering_path}{item['letter']}"
                    if numbering_path
                    else item["letter"]
                )
            else:
                current_nr = numbering_path

            # get current level text
            text = item.get("text", "").strip()
            current_sentence = (prefix + " " + text).strip()

            subitems = item.get("subitems", [])
            if subitems:
                recurse(current_sentence, subitems, current_nr + SUB_ITEM_SEPERATOR)
            else:
                sentences.append((current_nr, current_sentence))

    intro = parsed_dict.get("intro", "").strip()
    items = parsed_dict.get("items", [])
    if not items:
        return [("", intro)] if intro else []

    recurse(intro, items)
    return sentences


def clean_sentences(sentences: list[tuple[str, str]]) -> list[tuple[str, str]]:
    """Clean sentences while preserving their numbering."""
    cleaned = []
    for satz_nr, s in sentences:
        s = s.strip()

        # 1. remove trailing commas
        s = re.sub(r",\s*$", "", s)

        # 2. remove trailing 'und' or 'oder'
        s = re.sub(r"\b(und|oder)\s*$", "", s, flags=re.IGNORECASE)

        # 3. remove spaces before punctuation (like " .")
        s = s.rstrip()

        # 4. ensure full stop at the end if none present
        if not re.search(r"[.!?]$", s):
            s += "."

        cleaned.append((satz_nr, s.strip()))

    return cleaned


def process_absatz(absatz_text: str) -> list[Satz]:
    """Process an absatz string into a list of Satz objects."""
    sentences = smart_split_sentences(absatz_text)
    sentences = [s if s.endswith(".") else f"{s}." for s in sentences if s]
    result_sentence_list = []
    satz_id_counter = 1

    for sentence in sentences:
        # Check if the sentence contains any listing
        pattern1 = r"\d\.\s*:"
        pattern2 = r"\w\)\s*:"
        sequence_found = re.search(pattern1, sentence) or re.search(pattern2, sentence)

        if sequence_found:
            sentences_dict = parse_hierarchical_listing(sentence)
            raw_sentence_list = flatten_to_sentences(sentences_dict)
            clean_sentence_list = clean_sentences(raw_sentence_list)

            for satz_nr, satz_text in clean_sentence_list:
                if satz_nr:
                    satz_nr_split = satz_nr.split(SUB_ITEM_SEPERATOR)
                    try:
                        satz_nr_int = int(satz_nr_split[0])
                        satz_nr_markers = satz_nr_split[1:]
                    # sometimes we don't get satz_nr?
                    except ValueError:
                        satz_nr_int = satz_id_counter
                        satz_nr_markers = satz_nr_split
                else:
                    satz_nr_int = satz_id_counter
                    satz_nr_markers = None
                result_sentence_list.append(
                    Satz(
                        satz_id=satz_id_counter,
                        satz_nr=satz_nr_int,
                        markers=satz_nr_markers or [],
                        satz_text=satz_text,
                    )
                )
                satz_id_counter += 1
        else:
            result_sentence_list.append(
                Satz(
                    satz_id=satz_id_counter,
                    satz_nr=satz_id_counter,
                    markers=[],
                    satz_text=sentence,
                )
            )
            satz_id_counter += 1

    return result_sentence_list
