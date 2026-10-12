"""Remove digital signatures from a PDF before redaction.

Redaction rasterizes and re-saves affected pages, which permanently
invalidates any digital signature (Adobe then reports a broken signature).
Worse, the signer names live in the signature form fields, their visible
appearance streams and the signing certificate — none of which are part of
the page text layer, so the text-based redactor never removes them and the
names keep leaking through the signature panel.

Since a signature can never stay valid after redaction, the only correct
behavior for an anonymization tool is to strip signatures entirely: remove
the signature form fields, their widget annotations (including the visible
"signed by ..." appearance) and the signature value dictionaries.
"""

import logging
from io import BytesIO

import pikepdf

logger = logging.getLogger(__name__)


def strip_signatures(pdf_data: bytes) -> tuple[bytes, int]:
    """Remove all digital signatures from a PDF.

    Deletes signature form fields, their widget annotations (which carry the
    visible signer name) and the associated signature value dictionaries.

    Returns ``(pdf_bytes, removed_count)`` where *removed_count* is the number
    of signature fields removed. If the document contains no signatures, the
    original bytes are returned unchanged with a count of ``0``.
    """
    with pikepdf.open(BytesIO(pdf_data)) as pdf:
        root = pdf.Root
        removed = 0
        removed_objgens: set[tuple[int, int]] = set()

        acroform = root.get("/AcroForm")
        if acroform is not None and "/Fields" in acroform:
            try:
                fields = list(acroform.Fields)
            except Exception:
                logger.warning("Could not read AcroForm /Fields; skipping field removal", exc_info=True)
                fields = None

            if fields is not None:
                kept_fields = pikepdf.Array()
                for field in fields:
                    if _is_signature(field):
                        removed += 1
                        removed_objgens.add(field.objgen)
                    else:
                        kept_fields.append(field)

                if len(kept_fields) == 0:
                    del root["/AcroForm"]
                else:
                    acroform.Fields = kept_fields
                    if "/SigFlags" in acroform:
                        del acroform["/SigFlags"]

        # Remove signature widget annotations from every page. This drops the
        # visible signature appearance (which renders the signer's name).
        for page in pdf.pages:
            page_obj = page.obj
            if "/Annots" not in page_obj:
                continue
            try:
                annots = list(page_obj.Annots)
            except Exception:
                logger.warning("Could not read page /Annots; skipping annotation removal", exc_info=True)
                continue
            kept_annots = pikepdf.Array()
            for annot in annots:
                if _is_signature(annot):
                    if annot.objgen not in removed_objgens:
                        removed += 1
                        removed_objgens.add(annot.objgen)
                    continue
                kept_annots.append(annot)
            if len(kept_annots) == 0:
                del page_obj["/Annots"]
            else:
                page_obj.Annots = kept_annots

        if removed == 0:
            return pdf_data, 0

        with BytesIO() as buf:
            pdf.save(buf)
            return buf.getvalue(), removed


def _is_signature(obj: pikepdf.Object) -> bool:
    """Return ``True`` if *obj* is (or belongs to) a signature form field.

    Walks the ``/Parent`` chain so that widget annotations inheriting their
    field type from a parent field are detected as well.
    """
    seen: set[tuple[int, int]] = set()
    current: pikepdf.Object | None = obj

    while current is not None:
        try:
            objgen = current.objgen
        except Exception:
            objgen = None
        if objgen is not None:
            if objgen in seen:
                break
            seen.add(objgen)

        try:
            field_type = current.get("/FT")
        except Exception:
            return False
        if field_type == pikepdf.Name.Sig:
            return True

        try:
            current = current.get("/Parent")
        except Exception:
            return False

    return False
