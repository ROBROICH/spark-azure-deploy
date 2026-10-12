"""Markdown generation from docling JSON structure."""

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from src.providers.docling.furniture_detector import FurnitureDetector, FurnitureRefs
from src.providers.docling.transforms import resolve_json_ref

logger = logging.getLogger(__name__)

# Re-export for backward compatibility
__all__ = ["FurnitureDetector", "FurnitureRefs", "MarkdownBuilder"]

_GENERIC_CAPTION_PATTERNS = {
    "image",
    "picture",
    "figure",
    "bild",
    "abbildung",
    "grafik",
    "foto",
}


@dataclass
class _BuildContext:
    """Shared mutable state for markdown building."""

    doc_json: dict[str, Any]
    output_parts: list[str] = field(default_factory=list)
    picture_counter: int = 0
    table_counter: int = 0
    current_page: int = 0
    images_by_ref: dict[str, dict[str, Any]] = field(default_factory=dict)
    tables_by_ref: dict[str, dict[str, Any]] = field(default_factory=dict)
    images_by_index: dict[int, dict[str, Any]] = field(default_factory=dict)
    tables_by_index: dict[int, dict[str, Any]] = field(default_factory=dict)
    texts_with_picture_parent: set[str] = field(default_factory=set)
    furniture_table_refs: set[str] = field(default_factory=set)
    furniture_picture_refs: set[str] = field(default_factory=set)
    furniture_text_refs_by_position: set[str] = field(default_factory=set)


def _get_element_page(element: dict[str, Any]) -> int:
    """Get page number from element's prov array."""
    prov = element.get("prov", [])
    if prov and isinstance(prov, list) and len(prov) > 0:
        return prov[0].get("page_no", 1)
    return 1


def _maybe_insert_page_marker(element: dict[str, Any], ctx: _BuildContext) -> None:
    """Insert page marker if we've moved to a new page."""
    element_page = _get_element_page(element)
    if element_page > ctx.current_page:
        ctx.output_parts.append(f'\n<seite nummer="{element_page}" />\n')
        ctx.current_page = element_page


def _extract_caption(element: dict[str, Any], doc_json: dict[str, Any]) -> str:
    """Extract caption text from element's caption refs."""
    for cap_ref in element.get("captions", []):
        cap_element = resolve_json_ref(doc_json, cap_ref)
        if cap_element and cap_element.get("text"):
            return cap_element.get("text", "")
    return ""


def _is_generic_caption(caption: str) -> bool:
    """Check if a caption is a generic/placeholder like 'Image', 'Bild 3', etc."""
    caption_lower = caption.lower().strip()
    return any(
        caption_lower == pattern or caption_lower.startswith(f"{pattern} ") for pattern in _GENERIC_CAPTION_PATTERNS
    )


def _process_text(element: dict[str, Any], self_ref: str, level: int, ctx: _BuildContext) -> None:
    """Handle a /texts/ element."""
    if self_ref in ctx.furniture_text_refs_by_position:
        logger.debug(f"Skipping text in header/footer region by position: {self_ref}")
        return

    text = element.get("text", "")
    if not text:
        return

    _maybe_insert_page_marker(element, ctx)
    md_text = MarkdownBuilder._format_text_element(element, level)
    if md_text:
        ctx.output_parts.append(md_text)


def _process_table(element: dict[str, Any], self_ref: str, ctx: _BuildContext) -> None:
    """Handle a /tables/ element."""
    ctx.table_counter += 1

    if self_ref in ctx.furniture_table_refs:
        logger.debug(f"Skipping furniture table: {self_ref}")
        return

    _maybe_insert_page_marker(element, ctx)

    # Try to find matching table metadata
    table_info = ctx.tables_by_ref.get(self_ref)
    if not table_info:
        idx = int(self_ref.split("/")[-1]) if "/" in self_ref else ctx.table_counter - 1
        table_info = ctx.tables_by_index.get(idx, {})

    caption = _extract_caption(element, ctx.doc_json)

    img_path = table_info.get("img_path", "")
    html_content = table_info.get("html", "")

    # Output caption as text (preserves document reading flow)
    if caption:
        ctx.output_parts.append(f"\n{caption}\n")

    # Build TABELLE tag with caption_text inside for VLM metadata processing
    # Caption appears both in text AND inside tag for structured extraction
    caption_tag = f"\n<caption_text>{caption}</caption_text>" if caption else ""

    if img_path:
        if html_content:
            ctx.output_parts.append(
                f'\n<TABELLE img_path="images/{img_path}">{caption_tag}\n{html_content}\n</TABELLE>\n'
            )
        else:
            ctx.output_parts.append(f'\n<TABELLE img_path="images/{img_path}">{caption_tag}\n</TABELLE>\n')
    elif html_content:
        # No image but have HTML
        ctx.output_parts.append(f"\n<TABELLE>{caption_tag}\n{html_content}\n</TABELLE>\n")


def _process_picture(element: dict[str, Any], self_ref: str, ctx: _BuildContext) -> None:
    """Handle a /pictures/ element."""
    ctx.picture_counter += 1

    if self_ref in ctx.furniture_picture_refs:
        logger.debug(f"Skipping furniture picture: {self_ref}")
        return

    _maybe_insert_page_marker(element, ctx)

    # Try to find matching image metadata
    img_info = ctx.images_by_ref.get(self_ref)
    if not img_info:
        idx = int(self_ref.split("/")[-1]) if "/" in self_ref else ctx.picture_counter - 1
        img_info = ctx.images_by_index.get(idx, {})

    filename = img_info.get("filename", "")
    if not filename:
        return

    # Get caption from docling JSON, fallback to images_meta
    caption = _extract_caption(element, ctx.doc_json) or img_info.get("caption", "")

    # Use caption as alt_text only if it's meaningful (not generic)
    # Don't output caption as separate text - VLM will extract it from context
    alt_text = caption if caption and not _is_generic_caption(caption) else f"Image {ctx.picture_counter}"
    ctx.output_parts.append(f"\n![{alt_text}](images/{filename})\n")


def _process_children(
    element: dict[str, Any],
    self_ref: str,
    level: int,
    ctx: _BuildContext,
    process_element_fn: Callable[[Any, int], None],
) -> None:
    """Process children for non-group elements, skipping caption children."""
    children = element.get("children", [])
    if not children or "/groups/" in self_ref:
        return

    for child_ref in children:
        child = resolve_json_ref(ctx.doc_json, child_ref)  # pyrefly: ignore[unbound-name]
        if child and child.get("label") == "caption":
            continue
        process_element_fn(child_ref, level + 1)


class MarkdownBuilder:
    """Builds custom markdown from docling JSON structure."""

    @staticmethod
    def build(
        doc_json: dict[str, Any],
        images_meta: list[dict[str, Any]],
        tables_meta: list[dict[str, Any]],
        skip_picture_refs: set[str] | None = None,
    ) -> str:
        """
        Build custom markdown from docling JSON structure.

        Walks the document body in reading order and outputs:
        - Text elements as markdown
        - Tables as <TABELLE> tags with image references
        - Pictures as ![Image](path) references
        - Page markers (<seite nummer="X" />) at page boundaries

        Filters out:
        - Headers and footers (content_layer: "furniture")
        - Text OCR'd from within pictures (children of picture elements)

        Args:
            doc_json: Document JSON from doc.export_to_dict()
            images_meta: Our extracted image metadata (with self_ref)
            tables_meta: Our extracted table metadata (with self_ref)
            skip_picture_refs: Pictures deliberately left without an image --
                recurring page furniture, or a crop that could not be produced.
                They are skipped rather than falling through to the positional
                lookup, which would attach a different picture's file.

        Returns:
            Custom markdown string with page markers
        """
        # Detect furniture elements (headers/footers) to filter
        furniture = FurnitureDetector.detect(doc_json)

        ctx = _BuildContext(
            doc_json=doc_json,
            images_by_ref={img["self_ref"]: img for img in images_meta if img.get("self_ref")},
            tables_by_ref={tbl["self_ref"]: tbl for tbl in tables_meta if tbl.get("self_ref")},
            images_by_index=dict(enumerate(images_meta)),
            tables_by_index=dict(enumerate(tables_meta)),
            texts_with_picture_parent=furniture.texts_with_picture_parent,
            furniture_table_refs=furniture.furniture_table_refs,
            furniture_picture_refs=furniture.furniture_picture_refs | (skip_picture_refs or set()),
            furniture_text_refs_by_position=furniture.furniture_text_refs_by_position,
        )

        # Get the body structure
        body = doc_json.get("body", {})
        if not body:
            logger.warning("No body found in document JSON")
            return ""

        def process_element(ref: str, level: int = 0) -> None:
            """Recursively process an element and its children."""
            # Get the ref string for filtering
            ref_str = ref.get("$ref", "") if isinstance(ref, dict) else str(ref)

            # Skip if this text element has a picture parent (OCR'd text from image)
            if ref_str in ctx.texts_with_picture_parent:
                logger.debug(f"Skipping text with picture parent: {ref_str}")
                return

            element = resolve_json_ref(doc_json, ref)
            if element is None:
                return

            self_ref = element.get("self_ref", "")
            label = element.get("label", "").lower()
            content_layer = element.get("content_layer", "").lower()

            # Skip furniture (headers/footers)
            is_furniture = content_layer == "furniture" or label in {
                "page_footer",
                "page_header",
                "page-footer",
                "page-header",
            }
            if is_furniture:
                logger.debug(f"Skipping furniture element: {self_ref} ({label}, {content_layer})")
                return

            # Dispatch to type handlers
            if "/texts/" in self_ref:
                _process_text(element, self_ref, level, ctx)
            elif "/tables/" in self_ref:
                _process_table(element, self_ref, ctx)
            elif "/pictures/" in self_ref:
                _process_picture(element, self_ref, ctx)
            elif "/groups/" in self_ref:
                for child_ref in element.get("children", []):
                    process_element(child_ref, level + 1)

            # Process children for non-group elements
            _process_children(element, self_ref, level, ctx, process_element)

        # Process body children in order
        for child_ref in body.get("children", []):
            process_element(child_ref)

        return "\n".join(ctx.output_parts)

    @staticmethod
    def _format_text_element(element: dict[str, Any], level: int = 0) -> str:
        """
        Format a text element as markdown.

        Args:
            element: Text element from docling JSON
            level: Nesting level for indentation

        Returns:
            Formatted markdown string
        """
        text = element.get("text", "")
        if not text:
            return ""

        label = element.get("label", "").lower()

        # Handle different text types
        if label in ["title", "document_title"]:
            return f"\n# {text}\n"
        if label in ["section_header", "section-header"]:
            # Determine header level based on text or default to h2
            return f"\n## {text}\n"
        if label in ["subtitle"]:
            return f"\n### {text}\n"
        if label == "caption":
            # Captions are usually handled with their parent element
            return f"\n*{text}*\n"
        if label == "list_item":
            marker = element.get("marker", "-")
            return f"{marker} {text}"
        if label in ["footnote"]:
            return f"\n[^]: {text}\n"
        if label in ["page_header", "page_footer", "page-header", "page-footer"]:
            # Skip headers/footers or include as comments
            return ""
        # Default paragraph
        return f"\n{text}\n"
