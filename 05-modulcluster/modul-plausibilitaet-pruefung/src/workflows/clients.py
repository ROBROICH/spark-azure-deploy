"""Module-level singletons for non-LLM external clients."""

from src.dms.dms_client import DMSClient
from src.qdrant.client import PlausibilityQdrantClient

dms_client = DMSClient()
qdrant_client = PlausibilityQdrantClient()
