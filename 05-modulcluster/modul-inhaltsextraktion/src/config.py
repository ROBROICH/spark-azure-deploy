"""Application config for manual tuning."""

import logging
from dataclasses import dataclass

from temporalio import workflow

from src.env import ENV

logger = logging.getLogger(__name__)

# Headroom on top of the two docling budgets. Submit alone can spend
# MAX_SUBMIT_RETRIES x 300s plus its retry delays before polling even starts,
# and the result download and post-processing (crops, DMS upload) follow.
_ACTIVITY_TIMEOUT_MARGIN_MINUTES = 30


@dataclass(frozen=True)
class Config:
    """Frozen application configuration for processing, temporal, and model settings."""

    # Feature flags
    ENABLE_CACHING: bool = False
    ENABLE_SCHWERPUNKTTHEMA_EXTRACTION: bool = True
    ENABLE_HYPOTHETICAL_QUESTIONS: bool = True
    ENABLE_SPECIES_SCALE_EXTRACTION: bool = True

    # Timeouts
    DMS_TIMEOUT: int = 300

    DMS_LIST_PAGE_SIZE: int = 500
    DMS_LIST_MAX_PAGES: int = 200
    VLM_TIMEOUT_SECONDS: int = 600
    VLM_ACTIVITY_TIMEOUT_MINUTES: int = 15
    VLM_MAX_TOKENS: int = 4096

    # Concurrency
    MAX_CONCURRENT_DMS_IMAGE_UPLOADS: int = 5
    SCHWERPUNKT_BATCH_SIZE: int = 15
    SCHWERPUNKT_WORKFLOW_BATCH_SIZE: int = 15
    SCHWERPUNKT_CLASSIFICATION_BATCH_SIZE: int = 5
    VLM_INPUTS_BATCH_SIZE: int = 15
    VLM_APPLY_BATCH_SIZE: int = 50
    VLM_SUMMARY_EXTRACTION_MAX_CHARS: int = 5000
    VLM_SUMMARY_DESCRIPTION_MAX_CHARS: int = 2000

    # Species/Scale Extraction Configuration
    SPECIES_SCALE_BATCH_SIZE: int = 30

    # Hypothetical Questions Configuration
    HYPOTHETICAL_QUESTIONS_BATCH_SIZE: int = 30

    # PageIndex summaries fan out one activity per document node from inside the
    # workflow. Scheduling them all at once puts every node payload into a single
    # RespondWorkflowTaskCompleted request; node texts sit below the payload
    # codec's offload threshold, so they are sent inline and their sum can exceed
    # the server's gRPC message limit on documents with many chapters.
    PAGE_INDEX_SUMMARY_CONCURRENCY: int = 20

    SUMMARIZATION_BATCH_SIZE: int = 20
    SUMMARIZATION_WORKFLOW_BATCH_SIZE: int = 25
    SUMMARIZATION_CHUNK_MAX_CHARACTERS: int = 80000

    # Document handling & chunking
    ALLOWED_EXTENSIONS: tuple[str, ...] = (
        ".pdf",
        ".pptx",
        ".docx",
        ".xlsx",
        ".ppt",
        ".doc",
        ".xls",
        ".html",
        ".md",
        ".htm",
    )
    CHUNKING_MAX_CHARACTERS: int = 2000
    PARENT_CHUNK_MAX_CHARACTERS: int = 30000
    EWMS_CHUNK_MAX_TOKENS: int = 1500
    EWMS_CHUNK_TOKENIZER_NAME: str = "openai/gpt-oss-120b"
    EWMS_CHUNK_TOKENIZER_REVISION: str = "8c0580383cb1e6a9157669336ade6797a024cd9a"
    CHUNK_OVERLAP: int = 0
    PDF_SIZE_THRESHOLD_MB: int = 150
    PDF_PAGE_CHUNK_SIZE: int = 50

    # Adaptive PDF splitting
    PDF_TARGET_CHUNK_MB: int = 25
    PDF_FORCE_SPLIT_THRESHOLD_MB: int = 40

    # PDF image compression
    ENABLE_PDF_COMPRESSION: bool = True
    PDF_COMPRESSION_THRESHOLD_MB: int = 80
    PDF_COMPRESSION_JPEG_QUALITY: int = 65
    PDF_COMPRESSION_MAX_IMAGE_PIXELS: int = 80_000_000  # PIL limit is ~89M

    # Plan-first raster and crash-fallback share this JPEG render.
    # 150 dpi matches Docling's default page scale (144 dpi); EasyOCR
    # quality plateaus here on Lagepläne. JPEG 75 is the measured setting.
    ENABLE_RASTER_FALLBACK: bool = True
    RASTER_FALLBACK_DPI: int = 150
    RASTER_FALLBACK_JPEG_QUALITY: int = 75
    # Pillow bomb guard (~89M). A 21.3x A4 sheet at 150 dpi is ~46 Mpx
    # and does not cap; keep this for larger sheets or a higher DPI.
    RASTER_MAX_PIXELS: int = 80_000_000

    # CAD/GIS plan sheets rasterize to JPEG pages before Docling.
    ENABLE_PLAN_FAST_PATH: bool = ENV.ENABLE_PLAN_FAST_PATH

    # Business logic
    SKIP_DOCUMENTS_BY_KEYWORDS: bool = False
    SKIPPED_DOCUMENT_KEYWORDS: tuple[str, ...] = (
        "Planfeststellungsbeschluss",
        "Planfeststellungsbesch",
        "PFB",
    )
    METADATA_PRIORITY_KEYWORDS: tuple[str, ...] = (
        "Erläuterungsbericht",
        "Erlaeuterungsbericht",
        "erlaeuterungsbericht",
        "erläuterungsbericht",
        "ErlB",
        "_EB",
        "EB_",
        " EB",
        "EB ",
    )
    BASE_METADATA_CHUNK_SIZE: int = 20000
    BASE_METADATA_TOTAL_LIMIT: int = 100000

    # Page dimensions for header/footer detection (A4 in points)
    PAGE_HEIGHT_POINTS: int = 842

    # Header/footer filtering configuration
    FILTER_HEADER_ZONE_RATIO: float = 0.12
    FILTER_FOOTER_ZONE_RATIO: float = 0.18
    FILTER_IMAGE_HASH_SIZE: int = 8
    FILTER_IMAGE_SIMILARITY_THRESHOLD: int = 8

    # Docling settings
    # Separate budgets: counting queue wait against the conversion budget kills
    # documents that were never converted. See api_client._expired_budget.
    DOCLING_TIMEOUT: int = ENV.DOCLING_TIMEOUT
    """Time budget once docling reports the task as started."""
    DOCLING_QUEUE_WAIT_TIMEOUT: int = ENV.DOCLING_QUEUE_WAIT_TIMEOUT
    """Time budget while the task is still pending in the queue."""
    DOCLING_MAX_RESUBMIT_ATTEMPTS: int = 3
    DOCLING_OCR_ENGINE: str = ENV.DOCLING_OCR_ENGINE
    DOCLING_OCR_LANG: tuple[str, ...] = ("de", "en")
    DOCLING_IMAGES_SCALE: float = 2.0
    DOCLING_TABLE_AS_HTML: bool = True
    DOCLING_TABLE_AS_IMAGE: bool = True
    TRUST_PROVIDER_LABELS_FOR_FILTER: bool = True
    DETECT_FULL_PAGE_IMAGES: bool = ENV.DETECT_FULL_PAGE_IMAGES
    FULL_PAGE_IMAGE_TEXT_COVERAGE_THRESHOLD: float = 0.10

    # "placeholder" stops docling embedding a full-page raster of every page
    # (~0.8 MB per A4 page); what needs pixels is cropped locally instead.
    # "embedded" restores the previous behaviour.
    DOCLING_IMAGE_EXPORT_MODE: str = ENV.DOCLING_IMAGE_EXPORT_MODE

    # Thresholds from real project data: furniture covers 0.5% of a page and
    # recurs on 84-100% of them, the smallest genuine figure covers 11.9% and
    # recurs on at most 30%.
    ENABLE_PICTURE_FURNITURE_FILTER: bool = ENV.ENABLE_PICTURE_FURNITURE_FILTER
    PICTURE_FURNITURE_MAX_AREA_FRACTION: float = 0.02
    PICTURE_FURNITURE_MIN_PAGE_SHARE: float = 0.5
    PICTURE_FURNITURE_SIZE_TOLERANCE_PT: float = 10.0
    # Sampled hash check, so equally sized but different pictures survive.
    PICTURE_FURNITURE_HASH_SAMPLE_SIZE: int = 3

    # Temporal workflow settings
    TEMPORAL_PROCESS_DOCUMENTS_SEQUENTIALLY: bool = True
    TEMPORAL_VLM_CHILD_WORKFLOW_BATCH_SIZE: int = 20
    EXTRACTION_CHUNK_CONCURRENCY: int = ENV.EXTRACTION_CHUNK_CONCURRENCY
    HYBRID_EXTRACTION_DOCLING_CONCURRENCY: int = ENV.HYBRID_EXTRACTION_DOCLING_CONCURRENCY
    HYBRID_EXTRACTION_OCR_CONCURRENCY: int = ENV.HYBRID_EXTRACTION_OCR_CONCURRENCY
    TEMPORAL_EXTRACTION_ACTIVITY_MAX_ATTEMPTS: int = 2
    TEMPORAL_LLM_ACTIVITY_MAX_ATTEMPTS: int = 5
    TEMPORAL_VLM_ACTIVITY_MAX_ATTEMPTS: int = 5
    TEMPORAL_STORAGE_ACTIVITY_MAX_ATTEMPTS: int = 3
    TEMPORAL_PROCESSING_ACTIVITY_MAX_ATTEMPTS: int = 2
    TEMPORAL_EXTERNAL_SERVICE_MAX_ATTEMPTS: int = 1
    TEMPORAL_PREPROCESSING_ACTIVITY_MAX_ATTEMPTS: int = 10
    TEMPORAL_QDRANT_ACTIVITY_MAX_ATTEMPTS: int = 30

    # VLM failure tolerance (fraction of elements allowed to fail)
    VLM_FAILURE_TOLERANCE: float = 0.2

    # Hallucination detection thresholds
    HALLUCINATION_MAX_LENGTH: int = 100000
    HALLUCINATION_TRUNCATE_LENGTH: int = 10000

    # Qdrant indexing
    QDRANT_PARALLEL_DOCS_SIZE: int = 10
    QDRANT_UPLOAD_BATCH_SIZE: int = 100

    # LightOnOCR
    LIGHT_ON_OCR_MAX_COMPLETION_TOKENS: int = 4096
    LIGHT_ON_OCR_TEMPERATURE: float = 0
    LIGHT_ON_OCR_TOP_P: float = 0.9
    LIGHT_ON_OCR_FREQUENCY_PENALTY: float = 0.4
    LIGHT_ON_OCR_PRESENCE_PENALTY: float = 0.0
    LIGHT_ON_OCR_MODEL: str = "ionos/lightonocr-2-1b"

    # OCR Rotation of images
    OCR_ROTATION_THRESHOLD: float = 0.05
    OCR_FLIP_THRESHOLD: float = 0.05

    # Prompt Injection Detection
    # Also change the loaded tokenizer in the Dockerfile if you change this model
    INJECTION_MODEL: str = "protectai/deberta-v3-base-prompt-injection-v2"
    INJECTION_MODEL_REVISION: str = "e6535ca4ce3ba852083e75ec585d7c8aeb4be4c5"
    INJECTION_LABEL: str = "INJECTION"
    INJECTION_TOKEN_LOWER_BOUND_RATIO: float = 0.85
    INJECTION_CHUNK_CLASSIFICATION_BATCH_SIZE = 10
    INJECTION_CHUNK_CLASSIFICATION_CONCURRENCY: int = 10
    # Two tokens are added Automatically [CLS] and [SEP]
    INJECTION_CHUNK_CLASSIFICATION_MAX_TOKENS: int = 510
    INJECTION_CHUNK_CLASSIFICATION_STRIDE: int = 64
    INJECTION_LLM_SCAN_MAX_TOKENS: int = 4000
    INJECTION_LLM_SCAN_STRIDE: int = 256
    INJECTION_THRESHOLD: float = 0.9
    INJECTION_REQUEST_TIMEOUT: int = 120
    INJECTION_START_TO_CLOSE: int = 180
    INJECTION_MAX_ATTEMPTS: int = 5


CONFIG_MEMO_KEY = "config_snapshot"


_default = Config()


def snapshot_config() -> Config:
    """Snapshot config into the workflow memo.

    Must be called exactly once, at the very top of each workflow's run()
    method, before any activity or child-workflow scheduling.  On first
    execution it writes the current defaults into the memo; on replay it
    returns the previously snapshotted values so the workflow stays
    deterministic even if defaults change between deployments.
    """
    cfg = workflow.memo_value(CONFIG_MEMO_KEY, default=None, type_hint=Config)
    if cfg is not None:
        return cfg

    workflow.upsert_memo({CONFIG_MEMO_KEY: _default})
    return _default


def get_config() -> Config:
    """Get the application config (read-only).

    In workflow context: reads from the memo written by snapshot_config().
    Outside workflows (activities, tests, scripts): returns the module-level
    default.  Never writes to the memo — call snapshot_config() for that.
    """
    if not workflow.in_workflow():
        return _default

    cfg = workflow.memo_value(CONFIG_MEMO_KEY, default=None, type_hint=Config)
    if cfg is not None:
        return cfg

    return _default


def get_docling_activity_timeout_minutes() -> int:
    """Outer Temporal bound for an activity that waits on docling-serve.

    Must stay above the client's own budgets, or the activity dies first and
    Temporal retries -- resubmitting a document that is still being converted,
    with no way to cancel the first attempt.  Liveness is not affected: the
    poll loop heartbeats every few seconds and heartbeat_timeout still catches
    a dead client within two minutes.
    """
    cfg = get_config()
    total_seconds = cfg.DOCLING_TIMEOUT + cfg.DOCLING_QUEUE_WAIT_TIMEOUT
    return int(total_seconds / 60) + _ACTIVITY_TIMEOUT_MARGIN_MINUTES


def get_docling_url() -> str:
    """Build docling-serve API URL from protocol, host, and port."""
    return f"{ENV.DOCLING_PROTOCOL}://{ENV.DOCLING_HOST}:{ENV.DOCLING_PORT}"


def get_docling_image_export_mode() -> str:
    """Resolve the image export mode, guarding the one harmful combination.

    "placeholder" makes every picture that survives filtering cost a local page
    render.  With the furniture filter switched off, docling reports a logo on
    every page, so that would render the whole document -- exactly what asking
    docling for the images avoids.  Fall back to "embedded" in that case, so
    turning off the filter alone can never make things worse.
    """
    cfg = get_config()
    mode = cfg.DOCLING_IMAGE_EXPORT_MODE
    if mode == "placeholder" and not cfg.ENABLE_PICTURE_FURNITURE_FILTER:
        logger.warning(
            "ENABLE_PICTURE_FURNITURE_FILTER is off; falling back to image_export_mode=embedded "
            "to avoid one local page render per page of recurring furniture."
        )
        return "embedded"
    return mode
