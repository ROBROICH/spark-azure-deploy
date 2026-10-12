"""configuration tests"""
import pytest
from jura_db.config import Settings
from pydantic import ValidationError


def test_rii_documents_are_downloaded_via_https_by_default() -> None:
    assert Settings().rii_base_document_url.startswith("https://")


def test_rejects_plain_http_rii_document_url() -> None:
    with pytest.raises(ValidationError, match="https"):
        Settings(rii_base_document_url="http://rechtsprechung.test/docs")
