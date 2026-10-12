"""Rendering limits must preserve PDF detail through the compression activity."""

import io

import pikepdf
import pytest
from temporalio.testing import ActivityEnvironment

from src import config
from src.services.docling.pdf_compression import _compress_pdf_images
from src.services.docling.pdf_rasterization import _rasterize_chunk_sync
from src.services.docling.schemas import CompressPdfImagesInput


@pytest.mark.parametrize(
    ("page_size", "pixel_budget"),
    [((10_000, 5_000), 80_000_000), ((500, 1_000), 8_000), ((10_000, 3), 1_000)],
    ids=["large-plan", "portrait", "thin-page"],
)
async def test_rendered_page_survives_compression_without_resolution_loss(
    monkeypatch: pytest.MonkeyPatch, page_size: tuple[int, int], pixel_budget: int
) -> None:
    monkeypatch.setattr(
        config,
        "_default",
        config.Config(
            RASTER_FALLBACK_DPI=150,
            RASTER_MAX_PIXELS=pixel_budget,
            ENABLE_PDF_COMPRESSION=True,
            PDF_COMPRESSION_MAX_IMAGE_PIXELS=pixel_budget,
            PDF_COMPRESSION_THRESHOLD_MB=80,
        ),
    )
    with pikepdf.Pdf.new() as source:
        source.add_blank_page(page_size=page_size)
        buffer = io.BytesIO()
        source.save(buffer)

    raster = _rasterize_chunk_sync(buffer.getvalue())
    with pikepdf.open(io.BytesIO(raster)) as rendered:
        image = rendered.pages[0].Resources.XObject.Im0
        dimensions = (int(image.Width), int(image.Height))
        assert tuple(rendered.pages[0].MediaBox) == (0, 0, *page_size)

    result = await ActivityEnvironment().run(
        _compress_pdf_images,
        CompressPdfImagesInput(pdf_bytes=raster, file_size_mb=len(raster) / (1024 * 1024)),
    )
    with pikepdf.open(io.BytesIO(result.pdf_bytes)) as compressed:
        image = compressed.pages[0].Resources.XObject.Im0
        assert (int(image.Width), int(image.Height)) == dimensions
    assert dimensions[0] * dimensions[1] <= pixel_budget


def test_rendering_preserves_requested_resolution_when_it_fits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(config, "_default", config.Config(RASTER_FALLBACK_DPI=150, RASTER_MAX_PIXELS=45_000))
    with pikepdf.Pdf.new() as source:
        source.add_blank_page(page_size=(144, 72))
        buffer = io.BytesIO()
        source.save(buffer)

    with pikepdf.open(io.BytesIO(_rasterize_chunk_sync(buffer.getvalue()))) as rendered:
        image = rendered.pages[0].Resources.XObject.Im0
        assert (int(image.Width), int(image.Height)) == (300, 150)
