"""HTTP client for docling-serve API communication.

Provides three public methods:
- convert_document: Monolithic submit+poll+fetch with sync fallback (legacy).
- submit_document: Async-only submit, returns task_id. Raises on failure.
- poll_and_fetch_result: Poll a submitted task, then fetch the result.

The async endpoint (/v1/convert/file/async) processes conversions in a
background worker, keeping docling-serve's health endpoint responsive.
convert_document falls back to the sync endpoint (/v1/convert/file) if
the async endpoint is not available (HTTP 404/405); the new split methods
require the async endpoint and raise on 404/405.
"""

import asyncio
import logging
import time
from collections.abc import Callable
from typing import Any

import httpx

from src.config import get_config, get_docling_image_export_mode
from src.utils.keycloak_token import get_keycloak_token_provider

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 3
MAX_NETWORK_ERRORS = 20
MAX_SUBMIT_RETRIES = 3
MAX_FETCH_RETRIES = 3
SUBMIT_RETRY_DELAY = 10
_RETRYABLE_STATUS_CODES = {502, 503, 504}
_BUSY_LOG_EVERY = 20
_TASK_LOST_STATUS = 404

# Poll/fetch requests must complete well within the 2-minute heartbeat timeout.
# The 300s client-level timeout is for large file uploads (submit); polls and
# fetches should never take that long.
_SHORT_TIMEOUT = httpx.Timeout(90.0, connect=30.0)


def _expired_budget(
    waited: int,
    queue_wait_timeout: int,
    compute_deadline: float | None,
    compute_timeout: int,
    position: int | None,
) -> str | None:
    """Which budget has run out, or None while one is still open.

    Queueing and converting are budgeted separately: a document that waited
    behind a full queue and was never converted must not be reported as a
    conversion timeout -- that message makes an overloaded docling-serve look
    exactly like a broken one.
    """
    if compute_deadline is None:
        if waited >= queue_wait_timeout:
            at = f" at queue position {position}" if position is not None else ""
            return f"did not start the task within {queue_wait_timeout}s{at}"
        return None
    if time.monotonic() >= compute_deadline:
        return f"conversion timed out after {compute_timeout}s"
    return None


class _PollRetries:
    """Retry bookkeeping for one polling loop.

    Two strategies, and telling them apart is the point: a network error may
    mean docling-serve is gone, while HTTP 502/503/504 means it is alive and
    overloaded, so the task is still on its way.
    """

    def __init__(self, task_id: str, log_fn: Callable[[str], None]) -> None:
        self.task_id = task_id
        self.log_fn = log_fn
        self.network_errors = 0
        self.http_errors = 0

    def on_network_error(self, error: Exception) -> None:
        """Count a transport failure, giving up once the server looks gone."""
        self.network_errors += 1
        self.log_fn(f"Network error polling task {self.task_id} ({self.network_errors}/{MAX_NETWORK_ERRORS}): {error}")
        if self.network_errors >= MAX_NETWORK_ERRORS:
            raise RuntimeError(
                f"docling-serve unreachable after {MAX_NETWORK_ERRORS} "
                f"consecutive network errors (task_id={self.task_id}): {error}"
            ) from error

    def on_busy(self, status_code: int, seconds_left: int) -> None:
        """Count an overload response, logging occasionally rather than on every poll."""
        self.http_errors += 1
        if self.http_errors % _BUSY_LOG_EVERY == 1:
            self.log_fn(
                f"docling-serve busy (HTTP {status_code}), still polling task {self.task_id} "
                f"({self.http_errors} retries, {seconds_left}s remaining)"
            )

    def on_reachable(self) -> None:
        """Any reply proves the server is alive, whatever its status code."""
        self.network_errors = 0

    def on_usable_response(self) -> None:
        """A response that is not an overload reply also clears the busy count."""
        self.http_errors = 0


class DoclingTaskLostError(RuntimeError):
    """Raised when a docling task_id returns 404 — pod likely restarted."""

    def __init__(self, task_id: str) -> None:
        self.task_id = task_id
        super().__init__(f"docling-serve task lost — pod likely restarted (task_id={task_id})")


class DoclingApiClient:
    """Handles HTTP communication with docling-serve API."""

    def __init__(self, base_url: str, timeout: int, queue_wait_timeout: int | None = None) -> None:
        """
        Args:
            base_url: docling-serve base URL.
            timeout: Budget once the task is reported as started (compute).
            queue_wait_timeout: Budget while the task is still pending in the
                queue. Defaults to ``timeout`` when not given, so callers that
                only know one number keep a sane bound on both phases.
        """
        self.base_url = base_url
        self.timeout = timeout
        self.queue_wait_timeout = queue_wait_timeout if queue_wait_timeout is not None else timeout

    def _form_data(self) -> dict[str, Any]:
        """Shared form data for both sync and async endpoints."""
        return {
            "to_formats": ["md", "json"],
            "image_export_mode": get_docling_image_export_mode(),
            "do_ocr": "true",
            "ocr_engine": get_config().DOCLING_OCR_ENGINE,
            "ocr_lang": get_config().DOCLING_OCR_LANG,
            "table_mode": "accurate",
            "document_timeout": str(self.timeout),
        }

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def convert_document(
        self,
        pdf_bytes: bytes,
        pdf_filename: str,
        heartbeat_fn: Callable[[str], None] | None = None,
        log_fn: Callable[[str], None] | None = None,
    ) -> dict[str, Any]:
        """
        Convert a PDF document via docling-serve.

        Tries the async endpoint first (submit/poll/fetch). If the async
        endpoint is not available (404/405), falls back to the blocking
        sync endpoint transparently.

        Args:
            pdf_bytes: Raw PDF file bytes
            pdf_filename: Original filename of the PDF
            heartbeat_fn: Called each poll iteration (e.g. activity.heartbeat)
            log_fn: Called for key status messages (e.g. activity.logger.info)

        Returns:
            API response dict with document JSON and markdown content

        Raises:
            RuntimeError: If conversion fails, times out, or the task is lost
        """

        def _log(msg: str) -> None:
            """Log a message to both the module logger and the optional callback."""
            logger.info(msg)
            if log_fn:
                log_fn(msg)

        # Timeout for async requests: 5 min read allows large file uploads
        # on submit and large result downloads on fetch; poll responses are tiny.
        async_timeout = httpx.Timeout(300.0, connect=30.0)

        async with httpx.AsyncClient(
            timeout=async_timeout,
            auth=get_keycloak_token_provider(),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=5),
        ) as client:
            # Try async endpoint first, with retries for transient errors
            task_id = await self._submit_with_retries(client, pdf_bytes, pdf_filename, _log, heartbeat_fn)
            if task_id is None:
                # Fallback to sync was triggered
                return await self._convert_sync(pdf_bytes, pdf_filename, _log, heartbeat_fn)

            # Poll until task completes
            await self._poll_until_done(client, task_id, heartbeat_fn, _log)

            # Fetch result
            return await self._fetch_result(client, task_id)

    async def submit_document(
        self,
        pdf_bytes: bytes,
        pdf_filename: str,
        log_fn: Callable[[str], None] | None = None,
        heartbeat_fn: Callable[[str], None] | None = None,
    ) -> str:
        """Submit a document for async conversion (does NOT poll).

        Always uses the async endpoint. Requires docling-serve to support
        the /v1/convert/file/async endpoint.

        Raises:
            RuntimeError: If all submit retries fail or async endpoint unavailable.
        """
        _log = log_fn or logger.info

        # 120s keeps the upload well within the 2-minute heartbeat timeout.
        upload_timeout = httpx.Timeout(120.0, connect=30.0)
        async with httpx.AsyncClient(
            timeout=upload_timeout,
            auth=get_keycloak_token_provider(),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=5),
        ) as client:
            task_id = await self._submit_with_retries(client, pdf_bytes, pdf_filename, _log, heartbeat_fn)
            if task_id is None:
                raise RuntimeError(
                    f"docling-serve async endpoint unavailable (404/405) for '{pdf_filename}'. "
                    f"The async endpoint is required — ensure docling-serve supports /v1/convert/file/async."
                )
            return task_id

    async def poll_and_fetch_result(
        self,
        task_id: str,
        heartbeat_fn: Callable[[str], None] | None = None,
        log_fn: Callable[[str], None] | None = None,
    ) -> dict[str, Any]:
        """Poll a previously submitted task until done, then fetch the result.

        Raises:
            DoclingTaskLostError: If the task returns 404 (pod restarted).
            RuntimeError: For other failures (timeout, conversion error, fetch failure).
        """
        if not task_id:
            raise ValueError("task_id must be a non-empty string")

        _log = log_fn or logger.info

        async_timeout = httpx.Timeout(300.0, connect=30.0)
        async with httpx.AsyncClient(
            timeout=async_timeout,
            auth=get_keycloak_token_provider(),
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=5),
        ) as client:
            await self._poll_until_done(client, task_id, heartbeat_fn, _log)
            return await self._fetch_result(client, task_id)

    # ------------------------------------------------------------------
    # Async path: submit → poll → fetch
    # ------------------------------------------------------------------

    async def _submit_with_retries(
        self,
        client: httpx.AsyncClient,
        pdf_bytes: bytes,
        pdf_filename: str,
        log_fn: Callable[[str], None],
        heartbeat_fn: Callable[[str], None] | None,
    ) -> str | None:
        """Submit with retries for transient errors.

        Returns task_id on success, None if sync fallback should be used.
        Raises RuntimeError (with concise message) if all retries fail.
        """
        last_error: Exception | None = None

        for attempt in range(1, MAX_SUBMIT_RETRIES + 1):
            if heartbeat_fn:
                heartbeat_fn(f"submitting to docling (attempt {attempt})")
            try:
                task_id = await self._submit_async(client, pdf_bytes, pdf_filename)
                log_fn(f"Async docling task submitted: {task_id}")
                return task_id
            except httpx.HTTPStatusError as e:
                if e.response.status_code in (404, 405):
                    log_fn("Async endpoint not available, falling back to sync endpoint")
                    return None
                if e.response.status_code in _RETRYABLE_STATUS_CODES:
                    last_error = e
                    log_fn(
                        f"Submit attempt {attempt}/{MAX_SUBMIT_RETRIES} "
                        f"got HTTP {e.response.status_code} "
                        f"for '{pdf_filename}'"
                    )
                    if attempt < MAX_SUBMIT_RETRIES:
                        await asyncio.sleep(SUBMIT_RETRY_DELAY)
                    continue
                raise RuntimeError(
                    f"docling-serve submit failed: HTTP {e.response.status_code} for {pdf_filename}"
                ) from None
            except httpx.TransportError as e:
                last_error = e
                log_fn(
                    f"Submit attempt {attempt}/{MAX_SUBMIT_RETRIES} failed "
                    f"for '{pdf_filename}': {type(e).__name__}: {e}"
                )
                if attempt < MAX_SUBMIT_RETRIES:
                    await asyncio.sleep(SUBMIT_RETRY_DELAY)

        raise RuntimeError(
            f"docling-serve submit failed after {MAX_SUBMIT_RETRIES} attempts "
            f"for '{pdf_filename}': {type(last_error).__name__}"
        )

    async def _submit_async(
        self,
        client: httpx.AsyncClient,
        pdf_bytes: bytes,
        pdf_filename: str,
    ) -> str:
        """Submit a document for async conversion. Returns the task_id."""
        response = await client.post(
            f"{self.base_url}/v1/convert/file/async",
            files={"files": (pdf_filename, pdf_bytes, "application/pdf")},
            data=self._form_data(),
        )
        response.raise_for_status()
        data = response.json()
        task_id = data.get("task_id")
        if not task_id:
            raise RuntimeError(f"docling-serve did not return a task_id (keys: {list(data.keys())})")
        return task_id

    async def _poll_until_done(
        self,
        client: httpx.AsyncClient,
        task_id: str,
        heartbeat_fn: Callable[[str], None] | None,
        log_fn: Callable[[str], None],
    ) -> None:
        """Poll the task status until success or failure.

        Queueing and converting get separate budgets: a document that waited
        behind a full queue and was never converted must not be reported as a
        conversion timeout.

        Two retry strategies:
        - Network errors (ReadTimeout, ConnectError): server may be dead.
          Give up after MAX_NETWORK_ERRORS consecutive failures.
        - HTTP 502/503/504: server IS alive, just overloaded.
          Keep polling until the active deadline — the task is still processing.
        """
        queued_at = time.monotonic()
        compute_deadline: float | None = None
        position: int | None = None
        retries = _PollRetries(task_id, log_fn)

        while True:
            waited = int(time.monotonic() - queued_at)
            expired = _expired_budget(waited, self.queue_wait_timeout, compute_deadline, self.timeout, position)
            if expired is not None:
                raise RuntimeError(f"docling-serve {expired} (task_id={task_id})")

            if heartbeat_fn:
                at = f" position {position}" if position is not None else ""
                state = "converting" if compute_deadline is not None else f"queued{at}, {waited}s"
                heartbeat_fn(f"polling docling task {task_id} — {state}")

            try:
                response = await client.get(
                    f"{self.base_url}/v1/status/poll/{task_id}",
                    timeout=_SHORT_TIMEOUT,
                )
            except httpx.TransportError as e:
                retries.on_network_error(e)
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                continue

            # A reply of any kind proves the server is reachable, so the network
            # counter resets before the overload check -- otherwise alternating
            # transport errors and 503s add up to a false "unreachable".
            retries.on_reachable()

            if response.status_code in _RETRYABLE_STATUS_CODES:
                deadline = compute_deadline if compute_deadline is not None else queued_at + self.queue_wait_timeout
                retries.on_busy(response.status_code, int(deadline - time.monotonic()))
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                continue

            retries.on_usable_response()

            if response.status_code == _TASK_LOST_STATUS:
                raise DoclingTaskLostError(task_id)
            response.raise_for_status()

            data = response.json()
            if not isinstance(data, dict):
                raise RuntimeError(f"docling-serve returned non-dict poll response: {type(data).__name__}")
            status = data.get("task_status", "")
            reported = data.get("task_position")
            if isinstance(reported, int):
                position = reported
            log_fn(
                f"Docling task {task_id} status: {status}"
                + (f" (queue position {reported})" if reported is not None else "")
            )

            if status == "success":
                return
            if status == "failure":
                raise RuntimeError(f"docling-serve async conversion failed (task_id={task_id})")
            if status == "started" and compute_deadline is None:
                log_fn(f"Docling task {task_id} started after {waited}s in the queue")
                compute_deadline = time.monotonic() + self.timeout
            # "pending" / "started" → sleep and continue polling
            await asyncio.sleep(POLL_INTERVAL_SECONDS)

    async def _fetch_result(
        self,
        client: httpx.AsyncClient,
        task_id: str,
    ) -> dict[str, Any]:
        """Fetch the conversion result for a completed task.

        Retries on transient errors to avoid re-submitting the entire
        document just because the result download failed once.
        """
        last_error: Exception | None = None

        for attempt in range(1, MAX_FETCH_RETRIES + 1):
            try:
                response = await client.get(
                    f"{self.base_url}/v1/result/{task_id}",
                    timeout=_SHORT_TIMEOUT,
                )
                if response.status_code in _RETRYABLE_STATUS_CODES:
                    last_error = RuntimeError(f"HTTP {response.status_code}")
                    logger.warning(
                        f"Fetch attempt {attempt}/{MAX_FETCH_RETRIES} "
                        f"got HTTP {response.status_code} for task {task_id}"
                    )
                    if attempt < MAX_FETCH_RETRIES:
                        await asyncio.sleep(SUBMIT_RETRY_DELAY)
                    continue
                response.raise_for_status()
                return self._validate_result(response.json())
            except httpx.TransportError as e:
                last_error = e
                logger.warning(
                    f"Fetch attempt {attempt}/{MAX_FETCH_RETRIES} failed for task {task_id}: {type(e).__name__}: {e}"
                )
                if attempt < MAX_FETCH_RETRIES:
                    await asyncio.sleep(SUBMIT_RETRY_DELAY)

        raise RuntimeError(
            f"docling-serve fetch failed after {MAX_FETCH_RETRIES} attempts "
            f"(task_id={task_id}): {type(last_error).__name__}"
        )

    # ------------------------------------------------------------------
    # Sync fallback: single blocking POST
    # ------------------------------------------------------------------

    async def _convert_sync(
        self,
        pdf_bytes: bytes,
        pdf_filename: str,
        log_fn: Callable[[str], None],
        heartbeat_fn: Callable[[str], None] | None = None,
    ) -> dict[str, Any]:
        """Blocking sync conversion — used when async endpoint is unavailable.

        Fires heartbeats concurrently so Temporal doesn't kill the activity
        during long-running conversions.
        """
        log_fn(f"Sync docling conversion for '{pdf_filename}' (timeout: {self.timeout}s)")
        timeout = httpx.Timeout(float(self.timeout), connect=30.0)

        async def _do_post() -> httpx.Response:
            """Send the synchronous conversion request to docling-serve."""
            async with httpx.AsyncClient(
                timeout=timeout,
                auth=get_keycloak_token_provider(),
                limits=httpx.Limits(max_connections=20, max_keepalive_connections=5),
            ) as client:
                response = await client.post(
                    f"{self.base_url}/v1/convert/file",
                    files={"files": (pdf_filename, pdf_bytes, "application/pdf")},
                    data=self._form_data(),
                )
                response.raise_for_status()
                return response

        if heartbeat_fn:
            # Run POST and heartbeat loop concurrently so Temporal doesn't
            # cancel the activity during a multi-minute sync conversion.
            post_task = asyncio.create_task(_do_post())
            try:
                while not post_task.done():
                    heartbeat_fn("sync docling conversion in progress")
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
                response = await post_task
            except BaseException:
                post_task.cancel()
                raise
        else:
            response = await _do_post()

        return self._validate_result(response.json())

    # ------------------------------------------------------------------
    # Shared validation
    # ------------------------------------------------------------------

    @staticmethod
    def _validate_result(result: dict[str, Any]) -> dict[str, Any]:
        """Validate the conversion result, raise on failure/skipped."""
        status = result.get("status", "")
        if status == "failure":
            errors = result.get("errors", [])
            raise RuntimeError(f"docling-serve conversion failed: {errors}")
        if status == "skipped":
            raise RuntimeError("docling-serve skipped document processing")
        return result
