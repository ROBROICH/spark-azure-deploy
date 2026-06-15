import gzip
import json
from unittest.mock import AsyncMock, MagicMock

import pytest
from cryptography.fernet import Fernet
from temporalio.api.common.v1 import Payload
from temporalio.api.history.v1 import History, HistoryEvent

from src.services.archiver_service import HistoryArchiver

pytestmark = pytest.mark.asyncio


def _payload(encoding: bytes, data: bytes, extra: dict[bytes, bytes] | None = None) -> Payload:
    md = {"encoding": encoding}
    if extra:
        md.update(extra)
    return Payload(metadata=md, data=data)


def _event_with_payload(p: Payload) -> HistoryEvent:
    ev = HistoryEvent()
    ev.event_id = 1
    ev.event_type = 1
    ev.workflow_execution_started_event_attributes.input.payloads.append(p)
    return ev


async def test_archive_inlines_s3_reference_payloads(tmp_path):
    s3_ref = _payload(b"binary/s3-reference", b"", extra={b"s3-key": b"key-1"})
    history = History(events=[_event_with_payload(s3_ref)])

    handle = MagicMock()
    handle.fetch_history = AsyncMock(return_value=history)
    client = MagicMock()
    client.get_workflow_handle = MagicMock(return_value=handle)

    codec = MagicMock()
    decoded = _payload(b"json/plain", b'{"hello":"world"}')
    codec.decode = AsyncMock(return_value=[decoded])

    storage = MagicMock()
    storage.put = AsyncMock()
    storage.put.return_value = "temporal-history/proj-1/T/wf/run.json.gz"

    archiver = HistoryArchiver(s3=storage, codec=codec, bucket="b", prefix="temporal-history")
    key = await archiver.archive(
        client,
        workflow_id="wf",
        run_id="run",
        workflow_type="T",
        project_id="proj-1",
        status="completed",
        project_version="1",
    )
    assert key == "temporal-history/proj-1/T/wf/run.json.gz"
    storage.put.assert_awaited_once()
    body = storage.put.await_args.args[0]
    envelope = json.loads(gzip.decompress(body).decode())
    assert envelope["workflow_id"] == "wf"
    assert envelope["status"] == "completed"
    inlined = envelope["events"][0]["workflow_execution_started_event_attributes"]["input"]["payloads"][0]
    assert inlined["decoded"] == {"hello": "world"}


async def test_archive_uses_unknown_for_missing_project(tmp_path):
    history = History(events=[])
    handle = MagicMock()
    handle.fetch_history = AsyncMock(return_value=history)
    client = MagicMock()
    client.get_workflow_handle = MagicMock(return_value=handle)

    storage = MagicMock()
    storage.put = AsyncMock()
    storage.put.return_value = "temporal-history/unknown/T/wf/run.json.gz"

    archiver = HistoryArchiver(s3=storage, codec=MagicMock(), bucket="b", prefix="temporal-history")
    key = await archiver.archive(
        client,
        workflow_id="wf",
        run_id="run",
        workflow_type="T",
        project_id=None,
        status="failed",
        project_version=None,
    )
    assert key == "temporal-history/unknown/T/wf/run.json.gz"


async def test_archive_encrypts_body_when_key_configured(tmp_path):
    history = History(events=[])
    handle = MagicMock()
    handle.fetch_history = AsyncMock(return_value=history)
    client = MagicMock()
    client.get_workflow_handle = MagicMock(return_value=handle)

    storage = MagicMock()
    storage.put = AsyncMock(return_value="temporal-history/unknown/T/wf/run.json.gz")

    key = Fernet.generate_key()
    archiver = HistoryArchiver(
        s3=storage,
        codec=MagicMock(),
        bucket="b",
        prefix="temporal-history",
        encryption_key=key.decode(),
    )
    await archiver.archive(
        client,
        workflow_id="wf",
        run_id="run",
        workflow_type="T",
        project_id="proj-1",
        status="completed",
        project_version="1",
    )

    storage.put.assert_awaited_once()
    body = storage.put.await_args.args[0]
    # Raw body is no longer a readable gzip stream.
    with pytest.raises(Exception):
        gzip.decompress(body)
    # But decrypting with the configured key recovers the original envelope.
    envelope = json.loads(gzip.decompress(Fernet(key).decrypt(body)).decode())
    assert envelope["workflow_id"] == "wf"
    assert envelope["status"] == "completed"
