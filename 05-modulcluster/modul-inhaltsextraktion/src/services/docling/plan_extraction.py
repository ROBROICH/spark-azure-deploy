"""Detect CAD/GIS plan sheets so extraction can rasterize before Docling.

Plan sheets (Höhenpläne, Lagepläne, Bestands- und Konfliktpläne) are CAD/GIS
exports. Native Docling sees empty text and no images, or spends an hour on
path geometry. Rasterize each page to JPEG first, then Docling.

CAD/GIS creators (Esri, AutoCAD, MicroStation, Bentley, QGIS, Foxit Phantom)
and Titles that end in .dgn/.dwg/.dxf count as plans.
"""

from __future__ import annotations

import asyncio
from datetime import timedelta

from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.config import get_config
from src.services.docling.page_metrics import collect_pdf_metrics
from src.services.docling.schemas import CollectMetricsInput, PdfMetricsOutput

__all__ = [
    "_collect_metrics",
    "collect_metrics",
    "is_plan_document",
]


def is_plan_document(metrics: PdfMetricsOutput) -> bool:
    """True when the PDF should be rasterized before Docling.

    CAD/GIS creator or a Title ending in .dgn/.dwg/.dxf wins immediately.
    Page area is not a plan signal.
    """
    if not get_config().ENABLE_PLAN_FAST_PATH:
        return False
    return metrics.cad_creator


@activity.defn(name="collect_pdf_metrics")
async def _collect_metrics(input: CollectMetricsInput) -> PdfMetricsOutput:
    """Read structural metrics from a PDF (cheap, no rendering)."""
    metrics = await asyncio.to_thread(collect_pdf_metrics, input.pdf_bytes)
    activity.logger.info(
        f"PDF metrics: {metrics.pages} page(s), max {metrics.max_area_a4:.1f}x A4, "
        f"{metrics.text_ops} text ops, {metrics.xobj_ops} xobject ops, "
        f"load total {metrics.total_load:,.0f} / max page {metrics.max_page_load:,.0f}, "
        f"cad_creator={metrics.cad_creator}, usable_raster={metrics.has_usable_raster}, "
        f"images={metrics.image_count} max_px={metrics.max_image_px} strips={metrics.strip_count}"
    )
    return PdfMetricsOutput(**vars(metrics))


async def collect_metrics(pdf_bytes: bytes) -> PdfMetricsOutput | None:
    """Workflow wrapper for collect_pdf_metrics; None when the PDF is unreadable."""
    try:
        return await workflow.execute_activity(
            _collect_metrics,
            CollectMetricsInput(pdf_bytes=pdf_bytes),
            start_to_close_timeout=timedelta(minutes=5),
            retry_policy=RetryPolicy(maximum_attempts=1),
        )
    except Exception as exc:  # metrics are advisory, never block extraction
        workflow.logger.warning(f"PDF metrics unavailable, continuing with docling: {exc}")
        return None
