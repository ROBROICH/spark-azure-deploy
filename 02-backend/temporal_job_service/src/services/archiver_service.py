import asyncio
import base64
import gzip
import json
import logging
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Any

from cryptography.fernet import Fernet
from google.protobuf.json_format import MessageToDict
from temporal.payload_codec import LargePayloadCodec
from temporal.s3_payload_storage import S3PayloadStorage
from temporalio.api.common.v1 import Payload
from temporalio.client import Client

logger = logging.getLogger("temporal.history_archiver")

_JSON_ENCODINGS = {b"json/plain", b"json/protobuf"}


class HistoryArchiver:
    def __init__(
        self,
        s3: S3PayloadStorage,
        codec: LargePayloadCodec,
        bucket: str,
        prefix: str = "temporal-history",
        encryption_key: str | None = None,
    ) -> None:
        self._s3 = s3
        self._codec = codec
        self._bucket = bucket
        self._prefix = prefix.strip("/")
        # When an encryption key is configured, archive bodies are encrypted
        # with Fernet (AES-128-CBC + HMAC) before being written to the bucket.
        self._fernet = Fernet(encryption_key.encode("utf-8")) if encryption_key else None

    async def archive(
        self,
        client: Client,
        workflow_id: str,
        run_id: str,
        workflow_type: str,
        status: str,
        project_id: str | None,
        project_version: str | None,
    ) -> str:
        handle = client.get_workflow_handle(workflow_id, run_id=run_id)
        history = await handle.fetch_history()

        events_json: list[dict[str, Any]] = []
        for event in history.events:
            await self._resolve_event_payloads(event)
            ev_dict = await asyncio.to_thread(_serialize_event, event)
            events_json.append(ev_dict)

        envelope = {
            "workflow_id": workflow_id,
            "run_id": run_id,
            "workflow_type": workflow_type,
            "project_id": project_id,
            "project_version": project_version,
            "status": status,
            "archived_at": datetime.now(UTC).isoformat(),
            "events": events_json,
        }
        body = await asyncio.to_thread(_encode_envelope, envelope)
        if self._fernet is not None:
            # Compress first, then encrypt: ciphertext is incompressible.
            body = await asyncio.to_thread(self._fernet.encrypt, body)

        key = self._archive_key(
            workflow_id=workflow_id,
            run_id=run_id,
            workflow_type=workflow_type,
            project_id=project_id,
        )
        content_type = "application/octet-stream" if self._fernet is not None else "application/gzip"
        return await self._s3.put_bytes(key=key, payload_data=body, content_type=content_type)

    def _archive_key(
        self,
        *,
        workflow_id: str,
        run_id: str,
        workflow_type: str,
        project_id: str | None,
    ) -> str:
        project_segment = project_id or "unknown"
        return f"{self._prefix}/{project_segment}/{workflow_type}/{workflow_id}/{run_id}.json.gz"

    async def _resolve_event_payloads(self, event: Any) -> None:
        for payload in _iter_payloads(event):
            if payload.metadata.get("encoding") == b"binary/s3-reference":
                decoded = (await self._codec.decode([payload]))[0]
                payload.metadata.clear()
                for k, v in decoded.metadata.items():
                    payload.metadata[k] = v
                payload.data = decoded.data


def _serialize_event(event: Any) -> dict[str, Any]:
    ev_dict = MessageToDict(event, preserving_proto_field_name=True)
    _inline_decoded_payloads(ev_dict)
    return ev_dict


def _encode_envelope(envelope: dict[str, Any]) -> bytes:
    return gzip.compress(json.dumps(envelope).encode("utf-8"))


def _iter_payloads(message: Any) -> Iterator[Payload]:
    stack = [message]
    while stack:
        msg = stack.pop()
        for field, value in msg.ListFields():
            if field.message_type is None:
                continue
            if field.label == field.LABEL_REPEATED:
                for item in value:
                    if isinstance(item, Payload):
                        yield item
                    elif hasattr(item, "ListFields"):
                        stack.append(item)
            elif isinstance(value, Payload):
                yield value
            elif hasattr(value, "ListFields"):
                stack.append(value)


def _inline_decoded_payloads(obj: Any) -> None:
    if isinstance(obj, dict):
        encoding = obj.get("metadata", {}).get("encoding") if "metadata" in obj else None
        if encoding and "data" in obj:
            try:
                enc_bytes = base64.b64decode(encoding) if isinstance(encoding, str) else encoding
            except Exception:
                enc_bytes = None
            data_str = obj.get("data")
            if enc_bytes in _JSON_ENCODINGS and isinstance(data_str, str):
                try:
                    raw = base64.b64decode(data_str)
                    obj["decoded"] = json.loads(raw.decode("utf-8"))
                except Exception:
                    pass
        for v in obj.values():
            _inline_decoded_payloads(v)
    elif isinstance(obj, list):
        for v in obj:
            _inline_decoded_payloads(v)
