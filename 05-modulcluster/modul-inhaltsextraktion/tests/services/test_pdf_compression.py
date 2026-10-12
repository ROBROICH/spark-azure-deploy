"""PDF compression preserves resolution up to the configured pixel budget."""

import io
from typing import cast

import pikepdf
import pytest
from PIL import Image
from temporalio.testing import ActivityEnvironment

from src import config
from src.services.docling.pdf_compression import _compress_pdf_images
from src.services.docling.schemas import CompressPdfImagesInput


def _image_pdf(size: tuple[int, int], *, lossless: bool = False) -> bytes:
    with Image.new("RGB", size, (32, 96, 192)) as image, pikepdf.Pdf.new() as pdf:
        if lossless:
            image_bytes = image.tobytes()
        else:
            jpeg = io.BytesIO()
            image.save(jpeg, format="JPEG")
            image_bytes = jpeg.getvalue()
        stream = pikepdf.Stream(pdf, image_bytes)
        stream["/Type"] = pikepdf.Name.XObject
        stream["/Subtype"] = pikepdf.Name.Image
        stream["/Width"], stream["/Height"] = size
        stream["/ColorSpace"] = pikepdf.Name.DeviceRGB
        stream["/BitsPerComponent"] = 8
        if not lossless:
            stream["/Filter"] = pikepdf.Name.DCTDecode
        page = pdf.add_blank_page(page_size=(400, 200))
        page.Resources = pikepdf.Dictionary(XObject=pikepdf.Dictionary(Im0=stream))
        page.Contents = pdf.make_stream(b"q 400 0 0 200 0 0 cm /Im0 Do Q")
        buffer = io.BytesIO()
        pdf.save(buffer, compress_streams=True)
    return buffer.getvalue()


@pytest.mark.parametrize(
    ("size", "pixel_budget", "expected_size", "lossless"),
    [
        ((4_000, 2_000), 4_500_000, (3_000, 1_500), False),
        ((4_000, 2_000), 4_500_000, (3_000, 1_500), True),
        ((4_000, 1), 1_000, (1_000, 1), False),
    ],
    ids=["preserve-detail", "pixel-safety-despite-file-growth", "thin-image"],
)
async def test_oversized_image_uses_available_pixel_budget(
    monkeypatch: pytest.MonkeyPatch,
    size: tuple[int, int],
    pixel_budget: int,
    expected_size: tuple[int, int],
    lossless: bool,
) -> None:
    monkeypatch.setattr(config, "_default", config.Config(PDF_COMPRESSION_MAX_IMAGE_PIXELS=pixel_budget))
    source = _image_pdf(size, lossless=lossless)
    result = await ActivityEnvironment().run(
        _compress_pdf_images,
        CompressPdfImagesInput(pdf_bytes=source, file_size_mb=len(source) / (1024 * 1024)),
    )
    with (
        pikepdf.open(io.BytesIO(result.pdf_bytes)) as pdf,
        pikepdf.PdfImage(cast(pikepdf.Stream, pdf.pages[0].Resources.XObject.Im0)).as_pil_image() as image,
    ):
        assert image.size == expected_size
    assert result.was_compressed is True
    if lossless:
        assert len(result.pdf_bytes) > len(source)


async def test_image_at_pixel_budget_is_unchanged_above_file_threshold(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        config,
        "_default",
        config.Config(PDF_COMPRESSION_MAX_IMAGE_PIXELS=2_000_000, PDF_COMPRESSION_THRESHOLD_MB=0),
    )
    source = _image_pdf((2_000, 1_000))
    result = await ActivityEnvironment().run(
        _compress_pdf_images,
        CompressPdfImagesInput(pdf_bytes=source, file_size_mb=len(source) / (1024 * 1024)),
    )
    assert result.pdf_bytes == source
    assert result.was_compressed is False
