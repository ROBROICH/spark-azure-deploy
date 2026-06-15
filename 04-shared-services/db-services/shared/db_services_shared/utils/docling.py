"""Docling API client"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from pydantic import BaseModel, HttpUrl

# check if httpx is installed, otherwise raise an error with instructions
try:
    import httpx
except ImportError as e:
    raise ImportError(
        "please install the `docling` extra to use this feature."
    ) from e

logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class DoclingConfig(BaseModel):
    """docling API config"""

    HOST: HttpUrl = HttpUrl("http://docling.test")
    TOKEN_URL: HttpUrl | None
    CLIENT_ID: str | None = None
    CLIENT_SECRET: str | None = None
    TIMEOUT: int = 600


@dataclass
class Prov:
    """Provenance info for a text item."""

    page_no: int | None


@dataclass
class TextItem:
    """A single text element from the docling document."""

    text: str
    label: str
    prov: list[Prov] = field(default_factory=list)


@dataclass
class Section:
    """A document section with title and text items."""

    title: str
    texts: list[TextItem]


def _parse_texts(doc_json: dict[str, Any]) -> list[TextItem]:
    """Parse text items from docling document JSON."""
    result = []
    for item in doc_json.get("texts", []):
        label = item.get("label", "")
        text = item.get("text", "") or item.get("orig", "")
        provs = [Prov(page_no=p.get("page_no")) for p in item.get("prov", [])]
        result.append(TextItem(text=text, label=label, prov=provs))
    return result


class DoclingApiDoc:
    """Wrapper around the docling-serve API JSON response."""

    def __init__(self, result: dict[str, Any]) -> None:
        self._result = result
        doc_data = result.get("document", {})
        self._md_content: str = doc_data.get("md_content", "")
        self._doc_json: dict[str, Any] = doc_data.get("json_content", {})
        self._texts: list[TextItem] | None = None

    def export_to_markdown(self) -> str:
        return self._md_content

    @property
    def texts(self) -> list[TextItem]:
        if self._texts is None:
            self._texts = _parse_texts(self._doc_json)
        return self._texts


class DoclingException(Exception):
    """Custom exception for docling-related errors."""
    pass


def _get_auth_headers(cfg: DoclingConfig) -> dict[str, str]:
    """Fetch a Keycloak token and return Authorization header, or {} if not configured."""
    if not (cfg.TOKEN_URL and cfg.CLIENT_ID and cfg.CLIENT_SECRET):
        return {}

    response = httpx.post(
        str(cfg.TOKEN_URL),
        data={
            "grant_type": "client_credentials",
            "client_id": cfg.CLIENT_ID,
            "client_secret": cfg.CLIENT_SECRET,
        },
        timeout=30.0,
    )
    response.raise_for_status()
    token: str = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def pdf_to_doc(input_path: str | Path, config: DoclingConfig) -> DoclingApiDoc:
    """Convert a PDF to DoclingApiDoc via the docling-serve API and cache the result."""
    input_path = input_path if isinstance(input_path, Path) else Path(input_path)
    logger.info(f"Processing via docling API: {input_path}")

    try:
        with open(input_path, "rb") as f:
            pdf_bytes = f.read()

        url = str(config.HOST).rstrip("/")
        headers = _get_auth_headers(config)

        with httpx.Client(timeout=config.TIMEOUT) as client:
            response = client.post(
                f"{url}/v1/convert/file",
                headers=headers,
                files={"files": (input_path.name, pdf_bytes, "application/pdf")},
                data={"to_formats": ["md", "json"], "table_mode": "accurate"},
            )
        response.raise_for_status()
        result: dict[str, Any] = response.json()

        status = result.get("status", "")
        if status == "failure":
            raise DoclingException(f"Docling API conversion failed for {input_path}")
        if status == "skipped":
            raise DoclingException(f"Docling API conversion skipped for {input_path}")

        # Cache result so re-runs skip the API call
        cache_path = input_path.with_suffix(".docling")
        with open(cache_path, "w", encoding="utf-8") as f:
            json.dump(result, f, ensure_ascii=False, indent=2)

        return DoclingApiDoc(result)

    except Exception as exc:
        logger.error(f"could not convert {input_path} via docling API", exc_info=True)
        raise exc


def load_cached_doc(input_path: str | Path) -> DoclingApiDoc:
    """Read a previously cached DoclingApiDoc from a JSON file."""
    logger.info(f"Loading cached DoclingApiDoc from {input_path}")
    with open(input_path, "r", encoding="utf-8") as f:
        result: dict[str, Any] = json.load(f)
    return DoclingApiDoc(result)


def extract_sections_from_doc(doc: DoclingApiDoc) -> list[Section]:
    """
    Extract sections from a DoclingApiDoc, ignoring page headers, footers, etc.
    - section_header labels start a new section
    - consecutive headers with no text are merged
    """
    sections: list[Section] = []
    buffer_titles: list[str] = []
    current_texts: list[TextItem] = []

    for t in doc.texts:
        if t.label in ("page_header", "page_footer", "unspecified"):
            continue

        if t.label == "section_header":
            if current_texts:
                title = ": ".join(buffer_titles) if buffer_titles else "Kein Titel"
                sections.append(Section(title=title, texts=current_texts))
                current_texts = []
                buffer_titles = []
            buffer_titles.append(t.text)
        else:
            current_texts.append(t)

    if current_texts:
        title = ": ".join(buffer_titles) if buffer_titles else "Kein Titel"
        sections.append(Section(title=title, texts=current_texts))

    return sections
