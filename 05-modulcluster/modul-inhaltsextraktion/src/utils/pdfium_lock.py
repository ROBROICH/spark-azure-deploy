"""Thread lock for pypdfium2 (not thread-safe)."""

import threading

# pypdfium2 wraps PDFium (C library) which is not thread-safe.
# All pypdfium2 usage must be serialized through this lock.
_pdfium_lock = threading.Lock()
