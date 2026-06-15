"""Pure function: NormContext → list[BewertungsWorkflowInput]."""

from temporal.workflows.bewertung.types import (
    BewertungsWorkflowInput,
    Originaltext,
)

from src.workflows.bewertung.types import NormContext


def build_satz_inputs(norm_context: NormContext) -> list[BewertungsWorkflowInput]:
    """Build one BewertungsWorkflowInput per Satz from the resolved norm tree."""
    inputs: list[BewertungsWorkflowInput] = []

    for satz in norm_context.saetze:
        if not satz.fundstellen:
            continue

        # Only assess materiell-rechtliche wenn-dann Sätze
        if satz.norm_typ_lvl_1 != "materiell-rechtlich" or satz.norm_typ_lvl_2 != "wenn-dann":
            continue

        originaltexte = [
            Originaltext(
                document_id=f.dokument_id,
                node_id=f.id,
                title=f.title,
                text=f.text,
                chunk_ids=f.chunk_ids,
                page_numbers=f.page_numbers,
            )
            for f in satz.fundstellen
        ]

        if not originaltexte:
            continue

        inputs.append(
            BewertungsWorkflowInput(
                gesetz=norm_context.gesetz_name,
                jurabk=norm_context.jurabk,
                paragraph_nr=norm_context.paragraph_nr,
                paragraph_title=norm_context.paragraph_titel,
                paragraph_text=norm_context.paragraph_text,
                satz_id=satz.satz_id,
                satz_text=satz.satz_text,
                rechtsfolge=satz.rechtsfolge,
                atomare_tbm=satz.atomare_tbm,
                originaltexte=originaltexte,
                research_report=None,
            )
        )

    return inputs
