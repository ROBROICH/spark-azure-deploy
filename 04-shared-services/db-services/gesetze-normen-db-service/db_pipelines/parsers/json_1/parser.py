"""
Generic parser for state laws provided as JSON.

this parser is a fallback parser and implements no 'fundstelle', so cannot be updated reliably.
"""

import json
import re
from datetime import date, datetime
from typing import Any

import httpx
from anyascii import anyascii
from db_services_shared.utils.parsing import split_paragraph_nr_str
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)

from db_pipelines.parsers.base_processor import BaseProcessor
from db_pipelines.constants import Bundesland
from db_pipelines.parsers.utils.jurabk import clean_jurabk
from db_pipelines.parsers.utils.sentence_split import smart_split_sentences
from db_pipelines.parsers.utils.time import get_current_time
from db_pipelines.schemas.db import (
    Hierarchy,
    DocType,
    TOC,
    Absatz,
    Anlage,
    Document,
    Footnote,
    Norm,
    ParagraphTyp,
    Satz,
    Standangabe,
)


class JsonProcessor1(BaseProcessor):
    """Generic class for processing laws provided as JSON."""
    _headers: dict[str, str]

    def __init__(self, slug: str, doctype: DocType, hierarchy: Hierarchy, base_url: str, bundesland: Bundesland | None = None, **kwargs: Any) -> None:
        if "headers" in kwargs:
            self._headers = kwargs.pop("headers")
        else:
            raise ValueError("JsonProcessor1 requires 'headers' in kwargs for HTTP requests")
        # source-specific path segments injected via config `extra`; required only for fetching
        self._book_endpoint = kwargs.pop("book_endpoint", None)
        self._overview_data_suffix = kwargs.pop("overview_data_suffix", None)
        super().__init__(slug=slug, doctype=doctype, hierarchy=hierarchy, base_url=base_url, bundesland=bundesland, **kwargs)

    def _get_doc(self) -> dict[str, Any]:
        """Return the locally cached JSON book payload."""
        json_file = self.norm_dir.joinpath(f"{self.slug}.json")
        if not json_file.exists():
            raise FileNotFoundError(f"Cached JSON file not found: {json_file}")
        with open(json_file, encoding="utf-8") as f:
            return json.load(f)

    def fetch_doc(self, overwrite: bool = False) -> None:
        """Override to check for the actual JSON file instead of just the directory."""
        json_file = self.norm_dir.joinpath(f"{self.slug}.json")
        if json_file.exists() and not overwrite:
            self.logger.warn(
                action=EventAction.NOTIFY,
                outcome=EventOutcome.UNKNOWN,
                category=EventCategory.DATABASE,
                default_event=LogEventDefault.GENERAL,
                message=f"Cache found for {self.slug}, skipping download",
            )
            return

        self.norm_dir.mkdir(parents=True, exist_ok=True)
        self._fetch_doc()

    def _fetch_doc(self):
        """Fetch the full JSON book payload via the public data endpoints."""
        route_data = self._fetch_json(self._overview_data_url())
        decoded_route = self._decode_svelte_node(route_data, node_index=1)
        buch_id = self._extract_buch_id(decoded_route)

        if not buch_id:
            raise ValueError(f"Could not determine book id for {self.slug}")

        if not self._book_endpoint:
            raise ValueError("JsonProcessor1 requires 'book_endpoint' in `extra` config for fetching")
        book_data = self._fetch_json(
            f"{self.base_url}{self._book_endpoint}",
            params={"id": buch_id, "t": "0"},
        )

        json_path = self.norm_dir.joinpath(f"{self.slug}.json")
        with open(json_path, "w", encoding="utf-8") as f:
            json.dump(book_data, f, ensure_ascii=False, indent=2)

    def _parse_doc(self, doc: dict[str, Any] | None = None) -> Document:
        """Parse the cached JSON book payload into the internal document model."""
        payload = doc or self._get_doc()

        buch = payload.get("buch") or {}
        normen = sorted(
            payload.get("normen") or [],
            key=lambda item: (item.get("order_index") is None, item.get("order_index") or 0),
        )
        abschnitte = payload.get("abschnitte") or []
        section_by_id = {section["id"]: section for section in abschnitte if section.get("id")}

        full_title = buch.get("titel") or self.slug
        raw_jurabk = buch.get("abkuerzung") or self.slug
        if self.bundesland:
            jurabk = clean_jurabk(raw_jurabk, self.bundesland)
        else:
            jurabk = raw_jurabk.strip()

        # Use the legal jurabk as unique doknr
        unique_doknr = f"{jurabk}_json_1"

        toc_entries: list[TOC] = []
        norms_entries: list[Norm] = []
        anlagen: list[Anlage] = []

        # Deduplication tracker
        seen_norms = set()

        for norm_data in normen:
            bezeichnung = (norm_data.get("bezeichnung") or "").strip()
            if not bezeichnung:
                continue

            paragraph_typ, _ = ParagraphTyp.normalize_prefix(bezeichnung)
            section_id = norm_data.get("abschnitt_id") or ""
            section_label = self._build_section_label(section_by_id, section_id)

            if paragraph_typ == ParagraphTyp.ANLAGE:
                anlage = self._build_anlage(norm_data, jurabk)
                if anlage is not None:
                    anlage.doknr = unique_doknr
                    anlagen.append(anlage)
                    toc_entries.append(
                        TOC(
                            doknr=unique_doknr,
                            jurabk=jurabk,
                            Ident=section_id,
                            Title=section_label,
                            paragraph_nr=bezeichnung,
                            paragraph_typ=ParagraphTyp.ANLAGE,
                            text=anlage.title,
                        )
                    )
                continue

            paragraph_ref = self._extract_paragraph_ref(bezeichnung)
            if paragraph_typ is None or paragraph_ref is None:
                continue

            paragraph_nr, sub_paragraph_nr = split_paragraph_nr_str(paragraph_ref)
            if not isinstance(paragraph_nr, int):
                continue

            # Deduplicate by primary key components
            norm_key = (jurabk, paragraph_nr, sub_paragraph_nr or "")
            if norm_key in seen_norms:
                continue
            seen_norms.add(norm_key)

            content_json = norm_data.get("content_json") or []
            # footnote ids are namespaced per norm so they are globally unique;
            # extract also strips the element so it is not rendered in the text
            fussnoten = self._extract_fussnoten(
                content_json,
                jurabk=jurabk,
                paragraph_nr=paragraph_nr,
                sub_paragraph_nr=sub_paragraph_nr or "",
            )
            norm_extra: dict[str, Any] = {}
            # if fussnoten:
            #     norm_extra["fussnoten"] = fussnoten

            paragraph_text = self._clean_block_text(
                self._render_nodes(content_json) or norm_data.get("content")
            )
            absaetze = self._build_absaetze(
                norm_data=norm_data,
                jurabk=jurabk,
                paragraph_nr=paragraph_nr,
                sub_paragraph_nr=sub_paragraph_nr or "",
            )

            norms_entries.append(
                Norm(
                    doknr=unique_doknr,
                    jurabk=jurabk,
                    paragraph_typ=paragraph_typ,
                    paragraph_nr=paragraph_nr,
                    sub_paragraph_nr=sub_paragraph_nr or "",
                    titel=norm_data.get("titel") or bezeichnung,
                    paragraph_text=paragraph_text,
                    absaetze=absaetze,
                    **norm_extra,
                )
            )
            toc_entries.append(
                TOC(
                    doknr=unique_doknr,
                    jurabk=jurabk,
                    Ident=section_id,
                    Title=section_label,
                    paragraph_nr=paragraph_ref,
                    paragraph_typ=paragraph_typ,
                    text=norm_data.get("titel") or bezeichnung,
                )
            )

        ausfertigung_datum, fundstelle, standangaben = self._parse_buch_metadata(buch)

        extra: dict[str, Any] = {}
        if standangaben:
            extra["standangaben"] = standangaben

        return Document(
            doknr=unique_doknr,
            hierarchy=self.hierarchy,
            bundesland=self.bundesland.name if self.bundesland else None,
            builddate=get_current_time(),
            jurabk=jurabk,
            kurzue=anyascii(buch.get("kurztitel") or full_title),
            langue=anyascii(full_title),
            doktyp=self.doctype,
            ausfertigung_datum=ausfertigung_datum,
            # this source does not have a reliable 'fundstelle' field,
            # but is only used as a fallback
            fundstelle=fundstelle or "",
            toc=toc_entries,
            normen=norms_entries,
            anlagen=anlagen,
            **extra,
        )

    def _overview_data_url(self) -> str:
        category = None
        if self.bundesland:
            category = self.bundesland.name
        elif self.hierarchy == Hierarchy.BUND:
            category = "DE"
        elif self.hierarchy == Hierarchy.EU:
            category = "EU"
        else:
            raise ValueError(f"Unsupported hierarchy {self.hierarchy.value} for JsonProcessor1")
        if not self._overview_data_suffix:
            raise ValueError("JsonProcessor1 requires 'overview_data_suffix' in `extra` config for fetching")
        return f"{self.base_url}/{category}/{self.slug}/{self._overview_data_suffix}"

    def _fetch_json(self, url: str, params: dict[str, str] | None = None) -> dict[str, Any]:
        response = httpx.get(url, headers=self._headers, params=params, timeout=30.0)
        if response.status_code != 200:
            raise ValueError(f"Could not fetch data from {response.url}, status: {response.status_code}")
        return response.json()

    @staticmethod
    def _decode_svelte_node(payload: dict[str, Any], node_index: int = 1) -> dict[str, Any]:
        """Decode the flattened route data node payload."""
        nodes = payload.get("nodes")
        if not isinstance(nodes, list) or len(nodes) <= node_index:
            raise ValueError("Invalid route payload: missing node data")

        data = nodes[node_index].get("data")
        if not isinstance(data, list) or not data:
            raise ValueError("Invalid route payload: missing flattened data")

        cache: dict[int, Any] = {}

        def resolve_field(value: Any) -> Any:
            if type(value) is int:
                if value < 0:
                    return None
                return resolve_ref(value)
            if isinstance(value, list):
                return [resolve_field(item) for item in value]
            if isinstance(value, dict):
                return {key: resolve_field(item) for key, item in value.items()}
            return value

        def resolve_ref(index: int) -> Any:
            if index in cache:
                return cache[index]

            try:
                entry = data[index]
            except IndexError as exc:
                raise ValueError(f"Invalid route payload: broken reference {index}") from exc

            if isinstance(entry, list):
                resolved: list[Any] = []
                cache[index] = resolved
                resolved.extend(resolve_field(item) for item in entry)
                return resolved

            if isinstance(entry, dict):
                dict_resolved: dict[Any, Any] = {}
                cache[index] = dict_resolved
                dict_resolved.update({key: resolve_field(item) for key, item in entry.items()})
                return dict_resolved

            cache[index] = entry
            return entry

        decoded = resolve_ref(0)
        if not isinstance(decoded, dict):
            raise ValueError("Invalid route payload: decoded root is not an object")
        return decoded

    @staticmethod
    def _extract_buch_id(decoded_route: dict[str, Any]) -> str | None:
        views = decoded_route.get("views") or []
        if not views:
            return None
        buch = views[0].get("buch") or {}
        return buch.get("id")

    @staticmethod
    def _extract_paragraph_ref(bezeichnung: str) -> str | None:
        match = re.match(r"^(?:§+|Art\.?|Artikel)\s*([0-9]+[a-zA-Z]*)\b", bezeichnung.strip())
        if match is None:
            return None
        return match.group(1)

    def _build_absaetze(
        self,
        norm_data: dict[str, Any],
        jurabk: str,
        paragraph_nr: int,
        sub_paragraph_nr: str,
    ) -> list[Absatz]:
        content_json = norm_data.get("content_json") or []
        absatz_nodes = [
            node
            for node in content_json
            if isinstance(node, dict) and node.get("type") == "Abschnitt" and node.get("abschnittType") == "Absatz"
        ]

        if absatz_nodes:
            absaetze = []
            for index, absatz_node in enumerate(absatz_nodes, start=1):
                absatz_nr = self._clean_absatz_nr(absatz_node.get("abschnittNr")) or str(index)
                absatz_text = self._clean_block_text(self._render_node(absatz_node, strip_absatz_marker=True))
                if not absatz_text:
                    continue

                absaetze.append(
                    Absatz(
                        jurabk=jurabk,
                        paragraph_nr=paragraph_nr,
                        sub_paragraph_nr=sub_paragraph_nr,
                        absatz_nr=absatz_nr,
                        absatz_text=absatz_text,
                        saetze=self._saetze_from_absatz_node(absatz_node),
                    )
                )

            if absaetze:
                return absaetze

        # Top-level Satz nodes (no Absatz wrapper): satzNr acts as the leading marker (¹/²/³).
        top_satz_nodes = [
            n for n in content_json if isinstance(n, dict) and n.get("type") == "Satz"
        ]
        if top_satz_nodes:
            absatz_text = self._clean_block_text(self._render_nodes(content_json))
            if absatz_text:
                return [
                    Absatz(
                        jurabk=jurabk,
                        paragraph_nr=paragraph_nr,
                        sub_paragraph_nr=sub_paragraph_nr,
                        absatz_nr="1",
                        absatz_text=absatz_text,
                        saetze=self._saetze_from_satz_list(top_satz_nodes),
                    )
                ]

        fallback_text = self._clean_block_text(norm_data.get("content") or self._render_nodes(content_json))
        if not fallback_text:
            return []

        return [
            Absatz(
                jurabk=jurabk,
                paragraph_nr=paragraph_nr,
                sub_paragraph_nr=sub_paragraph_nr,
                absatz_nr="1",
                absatz_text=fallback_text,
                saetze=self._saetze_from_plain_text(fallback_text),
            )
        ]

    def _parse_buch_metadata(
        self, buch: dict[str, Any]
    ) -> tuple[date | None, str | None, list[Standangabe]]:
        """Extract ausfertigung_datum, fundstelle, and standangaben from buch.content."""
        content = buch.get("content") or ""

        datum = None
        m = re.search(r"Ausfertigungsdatum\s+(\d{2}\.\d{2}\.\d{4})", content)
        if m:
            try:
                datum = datetime.strptime(m.group(1), "%d.%m.%Y").date()
            except ValueError:
                pass

        fundstelle = None
        m = re.search(r"Fundstelle:\s*(.+?)(?:\n|$)", content)
        if m:
            fundstelle = m.group(1).strip()

        standangaben: list[Standangabe] = []
        for m in re.finditer(
            r"(Neuf|Stand|Sonst|Hinweis|Textnachweis|Außerkraft):\s*(.+?)(?=\n\n|\Z)",
            content,
            re.DOTALL,
        ):
            standangaben.append(
                Standangabe(standtyp=m.group(1).strip(), standkommentar=m.group(2).strip())
            )

        return datum, fundstelle, standangaben

    # ── sentence building from structured content_json ──────────────────────

    _LIST_TYPES = frozenset(("Nummer", "Buchstabe", "Doppelbuchstabe", "Unknown"))

    def _saetze_from_absatz_node(self, absatz_node: dict[str, Any]) -> list[Satz]:
        """Build Satz objects directly from an Absatz content_json node."""
        satz_nodes = [
            c for c in (absatz_node.get("children") or []) if c.get("type") == "Satz"
        ]
        return self._process_satz_nodes(satz_nodes, satz_nr_as_marker=False)

    def _saetze_from_satz_list(self, satz_nodes: list[dict[str, Any]]) -> list[Satz]:
        """Build Satz objects from top-level Satz nodes, using satzNr as the leading marker."""
        return self._process_satz_nodes(satz_nodes, satz_nr_as_marker=True)

    def _process_satz_nodes(
        self, satz_nodes: list[dict[str, Any]], *, satz_nr_as_marker: bool
    ) -> list[Satz]:
        result: list[Satz] = []
        satz_id = 1
        for satz_node in satz_nodes:
            satz_nr = satz_node.get("satzNr") or satz_id
            new_saetze = self._saetze_from_satz_node(
                satz_node, satz_nr, satz_id, satz_nr_as_marker=satz_nr_as_marker
            )
            result.extend(new_saetze)
            satz_id += len(new_saetze)
        return result

    def _saetze_from_satz_node(
        self,
        satz_node: dict[str, Any],
        satz_nr: int,
        satz_id_start: int,
        *,
        satz_nr_as_marker: bool = False,
    ) -> list[Satz]:
        """Build Satz objects from a single Satz content_json node."""
        children = satz_node.get("children") or []

        inline_parts: list[str] = []
        list_items: list[dict[str, Any]] = []
        suffix_parts: list[str] = []
        found_list = False

        for child in children:
            child_type = child.get("type")
            if child_type == "Text" and not found_list:
                inline_parts.append(self._render_parts(child.get("parts") or []))
            elif child_type == "Abschnitt" and child.get("abschnittType") in self._LIST_TYPES:
                found_list = True
                list_items.append(child)
            elif child_type == "Text" and found_list:
                suffix_parts.append(self._render_parts(child.get("parts") or []))

        if not list_items:
            saetze = self._saetze_from_plain_satz(children, satz_nr, satz_id_start)
            return saetze

        intro = self._clean_inline_text("".join(inline_parts))
        suffix = self._clean_inline_text("".join(suffix_parts))
        leaf_sentences = self._flatten_list_items(list_items, intro, suffix, [])

        return [
            Satz(
                satz_id=satz_id_start + i,
                satz_nr=satz_nr,
                markers=markers,
                satz_text=text,
            )
            for i, (markers, text) in enumerate(leaf_sentences)
        ]

    def _saetze_from_plain_satz(
        self, children: list[dict[str, Any]], satz_nr: int, satz_id_start: int
    ) -> list[Satz]:
        """Build Satz objects for a plain (non-list) Satz node via smart sentence splitting."""
        raw_text = self._render_sentence_children(children)
        text = self._clean_inline_text(raw_text)
        sentences = smart_split_sentences(text) if text else []
        result: list[Satz] = []
        for i, sent in enumerate(sentences):
            if not re.search(r"[.!?]$", sent):
                sent += "."
            result.append(
                Satz(
                    satz_id=satz_id_start + i,
                    satz_nr=satz_nr + (i if len(sentences) > 1 else 0),
                    markers=list[str](),
                    satz_text=sent,
                )
            )
        return result

    def _saetze_from_plain_text(self, text: str) -> list[Satz]:
        """Build Satz objects from a plain fallback text string."""
        sentences = smart_split_sentences(text) if text else []
        result: list[Satz] = []
        for i, sent in enumerate(sentences, start=1):
            if not re.search(r"[.!?]$", sent):
                sent += "."
            result.append(Satz(satz_id=i, satz_nr=i, markers=list[str](), satz_text=sent))
        return result

    def _flatten_list_items(
        self,
        items: list[dict[str, Any]],
        intro: str,
        outer_suffix: str,
        path: list[str],
    ) -> list[tuple[list[str], str]]:
        """Recursively flatten Abschnitt list nodes into (marker_path, sentence_text) pairs."""
        raw_nrs = [(item.get("abschnittNr") or "").strip() for item in items]
        if len(raw_nrs) > 1 and len(set(raw_nrs)) == 1:
            markers = [f"{i + 1}. {raw_nrs[0]}" for i in range(len(items))]
        else:
            markers = [self._clean_marker(nr) for nr in raw_nrs]

        result: list[tuple[list[str], str]] = []
        for item, marker in zip(items, markers):
            current_path = path + [marker]
            item_children = item.get("children") or []

            item_inline: list[str] = []
            sub_items: list[dict[str, Any]] = []
            item_suffix_parts: list[str] = []
            found_sub = False

            for child in item_children:
                child_type = child.get("type")
                if child_type == "Text" and not found_sub:
                    item_inline.append(self._render_parts(child.get("parts") or []))
                elif child_type == "Abschnitt" and child.get("abschnittType") in self._LIST_TYPES:
                    found_sub = True
                    sub_items.append(child)
                elif child_type == "Text" and found_sub:
                    item_suffix_parts.append(self._render_parts(child.get("parts") or []))

            item_text = self._clean_inline_text("".join(item_inline))
            item_suffix = self._clean_inline_text("".join(item_suffix_parts))

            sub_intro = self._join_prefix_parts([intro, item_text])
            combined_suffix = " ".join(p for p in [item_suffix, outer_suffix] if p)

            if sub_items:
                result.extend(
                    self._flatten_list_items(sub_items, sub_intro, combined_suffix, current_path)
                )
            else:
                text = self._assemble_sentence([sub_intro, combined_suffix])
                result.append((current_path, text))

        return result

    @staticmethod
    def _clean_marker(nr: str) -> str:
        """Strip trailing punctuation from an abschnittNr to get a clean marker."""
        s = nr.strip()
        if s.endswith(".") or s.endswith(")"):
            return s[:-1]
        return s

    @staticmethod
    def _join_prefix_parts(parts: list[str]) -> str:
        """Join text parts for a sub-intro, stripping trailing commas/semicolons between them."""
        cleaned = []
        for p in parts:
            p = re.sub(r"[,;]\s*$", "", p.strip()).rstrip()
            if p:
                cleaned.append(p)
        return " ".join(cleaned)

    @staticmethod
    def _assemble_sentence(parts: list[str]) -> str:
        """Join parts into a final sentence: strip trailing commas, linking words, add period."""
        non_empty = [p.strip() for p in parts if p and p.strip()]
        if not non_empty:
            return ""
        result_parts = []
        for i, p in enumerate(non_empty):
            if i < len(non_empty) - 1:
                p = re.sub(r"[,;]\s*$", "", p).rstrip()
            result_parts.append(p)
        text = re.sub(r"\s+", " ", " ".join(result_parts)).strip()
        text = re.sub(r"\b(und|oder)\s*$", "", text, flags=re.IGNORECASE).rstrip()
        if not re.search(r"[.!?]$", text):
            text += "."
        return text

    def _extract_fussnoten(
        self,
        content_json: list[dict[str, Any]],
        jurabk: str,
        paragraph_nr: int,
        sub_paragraph_nr: str,
    ) -> list[Footnote]:
        result: list[Footnote] = []
        # iterate over a copy: the loop removes footnote nodes from content_json,
        # and mutating the list being iterated would skip the following node
        for node in list(content_json):
            if node.get("type") == "Paratext" and node.get("titel") == "Fußnote":
                text = self._clean_inline_text(
                    self._render_nodes(node.get("children") or [])
                )
                if text:
                    result.append(
                        Footnote(
                            # Footnote.id_ is the table primary key. There is no
                            # source id, so build a globally unique one from the
                            # norm key (jurabk + paragraph) plus a per-norm seq;
                            # a bare sequence collides across norms and laws.
                            id_=f"{jurabk}_{paragraph_nr}{sub_paragraph_nr}_{len(result) + 1}",
                            text=text,
                            jurabk=jurabk,
                            paragraph_nr=paragraph_nr,
                            sub_paragraph_nr=sub_paragraph_nr,
                        )
                    )
                # remove footnote node to avoid rendering in paragraph_text
                content_json.remove(node)
        return result

    def _build_anlage(self, norm_data: dict[str, Any], jurabk: str) -> Anlage | None:
        content = self._clean_block_text(
            norm_data.get("content") or self._render_nodes(norm_data.get("content_json") or [])
        )
        if not content:
            return None

        bezeichnung = (norm_data.get("bezeichnung") or "").strip()
        titel = (norm_data.get("titel") or "").strip()
        if titel and titel != bezeichnung:
            title = f"{bezeichnung} – {titel}"
        else:
            title = bezeichnung or titel or "Anlage"

        return Anlage(jurabk=jurabk, title=title, content=content)

    def _build_section_label(self, section_by_id: dict[str, dict[str, Any]], section_id: str) -> str:
        if not section_id:
            return ""

        labels = []
        current = section_by_id.get(section_id)
        while current is not None:
            label = self._format_section_label(current)
            if label:
                labels.append(label)
            parent_id = current.get("parent_id")
            current = section_by_id.get(parent_id) if parent_id else None

        return " > ".join(reversed(labels))

    @staticmethod
    def _format_section_label(section: dict[str, Any]) -> str:
        parts = [
            (section.get("bezeichnung") or "").strip(),
            (section.get("titel") or "").strip(),
        ]
        return " – ".join(part for part in parts if part)

    def _render_nodes(self, nodes: list[dict[str, Any]]) -> str:
        chunks = []
        for node in nodes:
            text = self._render_node(node)
            if text:
                chunks.append(text)
        return self._clean_block_text("\n\n".join(chunks))

    def _render_node(
        self, node: dict[str, Any], strip_absatz_marker: bool = False, indent: int = 4
    ) -> str:
        node_type = node.get("type")

        if node_type == "Text":
            return self._render_parts(node.get("parts") or [])

        if node_type == "Satz":
            return self._render_sentence_children(node.get("children") or [], indent=indent)

        if node_type == "Abschnitt":
            abschnitt_nr = (node.get("abschnittNr") or "").strip()
            abschnitt_type = node.get("abschnittType")

            if abschnitt_type in self._LIST_TYPES:
                return self._render_list_node(node, abschnitt_nr, indent)

            # Absatz or other block wrapper
            prefix = ""
            if not strip_absatz_marker and abschnitt_nr:
                prefix = f"{abschnitt_nr} "
            body = self._render_nodes(node.get("children") or [])
            return f"{prefix}{body}".strip()

        if node_type == "Paratext":
            return ""  # footnotes are extracted separately via _extract_fussnoten

        children = node.get("children") or []
        if children:
            return self._render_nodes(children)

        return ""

    def _render_list_node(self, node: dict[str, Any], abschnitt_nr: str, indent: int = 4) -> str:
        """Render a Nummer/Buchstabe/Unknown list node with consistent 4-space indentation."""
        line_prefix = " " * indent
        marker = f"{abschnitt_nr} " if abschnitt_nr else ""

        inline_parts: list[str] = []
        sub_items: list[dict[str, Any]] = []
        suffix_parts: list[str] = []
        found_sub = False

        for child in node.get("children") or []:
            child_type = child.get("type")
            if child_type == "Text" and not found_sub:
                inline_parts.append(self._render_parts(child.get("parts") or []))
            elif child_type == "Abschnitt" and child.get("abschnittType") in self._LIST_TYPES:
                found_sub = True
                sub_items.append(child)
            elif child_type == "Text" and found_sub:
                suffix_parts.append(self._render_parts(child.get("parts") or []))

        inline_text = self._clean_inline_text("".join(inline_parts))
        suffix_text = self._clean_inline_text("".join(suffix_parts))

        first_line = f"{line_prefix}{marker}{inline_text}".rstrip()
        if not sub_items:
            return first_line

        sub_indent = "    " * (indent + 1)
        lines = [first_line]
        for sub in sub_items:
            lines.append(self._render_node(sub, indent=indent + 1))
        if suffix_text:
            lines.append(f"{sub_indent}{suffix_text}".rstrip())
        return "\n\n".join(line for line in lines if line)

    def _render_sentence_children(
        self, children: list[dict[str, Any]], indent: int = 4
    ) -> str:
        inline_parts: list[str] = []
        block_parts: list[str] = []

        for child in children:
            if child.get("type") == "Text" and not block_parts:
                child_text = self._render_node(child)
                if child_text:
                    inline_parts.append(child_text)
            else:
                child_text = self._render_node(child, indent=indent)
                if child_text:
                    block_parts.append(child_text)

        inline_text = self._clean_inline_text("".join(inline_parts))
        if not block_parts:
            return inline_text

        block_text = re.sub(r"[ \t]+$", "", "\n".join(block_parts), flags=re.MULTILINE)
        if inline_text:
            return f"{inline_text}\n{block_text}"
        return block_text

    @staticmethod
    def _render_parts(parts: list[dict[str, Any]]) -> str:
        return "".join((part.get("content") or "") for part in parts)

    @staticmethod
    def _clean_absatz_nr(absatz_nr: str | None) -> str:
        if not absatz_nr:
            return ""
        match = re.match(r"^\(([^)]+)\)$", absatz_nr.strip())
        if match is not None:
            return match.group(1).strip()
        return absatz_nr.strip()

    @staticmethod
    def _clean_inline_text(text: str) -> str:
        text = text.replace("\xa0", " ")
        text = re.sub(r"[ \t]+", " ", text)
        return text.strip()

    @staticmethod
    def _clean_block_text(text: str) -> str:
        # Strip Unicode superscript digits used as Satznummern (¹ ² ³ etc.)
        if not text:
            return ""
        text = re.sub(r"[⁰¹²³⁴⁵⁶⁷⁰⁹-]+[ \t]*", "", text)
        text = text.replace("\xa0", " ")
        text = re.sub(r"[ \t]+\n", "\n", text)
        text = re.sub(r"(?<=\S)[ \t]{2,}", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()
