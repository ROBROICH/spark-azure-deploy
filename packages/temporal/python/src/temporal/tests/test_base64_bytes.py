import base64

import pytest
from pydantic import BaseModel, ValidationError
from temporal import Base64Bytes

# Same shape as the EWMS file that failed in testing: a real PDF header/trailer,
# not a base64 string. Pydantic's Base64Bytes treats raw bytes as encoded text.
MINIMAL_PDF = (
    b"%PDF-1.1\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/MediaBox[0 0 3 3]/Parent 2 0 R>>endobj\n"
    b"xref\n0 4\n0000000000 65535 f \n0000000009 00000 n \n"
    b"0000000052 00000 n \n0000000101 00000 n \n"
    b"trailer<</Size 4/Root 1 0 R>>\nstartxref\n178\n%%EOF\n"
)


class Payload(BaseModel):
    file_bytes: Base64Bytes


def test_raw_pdf_bytes_are_kept_not_decoded_as_base64() -> None:
    payload = Payload(file_bytes=MINIMAL_PDF)

    assert payload.file_bytes == MINIMAL_PDF
    assert payload.file_bytes.startswith(b"%PDF")


def test_json_roundtrip_preserves_raw_pdf_bytes() -> None:
    dumped = Payload(file_bytes=MINIMAL_PDF).model_dump(mode="json")

    assert dumped["file_bytes"] == base64.b64encode(MINIMAL_PDF).decode("ascii")
    assert Payload.model_validate(dumped).file_bytes == MINIMAL_PDF


def test_invalid_base64_string_is_rejected() -> None:
    with pytest.raises(ValidationError):
        Payload.model_validate({"file_bytes": "not valid base64!!!"})
