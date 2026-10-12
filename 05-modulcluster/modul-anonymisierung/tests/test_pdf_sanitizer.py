"""Tests for removing hidden data from finalized PDFs."""

from io import BytesIO

import pikepdf
import pypdfium2 as pdfium
import pytest

from src.services.pdf_sanitizer import PdfSanitizationError, _assert_pdf_sanitized, sanitize_pdf

VISIBLE_TEXT = "Sichtbarer Inhalt bleibt erhalten"
AUTHOR = "Max Mustermann"
EMAIL = "max@example.de"
COMMENT = "Vertraulicher Kommentar"
ATTACHMENT_NAME = "personenakte.txt"
ATTACHMENT_CONTENT = b"IBAN DE0012345678"
PII_MARKERS = (
    AUTHOR.encode(),
    EMAIL.encode(),
    COMMENT.encode(),
    ATTACHMENT_NAME.encode(),
    ATTACHMENT_CONTENT,
)


def create_pdf_with_hidden_pii() -> bytes:
    """Create a real PDF with benign page text and PII in hidden structures."""
    pdf = pikepdf.new()
    page = pdf.add_blank_page(page_size=(595, 842))

    font = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name.Font,
            Subtype=pikepdf.Name.Type1,
            BaseFont=pikepdf.Name.Helvetica,
        )
    )
    page.Resources = pikepdf.Dictionary(Font=pikepdf.Dictionary(F1=font))
    page.Contents = pdf.make_stream(
        f"BT /F1 14 Tf 72 760 Td ({VISIBLE_TEXT}) Tj ET".encode()
    )

    pdf.docinfo["/Author"] = AUTHOR
    xmp = (
        b'<?xpacket begin="\xef\xbb\xbf"?>'
        b'<x:xmpmeta xmlns:x="adobe:ns:meta/">'
        b'<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        b'<rdf:Description xmlns:dc="http://purl.org/dc/elements/1.1/" '
        b'dc:creator="max@example.de"/>'
        b'</rdf:RDF></x:xmpmeta><?xpacket end="w"?>'
    )
    metadata = pdf.make_stream(xmp)
    metadata.Type = pikepdf.Name.Metadata
    metadata.Subtype = pikepdf.Name.XML
    pdf.Root.Metadata = metadata
    page.Metadata = metadata

    annotation = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name.Annot,
            Subtype=pikepdf.Name.Text,
            Rect=pikepdf.Array([100, 700, 120, 720]),
            T=AUTHOR,
            Contents=COMMENT,
        )
    )
    page.Annots = pikepdf.Array([annotation])

    field = pdf.make_indirect(
        pikepdf.Dictionary(FT=pikepdf.Name.Tx, T=AUTHOR, V=EMAIL)
    )
    pdf.Root.AcroForm = pikepdf.Dictionary(Fields=pikepdf.Array([field]))
    pdf.attachments[ATTACHMENT_NAME] = ATTACHMENT_CONTENT
    pdf.Root.AF = pikepdf.Array([pikepdf.String(AUTHOR)])
    page.AF = pikepdf.Array([pikepdf.String(EMAIL)])
    pdf.Root.Collection = pikepdf.Dictionary(View=pikepdf.Name.D)

    with BytesIO() as output:
        pdf.save(output)
        pdf.close()
        return output.getvalue()


def hidden_data_state(pdf_data: bytes) -> dict[str, bool]:
    """Report whether each unsafe structure is present in a PDF."""
    with pikepdf.open(BytesIO(pdf_data)) as pdf:
        names = pdf.Root.get("/Names")
        return {
            "document_info": "/Info" in pdf.trailer,
            "metadata": any(
                isinstance(obj, (pikepdf.Dictionary, pikepdf.Stream))
                and ("/Metadata" in obj or obj.get("/Type") == pikepdf.Name.Metadata)
                for obj in pdf.objects
            ),
            "annotations": any("/Annots" in page.obj for page in pdf.pages),
            "acroform": "/AcroForm" in pdf.Root,
            "associated_files": "/AF" in pdf.Root or any("/AF" in page.obj for page in pdf.pages),
            "collection": "/Collection" in pdf.Root,
            "attachments": len(pdf.attachments) > 0,
            "embedded_files": names is not None and "/EmbeddedFiles" in names,
        }


def visible_content(pdf_data: bytes) -> tuple[int, str]:
    """Read page count and visible text through an independent PDF engine."""
    doc = pdfium.PdfDocument(pdf_data)
    try:
        text = "".join(doc[index].get_textpage().get_text_range() for index in range(len(doc)))
        return len(doc), text
    finally:
        doc.close()


def marker_hits(pdf_data: bytes) -> set[bytes]:
    """Find fixture PII in all readable string and stream objects."""
    hits: set[bytes] = set()
    with pikepdf.open(BytesIO(pdf_data)) as pdf:
        for obj in pdf.objects:
            contents = [str(obj).encode()]
            if isinstance(obj, pikepdf.Stream):
                contents.append(obj.read_bytes())
            for content in contents:
                hits.update(marker for marker in PII_MARKERS if marker in content)
    return hits


class TestSanitizePdf:
    """Sanitization must remove hidden data without changing visible pages."""

    def test_removes_hidden_pii_and_preserves_visible_content(self) -> None:
        source = create_pdf_with_hidden_pii()
        before_state = hidden_data_state(source)
        before_pages, before_text = visible_content(source)

        assert all(before_state.values())
        assert marker_hits(source) == set(PII_MARKERS)

        result = sanitize_pdf(source)

        assert not any(hidden_data_state(result).values())
        assert marker_hits(result) == set()
        assert visible_content(result) == (before_pages, before_text)
        assert VISIBLE_TEXT in before_text

    def test_is_structurally_idempotent(self) -> None:
        once = sanitize_pdf(create_pdf_with_hidden_pii())
        twice = sanitize_pdf(once)

        assert not any(hidden_data_state(twice).values())
        assert marker_hits(twice) == set()
        assert visible_content(twice) == visible_content(once)

    def test_validator_rejects_unsanitized_pdf(self) -> None:
        with pytest.raises(PdfSanitizationError, match="hidden data structures"):
            _assert_pdf_sanitized(create_pdf_with_hidden_pii())

    def test_invalid_pdf_is_rejected(self) -> None:
        with pytest.raises(pikepdf.PdfError):
            sanitize_pdf(b"not a PDF")
