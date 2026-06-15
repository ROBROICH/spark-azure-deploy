# src/activities/vlm_invoke.py
"""
Temporal activities for VLM (Visual Language Model) operations.

Following Temporal best practices, VLM API calls are Temporal activities,
providing independent retries, durability, and observability for each call.
"""

import asyncio
import base64
import hashlib
import io
import mimetypes
import threading
from collections import OrderedDict
from datetime import timedelta

# Pillow for image processing (replaces pyvips to eliminate libvips CVEs)
from PIL import Image
from prompt_injection.prompt_defense import wrap_system_prompt
from pydantic import BaseModel
from temporal import Base64Bytes
from temporal.activities.vlm import vlm_invoke as _shared_vlm_invoke
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.config import get_config
from src.env import ENV
from src.utils.pil_lock import _pil_lock
from src.workflows.vlm_enhancement.prompt import (
    VLM_DESCRIPTION_PROMPT,
    VLM_EXTRACTION_PROMPT,
)

# --- Bounded Image Cache ---
# Caches compressed image bytes to avoid duplicate compression
# when extraction and description activities process the same image.
_IMAGE_CACHE_MAX_SIZE = 200
_image_cache: OrderedDict[str, tuple[bytes, str]] = OrderedDict()
_image_cache_lock = threading.Lock()


def _image_cache_get(key: str) -> tuple[bytes, str] | None:
    """Get a cached compressed image, moving it to the end (most recently used)."""
    with _image_cache_lock:
        if key in _image_cache:
            _image_cache.move_to_end(key)
            return _image_cache[key]
        return None


def _image_cache_put(key: str, value: tuple[bytes, str]) -> None:
    """Store a compressed image in the cache, evicting oldest if at capacity."""
    with _image_cache_lock:
        if key in _image_cache:
            _image_cache.move_to_end(key)
        elif len(_image_cache) >= _IMAGE_CACHE_MAX_SIZE:
            _image_cache.popitem(last=False)
        _image_cache[key] = value



# Maximum size for VLM images
VLM_IMAGE_MAX_BYTES = 400_000  # 400KB


def _compress_image_for_vlm(image_bytes: bytes, image_ref: str) -> tuple[bytes, str]:
    """
    Compress image to JPEG using Pillow with progressive quality/size reduction.

    Strategy:
    1. Start at Q=90, reduce by 5 until Q=75 if too large
    2. If still too large at Q=75, resize by 20% and restart quality loop
    3. Repeat until image fits under size limit

    Args:
        image_bytes: Original image bytes
        image_ref: Image reference for logging

    Returns:
        Tuple of (compressed_image_bytes, mime_type)
    """
    original_size = len(image_bytes)

    try:
        # All PIL operations serialized through _pil_lock — Pillow's C libraries
        # (libjpeg, libpng) are not thread-safe and concurrent access from
        # Temporal activity threads causes glibc heap corruption.
        with _pil_lock:
            img = Image.open(io.BytesIO(image_bytes))
            original_width, original_height = img.size

            # Convert to RGB if necessary (handles RGBA, P, L modes)
            if img.mode in ("RGBA", "LA", "P"):
                # Create white background and paste image with alpha
                background = Image.new("RGB", img.size, (255, 255, 255))
                if img.mode == "P":
                    img = img.convert("RGBA")
                if img.mode in ("RGBA", "LA"):
                    background.paste(img, mask=img.split()[-1])  # Use alpha as mask
                else:
                    background.paste(img)
                img = background
            elif img.mode != "RGB":
                img = img.convert("RGB")

            original_img = img
            current_img = img
            current_width = original_width
            current_height = original_height
            scale_factor = 1.0
            compressed_bytes: bytes = b""

            # Loop: reduce quality, then resize if needed
            max_resize_iterations = 20  # Safety limit (0.8^20 ≈ 1% of original size)
            for _resize_iteration in range(max_resize_iterations):
                # Try quality levels: 90 -> 85 -> 80 -> 75
                for quality in [90, 85, 80, 75]:
                    buffer = io.BytesIO()
                    current_img.save(buffer, format="JPEG", quality=quality, optimize=True)
                    compressed_bytes = buffer.getvalue()

                    if len(compressed_bytes) <= VLM_IMAGE_MAX_BYTES:
                        activity.logger.info(
                            f"Image {image_ref}: {original_width}x{original_height}px -> "
                            f"{current_width}x{current_height}px, "
                            f"{original_size / 1024:.1f}KB -> {len(compressed_bytes) / 1024:.1f}KB "
                            f"(Q={quality}, scale={scale_factor:.0%})"
                        )
                        return compressed_bytes, "image/jpeg"

                # Quality reduction didn't help enough, resize by 20%
                scale_factor *= 0.8
                current_width = int(original_width * scale_factor)
                current_height = int(original_height * scale_factor)
                current_img = original_img.resize((current_width, current_height), Image.Resampling.LANCZOS)
                activity.logger.debug(
                    f"Resizing {image_ref} to {current_width}x{current_height}px (scale={scale_factor:.0%})"
                )

            # If we get here, return the last compressed version anyway
            activity.logger.warning(
                f"Image {image_ref} still large after max compression: {len(compressed_bytes) / 1024:.1f}KB"
            )
            return compressed_bytes, "image/jpeg"

    except Exception as e:
        activity.logger.warning(f"Failed to compress image {image_ref}: {e}. Using original.")
        mime_type, _ = mimetypes.guess_type(image_ref)
        if mime_type is None:
            mime_type = "image/jpeg"
        return image_bytes, mime_type


# --- VLM Activities ---


class PrepareVlmImageInput(BaseModel):
    """Input for the vlm_invoke activity."""

    image_data: Base64Bytes
    image_ref: str
    element_type: str = "image"

class PrepareVlmImageOutput(BaseModel):
    """Output of the prepare_vlm_image activity: compressed+encoded image."""

    image_b64: str
    image_mime: str


@activity.defn(name="prepare_vlm_image")
async def _prepare_vlm_image(
    input: PrepareVlmImageInput,
) -> PrepareVlmImageOutput:
    """
    VLM invocation activity that receives image bytes directly.
    """
    image_bytes = bytes(input.image_data)
    image_ref = input.image_ref
    element_type = input.element_type

    activity.logger.info(f"Preparing VLM image: {image_ref} ({element_type})")

    # Cache key: hash of image content
    image_hash = hashlib.sha256(image_bytes).hexdigest()

    # Resize and encode image (prevents 413 errors from cloud APIs)
    # Use in-memory cache to avoid re-compressing the same image
    # when extraction and description activities process the same image.
    cached_image = _image_cache_get(image_hash)
    if cached_image is not None:
        processed_bytes, mime_type = cached_image
        activity.logger.info(f"Image cache hit for {image_ref}")
    else:
        try:
            loop = asyncio.get_running_loop()
            processed_bytes, mime_type = await loop.run_in_executor(
                None, _compress_image_for_vlm, image_bytes, image_ref
            )
        except Exception as e:
            activity.logger.error(f"Failed to encode {element_type} {image_ref}: {e}")
            raise RuntimeError(f"Failed to prepare {element_type} for VLM: {e}") from e
        _image_cache_put(image_hash, (processed_bytes, mime_type))

    image_b64 = base64.b64encode(processed_bytes).decode("utf-8")
    return PrepareVlmImageOutput(image_b64=image_b64, image_mime=mime_type)


# --- Workflow-Facing Wrappers ---


async def _prepare_and_invoke_vlm(
        image_data: bytes,
        image_ref: str,
        element_type: str,
        prompt: str,
) -> str:
    """
        Shared helper: prepare image locally then dispatch to shared VLM service.

        Step 1: run compression+encoding as a local activity (CPU-bound, uses Pillow).
        Step 2: dispatch the VLM call to the shared llm-client worker.
        """
    cfg = get_config()
    prepared = await workflow.execute_activity(
        _prepare_vlm_image,
        PrepareVlmImageInput(
            image_data=image_data,
            image_ref=image_ref,
            element_type=element_type,
        ),
        start_to_close_timeout=timedelta(minutes=cfg.VLM_ACTIVITY_TIMEOUT_MINUTES),
        retry_policy=RetryPolicy(
            maximum_attempts=cfg.TEMPORAL_VLM_ACTIVITY_MAX_ATTEMPTS,
            initial_interval=timedelta(seconds=10),
            backoff_coefficient=2,
            maximum_interval=timedelta(seconds=60),
        ),
    )
    # The shared VLM service puts `prompt` as text alongside the image in the user
    # message.
    # Retry policy is intentionally omitted: the shared service applies its own
    # default retry policy (_DEFAULT_RETRY, 5 attempts). 
    return await _shared_vlm_invoke(
        image_b64=prepared.image_b64,
        image_mime=prepared.image_mime,
        prompt="",
        system_prompt=wrap_system_prompt(prompt, lang="vlm_de"),
        model=ENV.VLLM_MODEL,
        temperature=0,
        max_completion_tokens=cfg.VLM_MAX_TOKENS,
        top_p=1.0
    )


async def vlm_extract_content(
    image_data: bytes,
    image_ref: str,
    element_type: str,
) -> str:
    """
    Workflow wrapper for VLM content extraction.

    Extracts text and table content from an image using VLM.
    """
    return await _prepare_and_invoke_vlm(
        image_data=image_data,
        image_ref=image_ref,
        element_type=element_type,
        prompt=VLM_EXTRACTION_PROMPT,
    )


async def vlm_describe_image(
    image_data: bytes,
    image_ref: str,
) -> str:
    """
    Workflow wrapper for VLM image description.

    Generates a brief visual description of an image using VLM.
    """
    return await _prepare_and_invoke_vlm(
        image_data=image_data,
        image_ref=image_ref,
        element_type="image",
        prompt=VLM_DESCRIPTION_PROMPT,
    )
