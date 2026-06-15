"""Re-export facade — import from image_extractor / table_extractor directly."""

from src.providers.docling.image_extractor import ImageExtractor
from src.providers.docling.table_extractor import TableExtractor

__all__ = ["ImageExtractor", "TableExtractor"]
