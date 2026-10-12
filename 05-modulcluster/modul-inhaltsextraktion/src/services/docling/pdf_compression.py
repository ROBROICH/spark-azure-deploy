"""PDF image compression to reduce memory pressure on docling-serve."""

import asyncio
import io
import logging
import math
from datetime import timedelta
from typing import Any

import pikepdf
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.config import get_config
from src.services.docling.schemas import CompressPdfImagesInput, CompressPdfImagesOutput
from src.utils.pil_lock import _pil_lock

__all__ = [
    "_compress_pdf_images",
    "compress_pdf_images",
]

logger = logging.getLogger(__name__)


def _iter_pdf_image_xobjects(pdf: pikepdf.Pdf, *, deduplicate: bool = False) -> list[pikepdf.Stream]:
    """Collect all image XObject streams from a PDF, skipping non-image objects.

    Args:
        pdf: An open pikepdf.Pdf instance.
        deduplicate: If True, skip objects already seen (by objgen).

    Returns:
        List of pikepdf.Stream objects representing images.
    """
    seen_objgens: set[tuple[int, int]] = set()
    visited_forms: set[tuple[int, int]] = set()
    image_objects: list[pikepdf.Stream] = []

    def _collect(resources: Any) -> None:
        """Collect images from a /Resources dict, descending into form XObjects.

        Map and plan exports (ArcGIS, QGIS, AutoCAD) routinely wrap page content
        in form XObjects, so images nested there must be found too.
        """
        if not resources:
            return
        xobjects = resources.get("/XObject")
        if not xobjects:
            return
        for key in xobjects.keys():
            obj = xobjects[key]
            if not isinstance(obj, pikepdf.Stream):
                continue
            subtype = obj.get("/Subtype")
            if subtype == pikepdf.Name.Form:
                objgen = obj.objgen
                if objgen in visited_forms:  # guard against cyclic references
                    continue
                visited_forms.add(objgen)
                _collect(obj.get("/Resources"))
                continue
            if subtype != pikepdf.Name.Image:
                continue
            if deduplicate:
                objgen = obj.objgen
                if objgen in seen_objgens:
                    continue
                seen_objgens.add(objgen)
            image_objects.append(obj)

    for page in pdf.pages:
        _collect(page.get("/Resources"))
    return image_objects


def _pdf_has_oversized_images(pdf_bytes: bytes, max_pixels: int) -> bool:
    """Check if any embedded image exceeds the pixel limit by reading PDF metadata only (no decompression)."""
    pdf = pikepdf.open(io.BytesIO(pdf_bytes))
    try:
        for obj in _iter_pdf_image_xobjects(pdf):
            try:
                pdfimage = pikepdf.PdfImage(obj)
                if pdfimage.width * pdfimage.height > max_pixels:
                    return True
            except (pikepdf.PdfError, ValueError, TypeError) as exc:
                logger.debug("Skipping unreadable image XObject: %s", exc)
                continue
        return False
    finally:
        pdf.close()


def _decompress_pil_image(pdfimage: Any, pixel_count: int) -> Any:
    """Decompress a pikepdf PdfImage into a PIL Image, temporarily raising the pixel limit.

    Caller must hold _pil_lock.
    """
    from PIL import Image

    original_max_pixels = Image.MAX_IMAGE_PIXELS
    try:
        Image.MAX_IMAGE_PIXELS = max(pixel_count + 1, original_max_pixels or 0)
        return pdfimage.as_pil_image()
    finally:
        Image.MAX_IMAGE_PIXELS = original_max_pixels


def _compress_single_image(obj: pikepdf.Stream, max_pixels: int, quality: int) -> bool:
    """Resize an image to the pixel budget in-place. Returns True if resized."""
    from PIL import Image

    pdfimage = pikepdf.PdfImage(obj)
    width = pdfimage.width
    height = pdfimage.height
    pixel_count = width * height

    if pixel_count <= max_pixels:
        return False

    with _pil_lock:
        img = _decompress_pil_image(pdfimage, pixel_count)
        if img.mode != "RGB":
            img = img.convert("RGB")

        # The axis bounds keep extremely thin images within budget at one pixel high or wide.
        scale = min(math.sqrt(max_pixels / pixel_count), max_pixels / width, max_pixels / height)
        new_width = max(1, int(width * scale))
        new_height = max(1, int(height * scale))
        img = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        jpeg_buffer = io.BytesIO()
        img.save(jpeg_buffer, format="JPEG", quality=quality)

    obj.write(jpeg_buffer.getvalue(), filter=pikepdf.Name.DCTDecode)
    obj["/Width"] = new_width
    obj["/Height"] = new_height
    obj["/ColorSpace"] = pikepdf.Name.DeviceRGB
    for stale_key in ("/DecodeParms", "/BitsPerComponent"):
        if stale_key in obj:
            del obj[stale_key]

    return True


def _compress_pdf_images_sync(pdf_bytes: bytes) -> bytes:
    """
    Synchronous helper to downscale oversized embedded images in a PDF.

    Iterates all image XObjects in the PDF, downscales those exceeding
    PDF_COMPRESSION_MAX_IMAGE_PIXELS using Pillow, and replaces the
    raw image stream in-place using pikepdf.

    Args:
        pdf_bytes: Raw PDF bytes

    Returns:
        Resized PDF bytes, or original bytes if no images could be resized.
    """
    pdf = pikepdf.open(io.BytesIO(pdf_bytes))
    try:
        cfg = get_config()
        image_objects = _iter_pdf_image_xobjects(pdf, deduplicate=True)
        logger.info(f"PDF compression: found {len(image_objects)} unique images across {len(pdf.pages)} pages")

        compressed_count = 0
        skipped_count = 0
        for obj in image_objects:
            try:
                if _compress_single_image(
                    obj,
                    cfg.PDF_COMPRESSION_MAX_IMAGE_PIXELS,
                    cfg.PDF_COMPRESSION_JPEG_QUALITY,
                ):
                    compressed_count += 1
            except Exception:
                skipped_count += 1
                logger.debug("Skipping image that failed compression", exc_info=True)
                continue

        if skipped_count:
            # Unsupported codecs (JPEG2000, JBIG2) are common in map scans and
            # would otherwise reach docling-serve at full size unnoticed.
            logger.warning(
                f"PDF compression: {skipped_count} of {len(image_objects)} images could not be "
                f"compressed and are passed through at original size"
            )

        if compressed_count == 0:
            return pdf_bytes

        out_buf = io.BytesIO()
        pdf.save(out_buf, compress_streams=True)
        result = out_buf.getvalue()
    finally:
        pdf.close()

    return result


@activity.defn(name="compress_pdf_images")
async def _compress_pdf_images(
    input: CompressPdfImagesInput,
) -> CompressPdfImagesOutput:
    """
    Compress oversized embedded images in a PDF to reduce memory pressure on docling-serve.

    Leaves images within the pixel budget unchanged, regardless of PDF file size.
    Runs CPU-intensive work in asyncio.to_thread().

    Args:
        input: CompressPdfImagesInput with pdf_bytes and file_size_mb

    Returns:
        CompressPdfImagesOutput with (possibly compressed) PDF bytes and updated size
    """
    pdf_bytes = input.pdf_bytes
    file_size_mb = input.file_size_mb

    cfg = get_config()

    # Skip if compression is disabled
    if not cfg.ENABLE_PDF_COMPRESSION:
        activity.logger.info("PDF compression disabled by config")
        return CompressPdfImagesOutput(
            pdf_bytes=pdf_bytes,
            file_size_mb=file_size_mb,
            was_compressed=False,
        )

    # For small PDFs, run a lightweight pixel-count scan to catch images that
    # would trigger PIL DecompressionBombWarning in docling-serve (limit ~89M pixels).
    if file_size_mb < cfg.PDF_COMPRESSION_THRESHOLD_MB:
        if not await asyncio.to_thread(_pdf_has_oversized_images, pdf_bytes, cfg.PDF_COMPRESSION_MAX_IMAGE_PIXELS):
            activity.logger.info(
                f"PDF size {file_size_mb:.2f}MB < threshold {cfg.PDF_COMPRESSION_THRESHOLD_MB}MB "
                "and no oversized images found, skipping compression"
            )
            return CompressPdfImagesOutput(
                pdf_bytes=pdf_bytes,
                file_size_mb=file_size_mb,
                was_compressed=False,
            )
        activity.logger.info(
            f"PDF size {file_size_mb:.2f}MB < threshold but oversized images detected, "
            "running compression for pixel safety"
        )

    activity.logger.info(f"Compressing PDF images ({file_size_mb:.2f}MB)")

    try:
        result_bytes = await asyncio.to_thread(_compress_pdf_images_sync, pdf_bytes)
    except Exception as e:
        activity.logger.warning(f"PDF compression failed, using original: {e}")
        return CompressPdfImagesOutput(
            pdf_bytes=pdf_bytes,
            file_size_mb=file_size_mb,
            was_compressed=False,
        )

    new_size_mb = len(result_bytes) / (1024 * 1024)
    was_compressed = result_bytes != pdf_bytes

    if was_compressed:
        activity.logger.info(f"PDF images resized to pixel budget: {file_size_mb:.2f}MB -> {new_size_mb:.2f}MB")
    else:
        activity.logger.info("No oversized images were resized")

    return CompressPdfImagesOutput(
        pdf_bytes=result_bytes,
        file_size_mb=new_size_mb,
        was_compressed=was_compressed,
    )


async def compress_pdf_images(
    pdf_bytes: bytes,
    file_size_mb: float,
) -> CompressPdfImagesOutput:
    """Workflow wrapper for compress_pdf_images activity."""
    return await workflow.execute_activity(
        _compress_pdf_images,
        CompressPdfImagesInput(pdf_bytes=pdf_bytes, file_size_mb=file_size_mb),
        start_to_close_timeout=timedelta(minutes=15),
        retry_policy=RetryPolicy(maximum_attempts=get_config().TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS),
    )
