import hashlib

import pytest
from temporal.payload_codec import (
    MAX_PAYLOAD_SIZE,
    S3_KEY_METADATA_KEY,
    S3_REFERENCE_ENCODING,
    S3_REFERENCE_VERSION_LEGACY,
    S3_REFERENCE_VERSION_METADATA_KEY,
    S3_REFERENCE_VERSION_WITH_CHECKSUM,
    S3_SHA256_METADATA_KEY,
    LargePayloadCodec,
)
from temporalio.api.common.v1 import Payload

pytestmark = pytest.mark.asyncio


class InMemoryStorage:
    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.next_key = "payloads/test-key"

    async def put(self, payload_data: bytes) -> str:
        self.objects[self.next_key] = payload_data
        return self.next_key

    async def get(self, key: str) -> bytes:
        return self.objects[key]


def _large_payload() -> Payload:
    return Payload(
        metadata={"encoding": b"json/plain"},
        data=b"x" * (MAX_PAYLOAD_SIZE + 1),
    )


async def test_small_payloads_are_not_offloaded() -> None:
    storage = InMemoryStorage()
    codec = LargePayloadCodec(storage)
    payload = Payload(metadata={"encoding": b"json/plain"}, data=b'{"hello":"world"}')

    encoded = await codec.encode([payload])

    assert encoded == [payload]
    assert storage.objects == {}


async def test_large_payloads_encode_as_checksum_reference_and_round_trip() -> None:
    storage = InMemoryStorage()
    codec = LargePayloadCodec(storage)
    payload = _large_payload()

    encoded = await codec.encode([payload])

    assert len(encoded) == 1
    reference = encoded[0]
    payload_bytes = payload.SerializeToString()
    assert reference.metadata["encoding"] == S3_REFERENCE_ENCODING
    assert reference.metadata[S3_KEY_METADATA_KEY] == storage.next_key.encode("utf-8")
    assert reference.metadata[S3_REFERENCE_VERSION_METADATA_KEY] == S3_REFERENCE_VERSION_WITH_CHECKSUM
    assert reference.metadata[S3_SHA256_METADATA_KEY] == hashlib.sha256(payload_bytes).hexdigest().encode("ascii")
    assert reference.data == b""
    assert storage.objects == {storage.next_key: payload_bytes}

    decoded = await codec.decode(encoded)

    assert decoded == [payload]


async def test_decode_rejects_modified_s3_payload_bytes() -> None:
    storage = InMemoryStorage()
    codec = LargePayloadCodec(storage)
    encoded = await codec.encode([_large_payload()])
    storage.objects[storage.next_key] = b"tampered"

    with pytest.raises(ValueError, match="checksum mismatch"):
        await codec.decode(encoded)


async def test_decode_rejects_modified_checksum_metadata() -> None:
    storage = InMemoryStorage()
    codec = LargePayloadCodec(storage)
    encoded = await codec.encode([_large_payload()])
    encoded[0].metadata[S3_SHA256_METADATA_KEY] = b"0" * 64

    with pytest.raises(ValueError, match="checksum mismatch"):
        await codec.decode(encoded)


async def test_decode_rejects_missing_checksum_metadata_for_v1() -> None:
    storage = InMemoryStorage()
    codec = LargePayloadCodec(storage)
    encoded = await codec.encode([_large_payload()])
    del encoded[0].metadata[S3_SHA256_METADATA_KEY]

    with pytest.raises(ValueError, match=S3_SHA256_METADATA_KEY):
        await codec.decode(encoded)


async def test_decode_rejects_missing_s3_key_metadata_for_v1() -> None:
    storage = InMemoryStorage()
    codec = LargePayloadCodec(storage)
    encoded = await codec.encode([_large_payload()])
    del encoded[0].metadata[S3_KEY_METADATA_KEY]

    with pytest.raises(ValueError, match=S3_KEY_METADATA_KEY):
        await codec.decode(encoded)


async def test_decode_accepts_legacy_v0_reference_without_checksum() -> None:
    storage = InMemoryStorage()
    codec = LargePayloadCodec(storage)
    payload = _large_payload()
    storage.objects[storage.next_key] = payload.SerializeToString()
    reference = Payload(
        metadata={
            "encoding": S3_REFERENCE_ENCODING,
            S3_KEY_METADATA_KEY: storage.next_key.encode("utf-8"),
            S3_REFERENCE_VERSION_METADATA_KEY: S3_REFERENCE_VERSION_LEGACY,
        },
        data=b"",
    )

    decoded = await codec.decode([reference])

    assert decoded == [payload]


async def test_decode_treats_missing_version_as_legacy_v0() -> None:
    storage = InMemoryStorage()
    codec = LargePayloadCodec(storage)
    payload = _large_payload()
    storage.objects[storage.next_key] = payload.SerializeToString()
    reference = Payload(
        metadata={
            "encoding": S3_REFERENCE_ENCODING,
            S3_KEY_METADATA_KEY: storage.next_key.encode("utf-8"),
        },
        data=b"",
    )

    decoded = await codec.decode([reference])

    assert decoded == [payload]


async def test_decode_rejects_unknown_reference_version() -> None:
    storage = InMemoryStorage()
    codec = LargePayloadCodec(storage)
    payload = _large_payload()
    storage.objects[storage.next_key] = payload.SerializeToString()
    reference = Payload(
        metadata={
            "encoding": S3_REFERENCE_ENCODING,
            S3_KEY_METADATA_KEY: storage.next_key.encode("utf-8"),
            S3_REFERENCE_VERSION_METADATA_KEY: b"2",
            S3_SHA256_METADATA_KEY: hashlib.sha256(payload.SerializeToString()).hexdigest().encode("ascii"),
        },
        data=b"",
    )

    with pytest.raises(ValueError, match="Unsupported S3 reference payload version"):
        await codec.decode([reference])
