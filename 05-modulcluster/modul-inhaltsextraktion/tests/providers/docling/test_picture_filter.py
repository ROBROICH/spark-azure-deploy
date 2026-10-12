"""Real page crops must distinguish repeated logos from equally sized figures."""

import io
from typing import Any

import imagehash
import pikepdf
import pypdfium2 as pdfium
import pytest
from PIL import Image

from src import config
from src.processors.filtering_config import IMAGE_HASH_SIZE, IMAGE_SIMILARITY_THRESHOLD
from src.providers.docling.image_extractor import ImageExtractor
from src.providers.docling.page_renderer import PageRenderer
from src.providers.docling.picture_filter import PictureFilter
from src.utils.pdfium_lock import _pdfium_lock

_LOGO_COUNT = 5


@pytest.fixture
def logo_document(monkeypatch: pytest.MonkeyPatch) -> tuple[bytes, dict[str, Any]]:
    monkeypatch.setattr(config, "_default", config.Config(ENABLE_PICTURE_FURNITURE_FILTER=True))
    pictures = []
    pages = {}
    with pikepdf.Pdf.new() as pdf:
        for index in range(_LOGO_COUNT + 1):
            page = pdf.add_blank_page(page_size=(600, 800))
            left, bottom = (50, 700) if index < _LOGO_COUNT else (200, 300)
            content = (
                f"0 g {left} {bottom} 20 40 re f"
                if index < _LOGO_COUNT
                else f"0 g {left} {bottom} 60 8 re f {left + 25} {bottom} 8 40 re f"
            )
            page.Contents = pdf.make_stream(content.encode())
            pictures.append(
                {
                    "self_ref": f"#/pictures/{index}",
                    "prov": [
                        {
                            "page_no": index + 1,
                            "bbox": {"l": left, "r": left + 60, "b": bottom, "t": bottom + 40},
                        }
                    ],
                }
            )
            pages[str(index + 1)] = {"size": {"width": 600, "height": 800}}
        buffer = io.BytesIO()
        pdf.save(buffer)
    return buffer.getvalue(), {"pictures": pictures, "pages": pages}


def test_distinct_unsampled_picture_reaches_image_extraction(
    logo_document: tuple[bytes, dict[str, Any]],
) -> None:
    pdf_bytes, doc_json = logo_document
    with _pdfium_lock, pdfium.PdfDocument(pdf_bytes) as document:
        renderer = PageRenderer.for_document(document)
        try:
            metadata, images, skipped = ImageExtractor.crop_pictures(renderer, doc_json, "document")
        finally:
            renderer.close()

    assert {item["self_ref"] for item in metadata} == {"#/pictures/0", "#/pictures/5"}
    assert skipped == {f"#/pictures/{index}" for index in range(1, 5)}
    hashes = []
    for item in metadata:
        with Image.open(io.BytesIO(images[item["filename"]])) as image:
            hashes.append(imagehash.phash(image, hash_size=IMAGE_HASH_SIZE))
    assert hashes[0] - hashes[1] > IMAGE_SIMILARITY_THRESHOLD


def test_unrenderable_candidate_is_not_classified_as_a_duplicate(
    logo_document: tuple[bytes, dict[str, Any]],
) -> None:
    pdf_bytes, doc_json = logo_document
    doc_json["pictures"][-1]["prov"][0]["bbox"] = {"l": 700, "r": 760, "b": 300, "t": 340}
    with _pdfium_lock, pdfium.PdfDocument(pdf_bytes) as document:
        renderer = PageRenderer.for_document(document)
        try:
            assert _LOGO_COUNT not in PictureFilter.find_furniture_indices(doc_json, renderer)
        finally:
            renderer.close()
