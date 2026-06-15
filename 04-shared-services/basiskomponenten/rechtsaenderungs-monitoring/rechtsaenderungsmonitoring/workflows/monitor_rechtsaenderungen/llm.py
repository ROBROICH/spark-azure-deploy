"""Workflow-level LLM helpers backed by the shared ``llm_invoke`` activity.

These wrap ``temporal.activities.llm.llm_invoke_structured`` and therefore may
**only** be called from within a Temporal workflow. The call is dispatched to the
shared ``llm-client`` worker on the task queue resolved from the model name
(``self-hosted/*`` -> ``llm-custom``).
"""

from temporal.activities.llm import llm_invoke_structured

from rechtsaenderungsmonitoring.schemas.db import DocType
from rechtsaenderungsmonitoring.schemas.temporal import NormFull
from rechtsaenderungsmonitoring.worker_env import ENV
from rechtsaenderungsmonitoring.workflows.monitor_rechtsaenderungen.prompts import (
    CATEGORISATION_PROMPT,
    ENRICHMENT_PROMPT,
    SUMMARISATION_PROMPT,
    CategorisationResult,
    EnrichmentResponse,
    SummaryResponse,
)


async def summarise_changes(
    content: str,
    model: str = ENV.LLM.SUMMARISATION_MODEL,
) -> SummaryResponse:
    """Summarise the norm changes described in a single page of text."""
    return await llm_invoke_structured(
        prompt=SUMMARISATION_PROMPT.format(text=content),
        system_prompt="",
        output_class=SummaryResponse,
        model=model,
        temperature=0,
    )


async def enrich_changes(
    norm: NormFull,
    source_text: str,
    model: str = ENV.LLM.ENRICHMENT_MODEL,
) -> EnrichmentResponse:
    """Fill in ``change_text``/``new_text`` for a norm from its source change text.

    ``norm`` is the template carrying the already-resolved ``jurabk`` and
    ``current_text``; the LLM completes the remaining fields.
    """
    return await llm_invoke_structured(
        prompt=ENRICHMENT_PROMPT.format(
            source_text=source_text,
            norm_result=norm.model_dump_json(),
        ),
        system_prompt="",
        output_class=EnrichmentResponse,
        model=model,
        temperature=0,
    )


async def categorise_title(
    title: str,
    model: str = ENV.LLM.CATEGORISATION_MODEL,
) -> DocType:
    """Categorise a document title/description into a :class:`DocType`."""
    categories = ", ".join(member.value for member in DocType)
    result = await llm_invoke_structured(
        prompt=CATEGORISATION_PROMPT.format(heading=title, categories=categories),
        system_prompt="",
        output_class=CategorisationResult,
        model=model,
        temperature=0,
    )
    return result.category
