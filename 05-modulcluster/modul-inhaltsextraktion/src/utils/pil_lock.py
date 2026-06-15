"""Thread lock for Pillow (PIL) image operations (not thread-safe).

Pillow wraps C libraries (libjpeg, libpng, libwebp) that are not thread-safe.
Concurrent Image.open/save/resize calls from different Temporal activity threads
can corrupt the glibc heap ("corrupted double-linked list").

All PIL image operations that touch pixel data must be serialized through this lock.
"""

import threading

_pil_lock = threading.Lock()
