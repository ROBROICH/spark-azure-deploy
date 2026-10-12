import json
import logging
from collections.abc import Callable
from datetime import datetime
from uuid import UUID

import httpx
import pytest
from temporal.dms_client import (
    DmsClient,
    DmsConflictError,
    encode_upload_payload,
    json_default,
    with_project_version_params,
)
from temporal.project_context import use_project_context

pytestmark = pytest.mark.asyncio

Handler = Callable[[httpx.Request], httpx.Response]
BASE_URL = "http://dms.test"


def _client(handler: Handler, page_size: int = 500, max_pages: int = 200) -> tuple[DmsClient, httpx.AsyncClient]:
    http_client = httpx.AsyncClient(transport=httpx.MockTransport(handler))
    client = DmsClient(f"{BASE_URL}/", page_size=page_size, max_pages=max_pages, http_client=lambda: http_client)
    return client, http_client


def _record(file_id: str, filename: str, file_type: str = "document") -> dict[str, str]:
    return {"id": file_id, "type": file_type, "filename": filename, "bucketPath": "/b", "projectId": "p"}


async def test_with_project_version_params_only_inside_project_context() -> None:
    assert with_project_version_params({"a": 1}) == {"a": 1}
    assert with_project_version_params() is None
    with use_project_context("p", 7):
        assert with_project_version_params({"a": 1}) == {"a": 1, "projectVersion": 7}
        assert with_project_version_params() == {"projectVersion": 7}


async def test_json_default_handles_uuid_and_datetime() -> None:
    uid = UUID("12345678-1234-5678-1234-567812345678")
    assert json_default(uid) == "12345678-1234-5678-1234-567812345678"
    assert json_default(datetime(2024, 1, 15, 10, 30, 0)) == "2024-01-15T10:30:00"
    with pytest.raises(TypeError, match="not JSON serializable"):
        json_default(set())


async def test_encode_upload_payload_keeps_bytes_and_str_and_serializes_the_rest() -> None:
    assert encode_upload_payload(b"%PDF") == b"%PDF"
    assert encode_upload_payload('{"x": 1}') == '{"x": 1}'
    assert encode_upload_payload(bytearray(b"ab")) == b"ab"
    assert json.loads(encode_upload_payload({"x": 1, "id": UUID(int=1)})) == {
        "x": 1,
        "id": "00000000-0000-0000-0000-000000000001",
    }


async def test_list_files_paginates_until_short_page_and_scopes_project_version() -> None:
    seen: list[httpx.URL] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request.url)
        page = int(request.url.params["page"])
        body = [_record(f"f{page}-{i}", f"{page}-{i}.pdf") for i in range(2 if page == 1 else 1)]
        return httpx.Response(200, json=body)

    client, _ = _client(handler, page_size=2)
    with use_project_context("p", 3):
        files = await client.list_files("p")

    assert [f.id for f in files] == ["f1-0", "f1-1", "f2-0"]
    assert [url.params["page"] for url in seen] == ["1", "2"]
    assert seen[0].path == "/v2/files"
    assert seen[0].params["projectVersion"] == "3"
    assert seen[0].params["includeDeleted"] == "false"


async def test_list_files_stops_at_max_pages() -> None:
    calls: list[int] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(int(request.url.params["page"]))
        return httpx.Response(200, json=[_record("f", "a.pdf")])

    max_pages = 3
    client, _ = _client(handler, page_size=1, max_pages=max_pages)
    assert len(await client.list_files("p")) == max_pages
    assert calls == [1, 2, 3]


async def test_list_documents_with_extractions_pairs_and_logs_missing(caplog: pytest.LogCaptureFixture) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.params["fileType"] == "document":
            return httpx.Response(200, json=[_record("d1", "dir/a.pdf"), _record("d2", "b.pdf")])
        return httpx.Response(200, json=[_record("e1", "dir/a/a_processed.json", "content_extraction")])

    client, _ = _client(handler)
    with caplog.at_level(logging.ERROR, logger="temporal.dms_client"):
        pairs = await client.list_documents_with_extractions("p")

    assert [(doc.id, ext_id) for doc, ext_id in pairs] == [("d1", "e1")]
    assert "b.pdf" in caplog.text


@pytest.mark.parametrize("failing_path", ["/v2/internal/files/f1/generate-download-url", "/signed/f1"])
async def test_download_maps_404_to_file_not_found(failing_path: str) -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == failing_path:
            return httpx.Response(404)
        if request.url.path.endswith("/generate-download-url"):
            return httpx.Response(200, json={"downloadUrl": "https://storage.test/signed/f1"})
        return httpx.Response(200, content=b'{"hello": "world"}')

    client, _ = _client(handler)
    with pytest.raises(FileNotFoundError, match="f1"):
        await client.download_json("f1")


async def test_get_file_metadata_maps_404_to_file_not_found() -> None:
    client, _ = _client(lambda _request: httpx.Response(404))
    with pytest.raises(FileNotFoundError):
        await client.get_file_metadata("missing")


async def test_list_files_does_not_map_404() -> None:
    client, _ = _client(lambda _request: httpx.Response(404))
    with pytest.raises(httpx.HTTPStatusError):
        await client.list_files("p")


async def test_download_scopes_only_the_dms_request_to_the_project_version() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/v2/internal/files/f1/generate-download-url":
            assert dict(request.url.params) == {"projectVersion": "4"}
            return httpx.Response(200, json={"downloadUrl": "https://storage.test/signed?sig=1"})
        assert str(request.url) == "https://storage.test/signed?sig=1"
        return httpx.Response(200, content=b"raw")

    client, _ = _client(handler)
    with use_project_context("p", 4):
        assert await client.download_bytes("f1") == b"raw"


async def test_delete_file_is_idempotent_on_404() -> None:
    client, _ = _client(lambda _request: httpx.Response(404))
    await client.delete_file("missing")

    client, _ = _client(lambda _request: httpx.Response(500))
    with pytest.raises(httpx.HTTPStatusError):
        await client.delete_file("f1")


def _upload_handler(
    seen: list[httpx.Request],
    *,
    fail_step: str | None = None,
    status: int = 500,
    mime_type: str | None = "application/json",
) -> Handler:
    def handler(request: httpx.Request) -> httpx.Response:
        request.read()
        seen.append(request)
        path = request.url.path
        if fail_step and path.endswith(fail_step):
            return httpx.Response(status, text="boom")
        if path.endswith("/generate-upload-url"):
            meta = {"uploadUrl": "https://storage.test/upload"}
            if mime_type:
                meta["mimeType"] = mime_type
            return httpx.Response(200, json=meta)
        if path == "/upload":
            return httpx.Response(200)
        if path.endswith("/confirm-upload"):
            return httpx.Response(200, json=_record("new", "f.json", "temporal_checkpoint"))
        return httpx.Response(404)

    return handler


async def test_upload_temporal_checkpoint_serializes_payload_and_scopes_project_version() -> None:
    seen: list[httpx.Request] = []
    client, _ = _client(_upload_handler(seen))

    with use_project_context("p", 5):
        result = await client.upload_temporal_checkpoint(
            project_id="p", workflow_id="w", run_id="r", filename="f.json", payload={"x": 1}
        )

    assert result.id == "new"
    generate, put, confirm = seen
    assert json.loads(generate.content) == {
        "filename": "f.json",
        "projectId": "p",
        "type": "temporal_checkpoint",
        "createNewVersion": True,
        "workflowId": "w",
        "runId": "r",
    }
    assert confirm.content == generate.content
    assert generate.url.params["projectVersion"] == "5"
    assert confirm.url.params["projectVersion"] == "5"
    assert "projectVersion" not in put.url.params
    assert json.loads(put.content) == {"x": 1}
    assert put.headers["Content-Type"] == "application/json"


async def test_upload_file_sends_bytes_and_strings_unchanged() -> None:
    seen: list[httpx.Request] = []
    client, _ = _client(_upload_handler(seen, mime_type="application/pdf"))

    await client.upload_file("p", "f.pdf", payload=b"%PDF-1.7")
    await client.upload_file("p", "f.json", payload='"already serialized"')

    puts = [r for r in seen if r.method == "PUT"]
    assert [r.content for r in puts] == [b"%PDF-1.7", b'"already serialized"']
    assert puts[0].headers["Content-Type"] == "application/pdf"


async def test_upload_content_serializes_uuid_project_id_and_honours_content_type() -> None:
    seen: list[httpx.Request] = []
    client, _ = _client(_upload_handler(seen))
    project_id = UUID(int=7)

    record = await client.upload_content(project_id, "a.bin", b"\x00", content_type="application/octet-stream")

    assert record["id"] == "new"
    assert json.loads(seen[0].content)["projectId"] == str(project_id)
    assert seen[1].headers["Content-Type"] == "application/octet-stream"


async def test_upload_conflict_raises_dms_conflict_error() -> None:
    client, _ = _client(_upload_handler([], fail_step="/generate-upload-url", status=409))
    with pytest.raises(DmsConflictError, match=r"f\.json"):
        await client.upload_file("p", "f.json", payload={})


@pytest.mark.parametrize("fail_step", ["/generate-upload-url", "/upload", "/confirm-upload"])
async def test_upload_failure_raises_runtime_error_without_httpx_context(fail_step: str) -> None:
    client, _ = _client(_upload_handler([], fail_step=fail_step))
    with pytest.raises(RuntimeError, match=r"DMS upload failed for 'f\.json'") as exc_info:
        await client.upload_file("p", "f.json", payload=b"x" * 1024)

    assert type(exc_info.value) is RuntimeError
    assert exc_info.value.__cause__ is None
    assert exc_info.value.__suppress_context__ is True


async def test_borrowed_http_client_is_not_closed() -> None:
    client, http_client = _client(lambda _request: httpx.Response(200, json={"downloadUrl": "u"}))
    await client.get_download_url("f1")
    assert not http_client.is_closed
    await http_client.aclose()
