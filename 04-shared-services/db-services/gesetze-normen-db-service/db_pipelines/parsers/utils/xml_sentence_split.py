import re
from xml.etree.ElementTree import Element

from db_pipelines.parsers.utils.sentence_split import get_absatz_nr, smart_split_sentences
from db_pipelines.parsers.utils.xml import xml_html_elem_to_md
from db_pipelines.schemas.db import Absatz, Satz


def extract_last_text_from_dl(elem):
    last = elem.text or ""

    for child in elem:
        # recurse into child
        t = extract_last_text_from_dl(child)
        if t.strip():
            last = t
        # child's tail counts too
        if child.tail and child.tail.strip():
            last = child.tail

    return last


def split_absatz_into_xml_fragments(p_elem) -> list[Element]:
    fragments = []

    def clone(elem):
        new = Element(elem.tag, elem.attrib)
        new.text = elem.text
        new.tail = elem.tail
        for child in elem:
            new.append(clone(child))
        return new

    # Step 1: extract top-level sequence (text / DL)
    parts = []

    def append_text(text: str) -> None:
        """Add `text` to the running text run instead of starting a new part.

        Every part is sentence-split on its own, so starting a new one cuts the
        sentence at that point. Inline markup may sit inside a single word -
        `CO<SUB>2</SUB>-Preis` - where a cut is plainly wrong.
        """
        if not text:
            return
        if parts and parts[-1][0] == "text":
            parts[-1] = ("text", parts[-1][1] + text)
        elif text.strip():
            parts.append(("text", text))

    if p_elem.text and p_elem.text.strip():
        parts.append(("text", p_elem.text))

    for child in p_elem:
        if child.tag == "FnR":
            continue

        if child.tag == "DL":
            parts.append(("dl", child))
        else:
            append_text("".join(child.itertext()))

        if child.tail:
            append_text(child.tail)

    i = 0
    while i < len(parts):
        kind, content = parts[i]

        if kind == "text":
            sentences = smart_split_sentences(content)
            for s in sentences:
                p = Element("P")
                p.text = s
                fragments.append(p)
            i += 1
            continue

        if kind == "dl":
            dl_elem = content

            # --- PRECEDING TEXT (last sentence) ---
            prev_sentence = ""
            if i > 0 and parts[i - 1][0] == "text":
                prev_sentences = smart_split_sentences(parts[i - 1][1])
                if prev_sentences:
                    prev_sentence = prev_sentences[-1]

            # --- FOLLOWING TEXT (first sentence) ---
            next_sentence = ""
            if i + 1 < len(parts) and parts[i + 1][0] == "text":
                next_sentences = smart_split_sentences(parts[i + 1][1])
                if next_sentences:
                    next_sentence = next_sentences[0]

            # Trailing text is a shared endtext (continues every item) unless
            # it visibly starts a new sentence — i.e. with an uppercase letter
            # or a `§` paragraph sign. A leading lowercase letter, parenthesis
            # or similar marks it as a continuation (e.g. "(Zugriffsverbote).").
            first_char = next_sentence[:1]
            starts_new_sentence = first_char.isupper() or first_char == "§"
            merge_next = bool(next_sentence) and not starts_new_sentence

            # --- NEW P containing prev + DL + maybe next ---
            new_p = Element("P")

            if prev_sentence:
                new_p.text = prev_sentence + " "
            else:
                new_p.text = ""

            cloned = clone(dl_elem)
            new_p.append(cloned)

            if merge_next:
                cloned.tail = (" " + next_sentence) if next_sentence else ""
            else:
                cloned.tail = ""

            if prev_sentence and fragments:
                # only remove if the last fragment matches the prev sentence
                if fragments[-1].text == prev_sentence:
                    fragments.pop()

            fragments.append(new_p)

            # Skip next text block if consumed
            if not merge_next:
                i += 1
            else:
                # Replace the next text block with remaining sentences
                if i + 1 < len(parts) and parts[i + 1][0] == "text":
                    remaining_sentences = smart_split_sentences(parts[i + 1][1])
                    if remaining_sentences:
                        # Drop first sentence (already merged)
                        rest_sentences = remaining_sentences[1:]
                        if rest_sentences:
                            # Join with ". " and ensure final period
                            rest = ". ".join([s.rstrip(".") for s in rest_sentences])
                            rest += "."
                            parts[i + 1] = ("text", rest)
                        else:
                            # Remove empty block
                            parts.pop(i + 1)
                i += 1

    return fragments


def clean_text_for_append(text: str) -> str:
    """
    Clean text before appending: remove trailing commas and conjunctions.

    Args:
        text: Text to clean

    Returns:
        Cleaned text
    """
    if not text:
        return text

    # Remove trailing list-item punctuation (commas/semicolons)
    text = text.rstrip(",;").strip()

    # Remove trailing conjunctions
    conjunctions = ["und", "oder", "sowie"]
    words = text.split()
    if words and words[-1].lower() in conjunctions:
        text = " ".join(words[:-1])

    return text.strip()


def process_p_elements(p_elements: list[Element]) -> list[dict]:
    """
    Process a list of XML <P> elements and create dictionaries for each sentence.

    Args:
        p_elements: List of XML <P> elements to process

    Returns:
        List of dictionaries with keys: satz_nr, text, markers
    """
    results = []

    for idx, p_elem in enumerate(p_elements, start=1):
        if idx > 1:
            idx_ = results[-1]["satz_nr"] + 1
        else:
            idx_ = idx
        sentences = process_single_p(p_elem, idx_)
        results.extend(sentences)

    return results


def end_sentence(text: str) -> str:
    """ensures the sentence ends with a period"""
    text = text.rstrip()
    # If the text ends with a comma, remove it
    if text.endswith(",") or text.endswith(";"):
        text = text[:-1]
    # Now ensure it ends with a period
    if not text.endswith("."):
        text += "."
    return text


def process_single_p(p_elem: Element, satz_nr: int) -> list[dict]:
    """
    Process a single <P> element and generate sentence dictionaries.

    Args:
        p_elem: XML <P> element
        satz_nr: Position of this element in the original list

    Returns:
        List of dictionaries for sentences generated from this <P>
    """
    # Check if this is a simple sentence (no <DL> children)
    dl_elem = p_elem.find("DL")

    if dl_elem is None:
        # Simple sentence - just extract text
        text = get_full_text(p_elem).strip()

        # Ensure sentence ends with a period
        if text:
            text = end_sentence(text)

        return [{"satz_nr": satz_nr, "text": text, "markers": []}]

    # Complex structure with <DL>
    # Get intro text (text before <DL>)
    intro = get_text_before_child(p_elem, "DL").strip()

    # Get outro text (text after <DL>)
    outro = get_text_after_child(p_elem, dl_elem).strip()
    outro = clean_text_for_append(outro)  # ADD THIS LINE

    # Process the <DL> tree to get all sentence paths
    paths = process_dl(dl_elem, [])

    # DL items are variants of a single hierarchical sentence — they share
    # the intro (and outro when present) and therefore share satz_nr.
    sentences = []
    for markers, text_parts in paths:
        full_text = intro
        if full_text and not full_text.endswith(" "):
            full_text += " "
        full_text += " ".join(text_parts)
        if outro:
            if not full_text.endswith(" "):
                full_text += " "
            full_text += outro

        # Ensure sentence ends with a period
        full_text = full_text.strip()
        if full_text:
            full_text = end_sentence(full_text)

        sentences.append({"satz_nr": satz_nr, "text": full_text, "markers": markers})

    return sentences


def process_dl(
    dl_elem: Element, parent_markers: list[str]
) -> list[tuple[list[str], list[str]]]:
    """
    Process a <DL> element recursively to generate all sentence paths.

    Args:
        dl_elem: The <DL> element to process
        parent_markers: List of markers from parent levels

    Returns:
        List of tuples: (markers, text_parts) for each sentence path
    """
    paths = []

    # Get all <DT> children
    dt_elements = dl_elem.findall("DT")

    for i, dt_elem in enumerate(dt_elements):
        marker = dt_elem.text.strip() if dt_elem.text else ""

        # Clean the marker by removing trailing . or )
        if marker.endswith("."):
            marker = marker[:-1]
        elif marker.endswith(")"):
            marker = marker[:-1]
        # Handle ambiguous markers by making them unique
        elif re.match(r"[^\d\w]", marker.strip()):
            marker = f"{i+1}. {marker.strip()}"

        current_markers = parent_markers + [marker]

        # Find the corresponding <DD> (next sibling after <DT>)
        dd_elem = None
        for sibling in dl_elem:
            if sibling == dt_elem:
                continue
            if sibling.tag == "DD" and list(dl_elem).index(sibling) > list(
                dl_elem
            ).index(dt_elem):
                # Check if this DD is the next one after our DT
                between_elements = list(dl_elem)[
                    list(dl_elem).index(dt_elem) + 1 : list(dl_elem).index(sibling)
                ]
                if not any(elem.tag == "DD" for elem in between_elements):
                    dd_elem = sibling
                    break

        if dd_elem is None:
            raise ValueError(f"orphaned marker? (DL {dl_elem.text})")
            continue

        # Concatenate all <LA> texts within this <DD> before processing nested <DL>
        la_elements = dd_elem.findall("LA")

        if not la_elements:
            # No <LA> elements, just get direct text
            text_part = get_direct_text(dd_elem).strip()
            paths.append((current_markers, [text_part] if text_part else []))
            continue

        # Concatenate all LA texts and collect nested DLs
        la_texts = []
        nested_dl = None
        trailing_text = ""

        for la_elem in la_elements:
            # Get text before any nested DL
            la_text_before = get_text_before_child(la_elem, "DL").strip()
            if la_text_before:
                la_texts.append(la_text_before)

            # Check for nested DL
            nested = la_elem.find("DL")
            if nested is not None:
                nested_dl = nested
                # Get trailing text after the nested DL in this LA
                trailing_text = get_text_after_child(la_elem, nested).strip()
                trailing_text = clean_text_for_append(trailing_text)  # ADD THIS LINE

        # Combine all LA texts into one segment
        combined_la_text = " ".join(la_texts).strip()
        combined_la_text = clean_text_for_append(combined_la_text)

        if nested_dl is None:
            # No nested DL, simple case
            paths.append((current_markers, [combined_la_text]))
        else:
            # Process nested DL
            nested_paths = process_dl(nested_dl, current_markers)
            for nested_markers, nested_texts in nested_paths:
                # Build text parts: combined LA text + nested texts + trailing text
                text_parts = []
                if combined_la_text:
                    text_parts.append(combined_la_text)
                text_parts.extend(nested_texts)
                if trailing_text:
                    text_parts.append(trailing_text)

                paths.append((nested_markers, text_parts))

    return paths


def get_full_text(elem: Element) -> str:
    """Get all text content from an element and its children."""
    return "".join(elem.itertext())


def get_direct_text(elem: Element) -> str:
    """Get only the direct text content of an element (not from children)."""
    text = elem.text or ""
    for child in elem:
        if child.tail:
            text += child.tail
    return text


def get_text_before_child(elem: Element, child_tag: str) -> str:
    """Get text content before the first occurrence of a child with given tag."""
    text = elem.text or ""
    for child in elem:
        if child.tag == child_tag:
            break
        text += "".join(child.itertext())
        if child.tail:
            text += child.tail
    return text


def get_text_after_child(elem: Element, child_elem: Element) -> str:
    """Get text content after a specific child element."""
    found = False
    text = ""
    for child in elem:
        if child == child_elem:
            found = True
            if child.tail:
                text += child.tail
            continue
        if found:
            text += "".join(child.itertext())
            if child.tail:
                text += child.tail
    return text


def filter_weggefallen(saetze: list[Satz]) -> list[Satz]:
    """filters satz entries that are marked as `(weggefallen)`"""
    saetze_clean = list(filter(lambda x: "(weggefallen)" not in x.satz_text, saetze))
    return saetze_clean


def process_absatz(absatz: Element) -> Absatz:
    """process xml elementTree into Absatz object"""
    try:
        absatz_nr, clean_text = get_absatz_nr(absatz.text)
        # overwrite with clean string (without absatz_nr)
        absatz.text = clean_text
    except ValueError:
        # this can happen if only absatz or additional text
        # let the parser handle it, we'll marz absatz_nr,
        # but not None, to avoid sqlmodel generating values
        # by accident
        absatz_nr = "null"

    all_fragments = split_absatz_into_xml_fragments(absatz)

    # convert fragments into sentence dicts
    result = process_p_elements(all_fragments)

    saetze = filter_weggefallen(
        [
            Satz(
                satz_id=i,
                satz_nr=d["satz_nr"],
                markers=d["markers"],
                satz_text=d["text"],
            )
            for i, d in enumerate(result, start=1)
        ]
    )
    return Absatz(
        absatz_nr=absatz_nr,
        absatz_text=xml_html_elem_to_md(absatz),
        saetze=saetze,
    )
