"""History aggregator package.

Re-exports the public entrypoint ``fetch_history`` so callers keep a stable
import path (``from src.services.history import fetch_history``).
"""

from src.services.history.service import fetch_history

__all__ = ["fetch_history"]
