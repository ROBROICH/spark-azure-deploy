"""Tests for LibreOffice-backed DOCX conversion."""

from src.docx_export import converter


class _FakeUnoClient:
    def __init__(self, *, server: str, port: str, host_location: str, protocol: str):
        self.server = server
        self.port = port
        self.host_location = host_location
        self.protocol = protocol
        self.convert_calls: list[dict[str, bytes | str | None]] = []

    def convert(self, *, indata: bytes, outpath: None, convert_to: str) -> bytes | None:
        self.convert_calls.append(
            {
                "indata": indata,
                "outpath": outpath,
                "convert_to": convert_to,
            }
        )
        return b"converted-docx"


def test_refresh_docx_with_unoserver_returns_converted_bytes(monkeypatch):
    created_clients: list[_FakeUnoClient] = []

    def _build_client(**kwargs) -> _FakeUnoClient:
        client = _FakeUnoClient(**kwargs)
        created_clients.append(client)
        return client

    monkeypatch.setattr(converter, "UnoClient", _build_client)

    result = converter.refresh_docx_with_unoserver(b"raw-docx")

    assert result == b"converted-docx"
    assert len(created_clients) == 1
    client = created_clients[0]
    assert client.server == "localhost"
    assert client.port == "2003"
    assert client.host_location == "remote"
    assert client.protocol == "http"
    assert client.convert_calls == [
        {
            "indata": b"raw-docx",
            "outpath": None,
            "convert_to": "docx",
        }
    ]


def test_convert_docx_to_pdf_with_unoserver_returns_pdf_bytes(monkeypatch):
    created_clients: list[_FakeUnoClient] = []

    def _build_client(**kwargs) -> _FakeUnoClient:
        client = _FakeUnoClient(**kwargs)
        created_clients.append(client)
        return client

    monkeypatch.setattr(converter, "UnoClient", _build_client)

    result = converter.convert_docx_to_pdf_with_unoserver(b"raw-docx")

    assert result == b"converted-docx"
    assert len(created_clients) == 1
    assert created_clients[0].convert_calls == [
        {
            "indata": b"raw-docx",
            "outpath": None,
            "convert_to": "pdf",
        }
    ]


def test_refresh_docx_with_unoserver_raises_on_client_error(monkeypatch):
    class _FailingUnoClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def convert(self, *, indata: bytes, outpath: None, convert_to: str) -> bytes | None:
            raise RuntimeError("boom")

    monkeypatch.setattr(converter, "UnoClient", _FailingUnoClient)

    try:
        converter.refresh_docx_with_unoserver(b"raw-docx")
    except converter.UnoConversionError as err:
        assert str(err) == "LibreOffice DOCX conversion failed"
        assert isinstance(err.__cause__, RuntimeError)
    else:
        raise AssertionError("Expected UnoConversionError")


def test_refresh_docx_with_unoserver_rejects_empty_output(monkeypatch):
    class _EmptyUnoClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def convert(self, *, indata: bytes, outpath: None, convert_to: str) -> bytes | None:
            return b""

    monkeypatch.setattr(converter, "UnoClient", _EmptyUnoClient)

    try:
        converter.refresh_docx_with_unoserver(b"raw-docx")
    except converter.UnoConversionError as err:
        assert str(err) == "LibreOffice returned empty DOCX output"
    else:
        raise AssertionError("Expected UnoConversionError")


def test_convert_docx_to_pdf_with_unoserver_raises_on_client_error(monkeypatch):
    class _FailingUnoClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        def convert(self, *, indata: bytes, outpath: None, convert_to: str) -> bytes | None:
            raise RuntimeError("boom")

    monkeypatch.setattr(converter, "UnoClient", _FailingUnoClient)

    try:
        converter.convert_docx_to_pdf_with_unoserver(b"raw-docx")
    except converter.UnoConversionError as err:
        assert str(err) == "LibreOffice PDF conversion failed"
        assert isinstance(err.__cause__, RuntimeError)
    else:
        raise AssertionError("Expected UnoConversionError")
