"""
TBM verification research workflow - DB-backed Temporal implementation.

Queries the law databases (DKE, Urteile) directly and synthesizes a
Pruefungsleitfaden via LLM.
"""

from __future__ import annotations

import asyncio
import logging

from prompt_injection.prompt_defense import wrap_system_prompt
from pydantic import BaseModel
from temporal.activities.llm import llm_invoke
from temporalio import workflow

from src.Activities.law_db_activities import (
    QueryKResultsUTInput,
    QueryTopKDRInput,
    UTNorm,
    query_k_results_ut,
    query_top_k_dr,
)
from src.config import CONFIG
from src.config.env import ENV
from src.tbm_db_research.models import RechtsbegriffEintrag
from src.tbm_db_research.synthesis import build_synthesis_prompt

logger = logging.getLogger(__name__)

# =============================================================================
# WORKFLOW IDENTIFIER
# =============================================================================
tbm_db_research_workflow_id = "tbm_db_research"

# =============================================================================
# INPUT / OUTPUT TYPES
# =============================================================================


class TBMDBResearchWorkflowInput(BaseModel):
    """Input for a single Satz including its TBMs, Prueffragen, and Rechtsbegriffe."""

    jurabk: str
    paragraph_nr: str
    absatz_nr: str
    satz_nr: str
    satz_text: str
    tatbestandsmerkmale: list[str]
    prueffragen: list[str]
    rechtsbegriffe: list[RechtsbegriffEintrag]


class TBMDBResearchWorkflowOutput(BaseModel):
    """Holds the synthesized plain-markdown Pruefungsleitfaden."""

    research_report: str


# =============================================================================
# WORKFLOW DEFINITION
# =============================================================================


@workflow.defn(name=tbm_db_research_workflow_id)
class TBMDBResearchWorkflow:
    """
    Queries DKE Begruendungen and Urteile DB in parallel, then synthesizes
    a plain-markdown Pruefungsleitfaden via LLM.
    """

    @workflow.run
    async def run(
        self,
        input: TBMDBResearchWorkflowInput,
    ) -> TBMDBResearchWorkflowOutput:
        """Run DB queries in parallel, then synthesize the Pruefungsleitfaden via LLM."""
        job_id = workflow.info().workflow_id
        workflow.logger.info(
            "[WORKFLOW START] TBMDBResearch %s (%s § %s Abs. %s Satz %s)",
            job_id,
            input.jurabk,
            input.paragraph_nr,
            input.absatz_nr,
            input.satz_nr,
        )

        # Step 1: build query text from aggregated Tatbestandsmerkmale
        query_text = ", ".join(input.tatbestandsmerkmale)
        section_substrings = [
            f"§ {input.paragraph_nr}",
            f"Absatz {input.absatz_nr}",
            f"Abs. {input.absatz_nr}",
        ]

        # Step 2: query DKE and Urteile in parallel
        dke_results, ut_results = await asyncio.gather(
            query_top_k_dr(
                QueryTopKDRInput(
                    jurabk=input.jurabk,
                    query_text=query_text,
                    section_substrings=section_substrings,
                    k=CONFIG.DB_RESEARCH.DKE_TOP_K,
                )
            ),
            query_k_results_ut(
                QueryKResultsUTInput(
                    query_text=query_text,
                    norms=[
                        UTNorm(
                            name=input.jurabk,
                            name_suffix=None,
                            paragraph=input.paragraph_nr,
                            absatz=None,
                        )
                    ],
                    k=CONFIG.DB_RESEARCH.UT_TOP_K,
                )
            ),
        )

        workflow.logger.info(
            "[WORKFLOW] DB queries done: %d DKE results, %d Urteile results",
            len(dke_results),
            len(ut_results),
        )

        # Step 3: build synthesis prompt (pure function, no I/O)
        prompt = build_synthesis_prompt(
            jurabk=input.jurabk,
            paragraph_nr=input.paragraph_nr,
            absatz_nr=input.absatz_nr,
            satz_nr=input.satz_nr,
            satz_text=input.satz_text,
            tatbestandsmerkmale=input.tatbestandsmerkmale,
            prueffragen=input.prueffragen,
            rechtsbegriffe=input.rechtsbegriffe,
            dke_results=dke_results,
            ut_results=ut_results,
        )

        # Step 4: synthesize report via shared LLM service
        report = await llm_invoke(
            prompt=prompt,
            system_prompt=wrap_system_prompt(
                "Reasoning: high\nDu bist ein juristischer Fachexperte fuer deutsches Verwaltungsrecht.",
                lang="de",
            ),
            model=ENV.LLM.DB_RESEARCH_MODEL,
            temperature=0.3,
            max_tokens=CONFIG.DB_RESEARCH.MAX_TOKENS,
            reasoning_effort=CONFIG.DB_RESEARCH.REASONING_EFFORT,
        )

        workflow.logger.info(
            "[WORKFLOW END] TBMDBResearch %s done (%d chars)",
            job_id,
            len(report),
        )

        return TBMDBResearchWorkflowOutput(research_report=report)
