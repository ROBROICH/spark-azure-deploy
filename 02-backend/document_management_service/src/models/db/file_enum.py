from enum import Enum


class FileTypeEnum(str, Enum):
    """File types managed by the DMS."""

    DOCUMENT = "document"
    ZIP = "zip"
    EWMS_ZIP = "ewms_zip"
    EWMS_DOCUMENT = "ewms_document"
    ERWIDERUNGS_IMPORT = "erwiderungs_import"
    ERWIDERUNGS_EXPORT = "erwiderungs_export"
    TEMPLATE = "template"
    LAW_DATA = "law_data"
    CONTENT_EXTRACTION = "content_extraction"
    TEMPORAL_CHECKPOINT = "temporal_checkpoint"
    REDACTED_DOCUMENT = "redacted_document"
