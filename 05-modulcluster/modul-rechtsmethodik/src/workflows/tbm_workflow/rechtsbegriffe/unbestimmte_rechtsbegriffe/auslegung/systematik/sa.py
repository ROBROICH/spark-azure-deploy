"""Agent for systematische Auslegung."""

import re
from typing import Any

from temporal.utils import sliding_window
from temporal.workflows.rechtsmethodik.types import (
    Auslegungsvorschlag,
    UnbestimmterRechtsbegriff,
)
from temporalio import workflow

from src.activities.law_api_calls import (
    FetchAbsaetzeInput,
    FetchNormInput,
    fetch_absaetze,
    fetch_norm,
)
from src.activities.llm_invoke import llm_invoke
from src.env import ENV
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.auslegung_types import (
    NormInfo,
    SystematikAuslegerAgentInput,
    UnbestimmterRechtsbegriffWithContext,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.systematik.sa_data_format import (
    SystematikAuslegerAgentOutput,
)
from src.workflows.tbm_workflow.rechtsbegriffe.unbestimmte_rechtsbegriffe.auslegung.systematik.sa_prompt import (
    sa_agent_prompt,
)
from src.workflows.tbm_workflow.rechtsbegriffe.utils import (
    format_legal_source,
)

_BEGRIFFSBESTIMMUNGEN_PATTERN = re.compile(r"begriffsbestimmungen", re.IGNORECASE)

_AKTUELLER_ABSATZ_BEGINN = ">>> AKTUELLER ABSATZ BEGINN <<<"
_AKTUELLER_ABSATZ_ENDE = ">>> AKTUELLER ABSATZ ENDE <<<"
_AKTUELLER_SATZ_BEGINN = "** AKTUELLER SATZ BEGINN: "
_AKTUELLER_SATZ_ENDE = " AKTUELLER SATZ ENDE **."


@workflow.defn(name="SystematikAuslegerAgentWorkflow")
class SystematikAuslegerAgentWorkflow:
    """Agent for systematic interpretation of unspecified legal terms."""

    @workflow.run
    async def run(
        self,
        input: SystematikAuslegerAgentInput,
    ) -> list[UnbestimmterRechtsbegriff]:
        """Executes the interpretation based on systematic context."""
        if not input.enriched_urp:
            return []

        kontext_normen = await self._retrieve_kontext_normen(input=input)

        async def _process(
            indexed_ur: tuple[int, UnbestimmterRechtsbegriffWithContext],
        ) -> tuple[int, UnbestimmterRechtsbegriff]:
            """Process a single Rechtsbegriff through systematische Auslegung."""
            idx, ur = indexed_ur
            output = await llm_invoke(
                activity_input={
                    "model_name": ENV.MODELS.LARGE_LLM,
                    "temperature": 0,
                    "thinking": False,
                    "prompt_template": sa_agent_prompt,
                    "input_dict": {
                        "normstelle": format_legal_source(
                            input.jurabk, input.paragraph_nr, input.absatz_nr, input.satz_nr, input.markers
                        ),
                        "satz_text": input.satz_text,
                        "unbestimmter_rechtsbegriff": ur.begriff,
                        "entscheidungen": [
                            {
                                "gericht": urteil.gericht,
                                "datum": urteil.datum,
                                "aktenzeichen": urteil.aktenzeichen,
                                "randnummer": urteil.section_number,
                                "text": urteil.section_text,
                                "zitierte_entscheidungen": [z_u.model_dump() for z_u in urteil.zitierte_urteile],
                            }
                            for urteil in ur.u_context
                        ],
                        "normkontext": kontext_normen,
                    },
                },
                output_class=SystematikAuslegerAgentOutput,
            )
            return idx, UnbestimmterRechtsbegriff(
                begriff=ur.begriff,
                auslegungsvorschläge=[
                    Auslegungsvorschlag(
                        auslegung_methode="systematik",
                        auslegungsvorschlag=output.systematische_auslegung,
                    )
                ],
            )

        indexed_results = await sliding_window(list(enumerate(input.enriched_urp)), _process, concurrency=10)
        indexed_results.sort(key=lambda x: x[0])
        return [result for _, result in indexed_results]

    @classmethod
    async def _retrieve_kontext_normen(
        cls,
        input: SystematikAuslegerAgentInput,
    ) -> dict[str, Any]:
        """Builds the full norm context as a structured dict containing the current, surrounding, and general norms."""

        # --- Current norm ---
        current_absaetze, surrounding_norms_info = await workflow.asyncio.gather(
            fetch_absaetze(FetchAbsaetzeInput(jurabk=input.jurabk, paragraph_nr=input.paragraph_nr)),
            fetch_norm(FetchNormInput(jurabk=input.jurabk, paragraph_nr=input.paragraph_nr)),
        )
        current_norm_text = cls._build_current_norm_text(
            absaetze=current_absaetze,
            current_absatz_nr=input.absatz_nr,
            current_satz_nr=input.satz_nr,
            current_markers=input.markers,
        )
        aktuelle_norm = {
            "normstelle": format_legal_source(input.jurabk, input.paragraph_nr, None, None, None),
            "titel": surrounding_norms_info[0]["titel"],
            "text": current_norm_text,
        }

        # --- Surrounding norms (previous / next) ---
        prev_paragraph_nr = surrounding_norms_info[0]["prev"]
        next_paragraph_nr = surrounding_norms_info[0]["next"]

        vorherige_norm, nachfolgende_norm = await workflow.asyncio.gather(
            cls._fetch_norm_info(
                jurabk=input.jurabk,
                paragraph_nr=prev_paragraph_nr,
            ),
            cls._fetch_norm_info(
                jurabk=input.jurabk,
                paragraph_nr=next_paragraph_nr,
            ),
        )

        # --- Further norms ---
        paragraphs_to_exclude = [p for p in [input.paragraph_nr, prev_paragraph_nr, next_paragraph_nr] if p is not None]
        weitere_normen = await cls._fetch_further_norms(
            jurabk=input.jurabk,
            paragraphs_to_exclude=paragraphs_to_exclude,
        )

        return {
            "aktuelle_norm": aktuelle_norm,
            "vorherige_norm": vorherige_norm.model_dump() if vorherige_norm else {},
            "nachfolgende_norm": nachfolgende_norm.model_dump() if nachfolgende_norm else {},
            "weitere_normen": [n.model_dump() for n in weitere_normen],
        }

    @classmethod
    def _build_current_norm_text(
        cls,
        absaetze: list[dict[str, Any]],
        current_absatz_nr: str,
        current_satz_nr: str,
        current_markers: list[str],
    ) -> str:
        """Builds the norm text for the current norm. The current Absatz is wrapped
        in visual markers and its sentences are listed individually, with the current
        Satz highlighted."""
        parts: list[str] = []

        for absatz in absaetze:
            absatz_nr = absatz["absatz_nr"]
            is_current_absatz = absatz_nr == current_absatz_nr

            if is_current_absatz:
                absatz_block = cls._build_marked_absatz_block(
                    absatz=absatz,
                    current_satz_nr=current_satz_nr,
                    current_markers=current_markers,
                )
                parts.append(absatz_block)
            else:
                parts.append(f"({absatz_nr}) {absatz['absatz_text']}")

        return "\n".join(parts)

    @staticmethod
    def _build_marked_absatz_block(
        absatz: dict[str, Any],
        current_satz_nr: str,
        current_markers: list[str],
    ) -> str:
        """Builds the visually highlighted block for the current Absatz. Lists all
        sentences and wraps the current Satz — identified by both satz_nr and markers
        — in visual markers."""
        satz_lines: list[str] = []
        for satz in absatz["saetze"]:
            is_current_satz = str(satz["satz_nr"]) == str(current_satz_nr) and set(satz["markers"]) == set(
                current_markers
            )

            if is_current_satz:
                satz_lines.append(f"{_AKTUELLER_SATZ_BEGINN}{satz['satz_text']}{_AKTUELLER_SATZ_ENDE}")
            else:
                satz_lines.append(satz["satz_text"])

        saetze_block = " ".join(satz_lines)

        return f"{_AKTUELLER_ABSATZ_BEGINN}\n({absatz['absatz_nr']}) {saetze_block}\n{_AKTUELLER_ABSATZ_ENDE}"

    @classmethod
    async def _fetch_norm_info(
        cls,
        jurabk: str,
        paragraph_nr: str | None,
    ) -> NormInfo | None:
        """Fetches a single norm and returns it as a NormInfo instance. Returns None
        if paragraph_nr is absent or if the norm title contains 'Begriffsbestimmungen'."""
        if paragraph_nr is None:
            return None

        response = await fetch_norm(FetchNormInput(jurabk=jurabk, paragraph_nr=paragraph_nr))
        norm = response[0]

        if _BEGRIFFSBESTIMMUNGEN_PATTERN.search(norm["titel"]):
            return None

        norm_text = await cls._build_plain_norm_text(jurabk=jurabk, paragraph_nr=paragraph_nr)

        return NormInfo(
            normstelle=format_legal_source(jurabk, paragraph_nr, None, None, None),
            titel=norm["titel"],
            text=norm_text,
        )

    @classmethod
    async def _build_norm_info(cls, jurabk: str, norm: dict[str, Any]) -> NormInfo:
        """Convert raw norm data to NormInfo objects."""
        norm_text = await cls._build_plain_norm_text(jurabk=jurabk, paragraph_nr=norm["paragraph_nr"])
        return NormInfo(
            normstelle=format_legal_source(jurabk, norm["paragraph_nr"], None, None, None),
            titel=norm["titel"],
            text=norm_text,
        )

    @classmethod
    async def _fetch_further_norms(cls, jurabk: str, paragraphs_to_exclude: list[str]) -> list[NormInfo]:
        """Fetch additional relevant norms from the law database."""
        response = await fetch_norm(FetchNormInput(jurabk=jurabk))

        relevant_norms = [
            norm
            for norm in response
            if norm["paragraph_nr"] not in paragraphs_to_exclude
            and not _BEGRIFFSBESTIMMUNGEN_PATTERN.search(norm["titel"])
        ][:10]

        return await workflow.asyncio.gather(*[cls._build_norm_info(jurabk, norm) for norm in relevant_norms])

    @staticmethod
    async def _build_plain_norm_text(
        jurabk: str,
        paragraph_nr: str,
    ) -> str:
        """Builds the norm text without any visual markers by concatenating all
        Absätze as '(absatz_nr) absatz_text'."""
        absaetze = await fetch_absaetze(FetchAbsaetzeInput(jurabk=jurabk, paragraph_nr=paragraph_nr))
        parts = [f"({absatz['absatz_nr']}) {absatz['absatz_text']}" for absatz in absaetze]
        return "\n".join(parts)
