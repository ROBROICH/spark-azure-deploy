"""Rasterize PDF pages to JPEG before Docling.

Used for CAD/GIS plan sheets (rasterize-first) and as a fallback when
docling-serve crashes on complex vector or huge embedded images.
"""

import asyncio
import io
import logging
import math
from datetime import timedelta

import pikepdf
import pypdfium2 as pdfium
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.config import get_config
from src.services.docling.schemas import RasterizeChunkInput, RasterizeChunkOutput
from src.utils.pdfium_lock import _pdfium_lock
from src.utils.pil_lock import _pil_lock

__all__ = [
    "_rasterize_chunk",
    "rasterize_chunk",
]

logger = logging.getLogger(__name__)


def _page_scale(width_pt: float, height_pt: float, requested_scale: float, max_pixels: int) -> float:
    """Clamp the render scale so a page stays below max_pixels.

    Plan and map sheets are many times larger than A4, so a fixed DPI produces
    bitmaps of several hundred MB and images above PIL's DecompressionBomb limit.
    """
    area = width_pt * height_pt
    if area <= 0:
        return requested_scale
    if math.ceil(width_pt * requested_scale) * math.ceil(height_pt * requested_scale) <= max_pixels:
        return requested_scale

    scale = min(requested_scale, math.sqrt(max_pixels / area))
    short_side = min(width_pt, height_pt)
    long_side = max(width_pt, height_pt)
    # Fit an integer pixel rectangle: PDFium rounds both rendered sides up.
    short_pixels = max(1, math.floor(short_side * scale))
    long_pixels = max_pixels // short_pixels
    scale = min(scale, short_pixels / short_side, long_pixels / long_side)
    # Division/multiplication can round just above the final integer boundary.
    while math.ceil(width_pt * scale) * math.ceil(height_pt * scale) > max_pixels:
        scale = math.nextafter(scale, 0.0)
    return scale


def _render_page_jpeg(page: "pdfium.PdfPage", scale: float, quality: int) -> tuple[bytes, int, int]:
    """Render one page to JPEG bytes, releasing the pdfium bitmap immediately."""
    bitmap = page.render(scale=scale)
    try:
        with _pil_lock:
            pil_image = bitmap.to_pil()
            jpeg_buf = io.BytesIO()
            pil_image.save(jpeg_buf, format="JPEG", quality=quality)
            img_width, img_height = pil_image.width, pil_image.height
            # to_pil() shares the pdfium buffer, so drop the image before closing
            # the bitmap -- otherwise both stay alive for the whole loop.
            del pil_image
    finally:
        bitmap.close()
    return jpeg_buf.getvalue(), img_width, img_height


def _rasterize_chunk_sync(chunk_bytes: bytes) -> bytes:
    """
    Synchronous helper to rasterize each page of a PDF chunk into a JPEG image.

    Renders each page at RASTER_FALLBACK_DPI using pypdfium2 and builds a new
    image-only PDF using pikepdf. Strips CAD paths and huge embedded images
    that make native Docling empty or crash.

    Args:
        chunk_bytes: Raw PDF bytes of the chunk

    Returns:
        Rasterized PDF bytes
    """
    cfg = get_config()
    quality = cfg.RASTER_FALLBACK_JPEG_QUALITY
    max_pixels = cfg.RASTER_MAX_PIXELS
    requested_scale = cfg.RASTER_FALLBACK_DPI / 72.0

    # Phase 1: render all pages via pypdfium2 under the lock
    rendered_pages: list[tuple[float, float, bytes, int, int]] = []  # (w, h, jpeg, img_w, img_h)
    with _pdfium_lock:
        src_doc = pdfium.PdfDocument(chunk_bytes)
        try:
            for page_idx in range(len(src_doc)):
                page = src_doc[page_idx]
                page_width = page.get_width()
                page_height = page.get_height()

                scale = _page_scale(page_width, page_height, requested_scale, max_pixels)
                if scale < requested_scale:
                    logger.info(
                        f"Page {page_idx + 1}: capping render scale {requested_scale:.2f} -> {scale:.2f} "
                        f"({int(page_width * scale)}x{int(page_height * scale)} px) to stay below "
                        f"{max_pixels:,} pixels"
                    )

                jpeg, img_width, img_height = _render_page_jpeg(page, scale, quality)
                rendered_pages.append((page_width, page_height, jpeg, img_width, img_height))
                page.close()
        finally:
            src_doc.close()

    # Phase 2: build the output PDF via pikepdf (no pypdfium2 needed)
    dst_pdf = pikepdf.Pdf.new()
    try:
        for page_width, page_height, jpeg_bytes, img_w, img_h in rendered_pages:
            image_stream = pikepdf.Stream(dst_pdf, jpeg_bytes)
            image_stream["/Type"] = pikepdf.Name.XObject
            image_stream["/Subtype"] = pikepdf.Name.Image
            image_stream["/Width"] = img_w
            image_stream["/Height"] = img_h
            image_stream["/ColorSpace"] = pikepdf.Name.DeviceRGB
            image_stream["/BitsPerComponent"] = 8
            image_stream["/Filter"] = pikepdf.Name.DCTDecode

            content = f"q {page_width} 0 0 {page_height} 0 0 cm /Im0 Do Q"
            content_stream = pikepdf.Stream(dst_pdf, content.encode())

            new_page = pikepdf.Dictionary(
                Type=pikepdf.Name.Page,
                MediaBox=[0, 0, page_width, page_height],
                Contents=dst_pdf.make_indirect(content_stream),
                Resources=pikepdf.Dictionary(
                    XObject=pikepdf.Dictionary(Im0=dst_pdf.make_indirect(image_stream)),
                ),
            )
            dst_pdf.pages.append(pikepdf.Page(dst_pdf.make_indirect(new_page)))

        out_buf = io.BytesIO()
        dst_pdf.save(out_buf, compress_streams=True)
        result = out_buf.getvalue()
    finally:
        dst_pdf.close()

    return result


@activity.defn(name="rasterize_chunk_for_fallback")
async def _rasterize_chunk(input: RasterizeChunkInput) -> RasterizeChunkOutput:
    """
    Rasterize a PDF chunk by rendering each page as a JPEG image.

    Plan sheets use this before Docling. Non-plan chunks use it after
    docling-serve crashes on huge embedded images.

    Args:
        input: RasterizeChunkInput with chunk bytes and metadata

    Returns:
        RasterizeChunkOutput with rasterized bytes and size info
    """
    if not input.chunk_bytes:
        raise RuntimeError(f"Chunk {input.chunk_index + 1}/{input.total_chunks} has empty bytes, cannot rasterize")

    chunk_num = input.chunk_index + 1
    original_size_mb = len(input.chunk_bytes) / (1024 * 1024)

    activity.logger.info(
        f"Rasterizing chunk {chunk_num}/{input.total_chunks} "
        f"({original_size_mb:.2f}MB) at {get_config().RASTER_FALLBACK_DPI} DPI"
    )

    rasterized_bytes = await asyncio.to_thread(_rasterize_chunk_sync, input.chunk_bytes)
    rasterized_size_mb = len(rasterized_bytes) / (1024 * 1024)

    activity.logger.info(
        f"Rasterized chunk {chunk_num}: {original_size_mb:.2f}MB -> "
        f"{rasterized_size_mb:.2f}MB "
        f"({(1 - rasterized_size_mb / max(original_size_mb, 0.001)) * 100:.1f}% reduction)"
    )

    return RasterizeChunkOutput(
        rasterized_bytes=rasterized_bytes,
        original_size_mb=original_size_mb,
        rasterized_size_mb=rasterized_size_mb,
    )


async def rasterize_chunk(
    chunk_bytes: bytes,
    chunk_index: int,
    total_chunks: int,
) -> RasterizeChunkOutput:
    """Workflow wrapper for rasterize_chunk activity."""
    return await workflow.execute_activity(
        _rasterize_chunk,
        RasterizeChunkInput(
            chunk_bytes=chunk_bytes,
            chunk_index=chunk_index,
            total_chunks=total_chunks,
        ),
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )
