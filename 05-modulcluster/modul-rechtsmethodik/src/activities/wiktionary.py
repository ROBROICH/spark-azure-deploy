"""Wiktionary lookup activity for retrieving word definitions."""

import re
from datetime import timedelta
from urllib.parse import quote

import bleach
import httpx
from pydantic import BaseModel
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.log.logger import Logger

logger = Logger("Wiktionary")

_EN_WIKTIONARY_REST = "https://en.wiktionary.org/api/rest_v1/page/definition"
_MAX_WORD_LEN = 100
_MAX_RESPONSE_BYTES = 1_000_000
_VALID_WORD = re.compile(r"^[\w\-' ]+$", re.UNICODE)
_TRANSIENT_STATUS_CODES = {429, 502, 503}


class WikiMeaningOutput(BaseModel):
    """Wiktionary output containing the canonical URL and extracted meaning texts."""

    url: str
    meanings: list[str]


def _strip_html(text: str) -> str:
    return bleach.clean(text, tags=[], strip=True).strip()


def _safe_word_for_log(word: str) -> str:
    """Sanitize user input for log output to prevent log injection."""
    return repr(word[:50])


@activity.defn(name="get_wiktionary_meaning")
async def _get_wiktionary_meaning(word: str) -> WikiMeaningOutput:  # noqa: PLR0911, PLR0912
    """Temporal activity: look up word meaning from Wiktionary."""
    # Input validation: reject empty, too long, or unexpected characters.
    if not word or len(word) > _MAX_WORD_LEN or not _VALID_WORD.match(word):
        logger.warning(f"Wiktionary: invalid word {_safe_word_for_log(word)}")
        return WikiMeaningOutput(url="", meanings=[])

    encoded = quote(word, safe="")
    page_url = f"https://en.wiktionary.org/wiki/{encoded}"
    headers = {
        "User-Agent": "SPARK Workflow (https://opencode.de/de/software/spark-workflow-10117; spark@bmds.bund.de)"
    }

    try:
        async with httpx.AsyncClient(timeout=10.0, headers=headers) as client:
            resp = await client.get(f"{_EN_WIKTIONARY_REST}/{encoded}")

        # Transient errors: let them propagate so Temporal retries the activity.
        if resp.status_code in _TRANSIENT_STATUS_CODES:
            raise httpx.HTTPStatusError(
                f"transient HTTP {resp.status_code}",
                request=resp.request,
                response=resp,
            )
        if resp.status_code != httpx.codes.OK:
            logger.warning(f"Wiktionary: HTTP {resp.status_code} for {_safe_word_for_log(word)}")
            return WikiMeaningOutput(url=page_url, meanings=[])

        # Defend against oversized responses (DoS).
        if len(resp.content) > _MAX_RESPONSE_BYTES:
            logger.warning(f"Wiktionary: response too large for {_safe_word_for_log(word)}")
            return WikiMeaningOutput(url=page_url, meanings=[])

        try:
            data: dict[str, object] = resp.json()
        except ValueError:
            return WikiMeaningOutput(url=page_url, meanings=[])

        # Defensive: validate response structure before iterating.
        entries = data.get("de", [])
        if not isinstance(entries, list):
            logger.warning(f"Wiktionary: unexpected schema for {_safe_word_for_log(word)}")
            return WikiMeaningOutput(url=page_url, meanings=[])

        meanings: list[str] = []
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            definitions = entry.get("definitions", [])
            if not isinstance(definitions, list):
                continue
            for defn in definitions:
                if not isinstance(defn, dict):
                    continue
                text = _strip_html(str(defn.get("definition", "")))
                if text:
                    meanings.append(text)
        return WikiMeaningOutput(url=page_url, meanings=meanings)
    except httpx.HTTPStatusError:
        # Re-raise transient errors so Temporal can retry.
        raise
    except (httpx.HTTPError, ValueError, KeyError) as e:
        logger.warning(f"Wiktionary failed for {_safe_word_for_log(word)}: {type(e).__name__}: {e}")
        return WikiMeaningOutput(url=page_url, meanings=[])


async def get_wiktionary_meaning(word: str) -> WikiMeaningOutput:
    """Invoke the Wiktionary activity via Temporal with retry policy."""
    return await workflow.execute_activity(
        _get_wiktionary_meaning,
        word,
        start_to_close_timeout=timedelta(seconds=30),
        retry_policy=RetryPolicy(maximum_attempts=3),
    )
