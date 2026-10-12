"""Tests for the signature stripper service — strip_signatures."""

from io import BytesIO

import pikepdf

from src.services.signature_stripper import strip_signatures


def _create_unsigned_pdf() -> bytes:
    """Create a minimal single-page PDF without any form fields."""
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(612, 792))
    buf = BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def _create_signed_pdf(*, with_text_field: bool = False) -> bytes:
    """Create a single-page PDF with a signature form field/widget.

    The signature field carries a signer name in both its value dictionary
    (``/V /Name``) and its visible appearance stream, mimicking a real
    digitally signed document. Optionally adds a non-signature text field to
    verify it is preserved.
    """
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(612, 792))
    page = pdf.pages[0]

    signer = "Dr. Alice Signer"

    # Visible appearance stream that renders the signer name.
    appearance = pdf.make_stream(
        f"BT /F1 10 Tf 10 10 Td (Signed by {signer}) Tj ET".encode()
    )
    appearance[pikepdf.Name.Type] = pikepdf.Name.XObject
    appearance[pikepdf.Name.Subtype] = pikepdf.Name.Form
    appearance[pikepdf.Name.BBox] = pikepdf.Array([0, 0, 200, 40])

    sig_value = pdf.make_indirect(
        pikepdf.Dictionary(
            Type=pikepdf.Name.Sig,
            Filter=pikepdf.Name("/Adobe.PPKLite"),
            Name=signer,
        )
    )

    sig_field = pdf.make_indirect(
        pikepdf.Dictionary(
            FT=pikepdf.Name.Sig,
            T="Signature1",
            Subtype=pikepdf.Name.Widget,
            Rect=pikepdf.Array([10, 10, 210, 50]),
            V=sig_value,
            AP=pikepdf.Dictionary(N=appearance),
        )
    )

    fields = pikepdf.Array([sig_field])
    annots = pikepdf.Array([sig_field])

    if with_text_field:
        text_field = pdf.make_indirect(
            pikepdf.Dictionary(
                FT=pikepdf.Name.Tx,
                T="FullName",
                Subtype=pikepdf.Name.Widget,
                Rect=pikepdf.Array([10, 60, 210, 100]),
            )
        )
        fields.append(text_field)
        annots.append(text_field)

    page[pikepdf.Name.Annots] = annots
    pdf.Root[pikepdf.Name.AcroForm] = pikepdf.Dictionary(
        Fields=fields,
        SigFlags=3,
    )

    buf = BytesIO()
    pdf.save(buf)
    return buf.getvalue()


def _create_signed_pdf_without_acroform() -> bytes:
    """Create a PDF whose signature widget is absent from AcroForm fields."""
    pdf = pikepdf.new()
    pdf.add_blank_page(page_size=(612, 792))

    signature = pdf.make_indirect(
        pikepdf.Dictionary(
            FT=pikepdf.Name.Sig,
            T="OrphanedSignature",
            Subtype=pikepdf.Name.Widget,
            Rect=pikepdf.Array([10, 10, 210, 50]),
            V=pikepdf.Dictionary(
                Type=pikepdf.Name.Sig,
                Name="Dr. Alice Signer",
            ),
        )
    )
    pdf.pages[0][pikepdf.Name.Annots] = pikepdf.Array([signature])

    buf = BytesIO()
    pdf.save(buf)
    return buf.getvalue()


class TestStripSignatures:
    """Test digital signature removal."""

    def test_no_signatures_returns_original(self) -> None:
        """A PDF without signatures should be returned unchanged."""
        pdf_data = _create_unsigned_pdf()

        result_bytes, removed = strip_signatures(pdf_data)

        assert removed == 0
        assert result_bytes == pdf_data

    def test_removes_signature_field_and_annotation(self) -> None:
        """The signature field, its annotation and the AcroForm should be gone."""
        pdf_data = _create_signed_pdf()

        result_bytes, removed = strip_signatures(pdf_data)

        assert removed == 1
        with pikepdf.open(BytesIO(result_bytes)) as pdf:
            assert "/AcroForm" not in pdf.Root
            assert "/Annots" not in pdf.pages[0]

    def test_signer_name_no_longer_present(self) -> None:
        """The signer name must not survive anywhere in the output bytes."""
        pdf_data = _create_signed_pdf()

        result_bytes, removed = strip_signatures(pdf_data)

        assert removed == 1
        assert b"Dr. Alice Signer" not in result_bytes

    def test_removes_signature_annotation_without_acroform(self) -> None:
        """A signature widget must be persisted as removed without AcroForm fields."""
        pdf_data = _create_signed_pdf_without_acroform()

        result_bytes, removed = strip_signatures(pdf_data)

        assert removed == 1
        assert result_bytes != pdf_data
        assert b"Dr. Alice Signer" not in result_bytes
        with pikepdf.open(BytesIO(result_bytes)) as pdf:
            assert "/AcroForm" not in pdf.Root
            assert "/Annots" not in pdf.pages[0]

    def test_preserves_non_signature_fields(self) -> None:
        """Non-signature form fields (e.g. text fields) must be kept."""
        pdf_data = _create_signed_pdf(with_text_field=True)

        result_bytes, removed = strip_signatures(pdf_data)

        assert removed == 1
        with pikepdf.open(BytesIO(result_bytes)) as pdf:
            acroform = pdf.Root.get("/AcroForm")
            assert acroform is not None
            field_types = {field.get("/FT") for field in acroform.Fields}
            assert pikepdf.Name.Sig not in field_types
            assert pikepdf.Name.Tx in field_types
