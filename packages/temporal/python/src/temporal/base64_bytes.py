from __future__ import annotations

import base64
from typing import Annotated

from pydantic import BeforeValidator, PlainSerializer


def _coerce_base64_bytes(value: object) -> bytes:
    if isinstance(value, bytes):
        return value
    if isinstance(value, bytearray):
        return bytes(value)
    if isinstance(value, memoryview):
        return value.tobytes()
    if isinstance(value, str):
        try:
            return base64.b64decode(value)
        except Exception as error:
            raise ValueError("Invalid base64-encoded string") from error
    raise TypeError(f"Expected bytes or base64 string, got {type(value).__name__}")


def _encode_base64(value: bytes) -> str:
    return base64.b64encode(value).decode("ascii")


Base64Bytes = Annotated[
    bytes,
    BeforeValidator(_coerce_base64_bytes),
    PlainSerializer(_encode_base64, return_type=str, when_used="json"),
]
