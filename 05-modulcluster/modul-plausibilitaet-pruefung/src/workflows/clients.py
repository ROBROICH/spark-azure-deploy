"""Module-level singletons for non-LLM external clients.

LLM and embedding calls are routed via the shared ``temporal.activities``
workflow helpers, so no LLM/embedding client lives here.
"""

from src.dms.dms_client import DMSClient
from src.qdrant.client import PlausibilityQdrantClient

dms_client = DMSClient()
qdrant_client = PlausibilityQdrantClient()
