"""Stage 1: MicroBuilder Workflow."""

from __future__ import annotations

import asyncio
from textwrap import dedent

from temporal.activities.llm import llm_invoke
from temporalio import workflow

from src.config import config
from src.env import ENV
from src.models.types import MicroBuilderInput, MicroSummary, Originaltext, SvmMicroList
from src.prompts.micro_builder import MICRO_BUILDER_SYSTEM_PROMPT, build_micro_builder_prompt
from src.utils.json_parsing import parse_json_response

micro_builder_workflow_id = "MicroBuilderWorkflow"


@workflow.defn(name=micro_builder_workflow_id)
class MicroBuilderWorkflow:
    """Stage 1: Extract micro-summaries from source chunks."""
    @workflow.run
    async def run(self, input: MicroBuilderInput) -> SvmMicroList:
        """Process all chunks in batches and aggregate micro-summaries."""
        chunks = input.originaltexte
        batch_size = config.MICRO_BUILDER.BATCH_SIZE
        all_micros: list[MicroSummary] = []

        batches = [chunks[i : i + batch_size] for i in range(0, len(chunks), batch_size)]

        batch_results = await asyncio.gather(*[self._process_batch(input, batch) for batch in batches])

        for batch_micros in batch_results:
            all_micros.extend(batch_micros)

        return SvmMicroList(
            satz_text=input.satz_text,
            micros=all_micros,
        )

    async def _process_batch(
        self,
        input: MicroBuilderInput,
        chunks: list[Originaltext],
    ) -> list[MicroSummary]:
        """Process a single batch of chunks via LLM."""
        chunks_text = "\n\n---\n\n".join(
            dedent(f"""\
                [{c.node_id}]
                Titel: {c.title}
                Text: {c.text[:2000]}""")
            for c in chunks
        )

        prompt = build_micro_builder_prompt(input, chunks_text)

        content = await llm_invoke(
            prompt=prompt,
            system_prompt=MICRO_BUILDER_SYSTEM_PROMPT,
            model=ENV.LITELLM.MODEL,
            temperature=0.0,
        )

        micros_data = parse_json_response(content)

        try:
            return [MicroSummary.model_validate(m) for m in micros_data]
        except Exception as e:
            workflow.logger.warning(f"Micro-Batch Parse-Fehler: {e}")
            return self._fallback(chunks)

    @staticmethod
    def _fallback(chunks: list[Originaltext]) -> list[MicroSummary]:
        max_chars = config.MICRO_BUILDER.FALLBACK_MAX_CHARS
        return [
            MicroSummary(
                svm_id=c.node_id,
                kernaussage=c.text[:max_chars] if c.text else "Keine Zusammenfassung",
            )
            for c in chunks
        ]
