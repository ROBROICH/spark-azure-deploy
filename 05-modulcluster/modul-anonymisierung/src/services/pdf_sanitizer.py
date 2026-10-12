"""Remove hidden data containers from finalized anonymized PDFs."""

from io import BytesIO

import pikepdf


class PdfSanitizationError(RuntimeError):
    """Raised when a PDF still contains unsafe hidden structures."""


def sanitize_pdf(pdf_data: bytes) -> bytes:
    """Strip metadata, annotations, forms, and embedded files from a PDF."""
    with pikepdf.open(BytesIO(pdf_data)) as pdf:
        root = pdf.Root

        if "/Info" in pdf.trailer:
            del pdf.trailer["/Info"]

        for obj in pdf.objects:
            if isinstance(obj, (pikepdf.Dictionary, pikepdf.Stream)):
                if "/Metadata" in obj:
                    del obj["/Metadata"]
                if "/AF" in obj:
                    del obj["/AF"]

        for page in pdf.pages:
            if "/Annots" in page.obj:
                del page.obj["/Annots"]

        for key in ("/AcroForm", "/Collection"):
            if key in root:
                del root[key]

        for name in list(pdf.attachments):
            del pdf.attachments[name]

        names = root.get("/Names")
        if names is not None and "/EmbeddedFiles" in names:
            del names["/EmbeddedFiles"]
            if len(names) == 0:
                del root["/Names"]

        with BytesIO() as output:
            pdf.save(output)
            sanitized = output.getvalue()

    _assert_pdf_sanitized(sanitized)
    return sanitized


def _assert_pdf_sanitized(pdf_data: bytes) -> None:
    """Fail closed if the rewritten PDF retains unsafe hidden structures."""
    with pikepdf.open(BytesIO(pdf_data)) as pdf:
        offenders: list[str] = []

        if "/Info" in pdf.trailer:
            offenders.append("document info")
        if len(pdf.attachments) > 0:
            offenders.append("attachments")

        for key in ("/AcroForm", "/AF", "/Collection"):
            if key in pdf.Root:
                offenders.append(f"catalog {key}")

        names = pdf.Root.get("/Names")
        if names is not None and "/EmbeddedFiles" in names:
            offenders.append("embedded-files name tree")

        for page_number, page in enumerate(pdf.pages):
            for key in ("/Metadata", "/Annots", "/AF"):
                if key in page.obj:
                    offenders.append(f"page {page_number + 1} {key}")

        for obj in pdf.objects:
            if not isinstance(obj, (pikepdf.Dictionary, pikepdf.Stream)):
                continue
            if "/Metadata" in obj or obj.get("/Type") == pikepdf.Name.Metadata:
                offenders.append(f"metadata object {obj.objgen}")
            if obj.get("/Type") == pikepdf.Name.EmbeddedFile:
                offenders.append(f"embedded file object {obj.objgen}")
            if obj.get("/Type") == pikepdf.Name.Annot:
                offenders.append(f"annotation object {obj.objgen}")

        if offenders:
            raise PdfSanitizationError(
                "Sanitized PDF still contains hidden data structures: " + ", ".join(offenders)
            )
