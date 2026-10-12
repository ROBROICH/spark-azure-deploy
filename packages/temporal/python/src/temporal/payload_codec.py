import hashlib
import secrets
from collections.abc import Iterable, Sequence
from typing import Literal, Protocol, override

from pydantic import BaseModel, ConfigDict, Field
from temporalio.api.common.v1 import Payload
from temporalio.converter import PayloadCodec

MAX_PAYLOAD_SIZE = 1024 * 100  # 100 KB
S3_REFERENCE_ENCODING = b"binary/s3-reference"
S3_KEY_METADATA_KEY = "s3-key"
S3_REFERENCE_VERSION_METADATA_KEY = "s3-reference-version"
S3_REFERENCE_VERSION_LEGACY = b"0"
S3_REFERENCE_VERSION_WITH_CHECKSUM = b"1"
S3_SHA256_METADATA_KEY = "s3-sha256"
SHA256_HEX_LENGTH = 64


class PayloadStorage(Protocol):
    async def put(self, payload_data: bytes) -> str: ...

    async def get(self, key: str) -> bytes: ...


class S3ReferenceVersionMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    version: bytes = Field(
        default=S3_REFERENCE_VERSION_LEGACY,
        alias=S3_REFERENCE_VERSION_METADATA_KEY,
    )


class LegacyS3ReferenceMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    s3_key: str = Field(alias=S3_KEY_METADATA_KEY)
    version: Literal[b"0"] = Field(
        default=S3_REFERENCE_VERSION_LEGACY,
        alias=S3_REFERENCE_VERSION_METADATA_KEY,
    )


class ChecksummedS3ReferenceMetadata(BaseModel):
    model_config = ConfigDict(extra="ignore")

    s3_key: str = Field(alias=S3_KEY_METADATA_KEY)
    version: Literal[b"1"] = Field(alias=S3_REFERENCE_VERSION_METADATA_KEY)
    s3_sha256: str = Field(
        alias=S3_SHA256_METADATA_KEY,
        min_length=SHA256_HEX_LENGTH,
        max_length=SHA256_HEX_LENGTH,
    )


class LargePayloadCodec(PayloadCodec):
    def __init__(self, storage: PayloadStorage) -> None:
        self.storage = storage

    @override
    async def encode(self, payloads: Sequence[Payload]) -> list[Payload]:
        encoded_payloads: list[Payload] = []
        for p in payloads:
            payload_bytes = p.SerializeToString()
            if p.ByteSize() > MAX_PAYLOAD_SIZE:
                key = await self.storage.put(payload_bytes)
                checksum = hashlib.sha256(payload_bytes).hexdigest()
                encoded_payloads.append(
                    Payload(
                        metadata={
                            "encoding": S3_REFERENCE_ENCODING,
                            S3_KEY_METADATA_KEY: key.encode("utf-8"),
                            S3_REFERENCE_VERSION_METADATA_KEY: S3_REFERENCE_VERSION_WITH_CHECKSUM,
                            S3_SHA256_METADATA_KEY: checksum.encode("ascii"),
                        },
                        data=b"",
                    )
                )
            else:
                encoded_payloads.append(p)

        return encoded_payloads

    @override
    async def decode(self, payloads: Iterable[Payload]) -> list[Payload]:
        decoded_payloads: list[Payload] = []
        for p in payloads:
            if p.metadata.get("encoding") != S3_REFERENCE_ENCODING:
                decoded_payloads.append(p)
                continue

            decoded_payloads.append(await self._decode_s3_reference(p))

        return decoded_payloads

    async def _decode_s3_reference(self, payload: Payload) -> Payload:
        metadata = S3ReferenceVersionMetadata.model_validate(payload.metadata)
        if metadata.version == S3_REFERENCE_VERSION_LEGACY:
            return await self._decode_s3_reference_v0(payload)
        if metadata.version == S3_REFERENCE_VERSION_WITH_CHECKSUM:
            return await self._decode_s3_reference_v1(payload)
        raise ValueError(f"Unsupported S3 reference payload version: {metadata.version!r}")

    async def _decode_s3_reference_v0(self, payload: Payload) -> Payload:
        metadata = LegacyS3ReferenceMetadata.model_validate(payload.metadata)
        payload_data = await self.storage.get(metadata.s3_key)
        return Payload.FromString(payload_data)

    async def _decode_s3_reference_v1(self, payload: Payload) -> Payload:
        metadata = ChecksummedS3ReferenceMetadata.model_validate(payload.metadata)
        payload_data = await self.storage.get(metadata.s3_key)
        actual_checksum = hashlib.sha256(payload_data).hexdigest()
        if not secrets.compare_digest(metadata.s3_sha256, actual_checksum):
            raise ValueError("S3 reference payload checksum mismatch")
        return Payload.FromString(payload_data)
