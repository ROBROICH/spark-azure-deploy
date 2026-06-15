from uuid import UUID, uuid4

from prompt_injection.prompt_defense import render_prompt_format, sanitize_and_wrap_external_data, wrap_system_prompt
from temporal.activities.llm import llm_invoke_structured
from temporal.workflows.risikohinweis.risikohinweis import RISIKOHINWEISER_WORKFLOW_NAME
from temporalio import workflow

from src.config.config import config
from src.config.env import ENV
from src.prompts import (
    CRITERIA_RATING_SYSTEM_PROMPT,
    CRITERIA_RATING_USER_PROMPT,
    INTENTION_ANALYSIS_SYSTEM_PROMPT,
    QUALITY_ANALYSIS_SYSTEM_PROMPT,
    QUALITY_ANALYSIS_USER_PROMPT,
    RISK_FORMULATOR_SYSTEM_PROMPT,
    RISK_FORMULATOR_USER_PROMPT,
)
from src.schemas.workflow import (
    CriteriaDefinitionResponse,
    CriterionRatingItem,
    IntentionAnalysisResponse,
    PFBChapter,
    QualityAnalysisRequest,
    QualityAnalysisResponse,
    QualityCheckItem,
    RiskFinderOutput,
    RiskFinding,
    RiskFormulatorFinding,
    RiskFormulatorInput,
    RiskFormulatorResponse,
)


async def analyze_intention(chapter_text: str) -> IntentionAnalysisResponse:
    """Analysiere die Kapitelintention als Grundlage der Qualitätsbewertung."""
    response = await llm_invoke_structured(
        model=ENV.LITELLM.MODEL,
        prompt=sanitize_and_wrap_external_data(chapter_text),
        system_prompt=wrap_system_prompt(INTENTION_ANALYSIS_SYSTEM_PROMPT, lang="de"),
        output_class=IntentionAnalysisResponse,
    )
    return IntentionAnalysisResponse.model_validate(response)


async def rate_criteria_relevance(intention_analysis: IntentionAnalysisResponse) -> CriteriaDefinitionResponse:
    """Bewerte die Relevanz der Qualitätskriterien für das analysierte Kapitel."""
    response = await llm_invoke_structured(
        model=ENV.LITELLM.MODEL,
        prompt=render_prompt_format(
            CRITERIA_RATING_USER_PROMPT,
            analysis_rationale=intention_analysis.analysis_rationale,
            main_part=intention_analysis.main_part,
            subpart=intention_analysis.subpart,
            structure=intention_analysis.structure,
            purpose=intention_analysis.purpose,
            content_focus=intention_analysis.content_focus,
            exclusions=intention_analysis.exclusions,
            dependencies=intention_analysis.dependencies,
        ),
        system_prompt=wrap_system_prompt(CRITERIA_RATING_SYSTEM_PROMPT, lang="de"),
        output_class=CriteriaDefinitionResponse,
    )
    return CriteriaDefinitionResponse.model_validate(response)


async def analyze_quality(quality_analysis_request: QualityAnalysisRequest) -> QualityAnalysisResponse:
    """Analysiere ein Kapitel gegen ein einzelnes Qualitätskriterium."""
    response = await llm_invoke_structured(
        model=ENV.LITELLM.MODEL,
        prompt=render_prompt_format(
            QUALITY_ANALYSIS_USER_PROMPT,
            analysis_focus=quality_analysis_request.analysis_focus,
            chapter=quality_analysis_request.chapter,
            fullfilment_minimal=quality_analysis_request.fullfilment_minimal,
            fullfilment_optimal=quality_analysis_request.fullfilment_optimal,
            fullfilment_negative=quality_analysis_request.fullfilment_negative,
            main_part=quality_analysis_request.main_part,
            subpart=quality_analysis_request.subpart,
            purpose=quality_analysis_request.purpose,
            structure=quality_analysis_request.structure,
            exclusions=quality_analysis_request.exclusions,
            dependencies=quality_analysis_request.dependencies,
        ),
        system_prompt=wrap_system_prompt(QUALITY_ANALYSIS_SYSTEM_PROMPT, lang="de"),
        output_class=QualityAnalysisResponse,
    )
    return QualityAnalysisResponse.model_validate(response)


async def formulate_risks(risk_formulator_input: RiskFormulatorInput) -> list[RiskFormulatorFinding]:
    """Formuliere Risikohinweise aus identifizierten Qualitätsmängeln."""
    response = await llm_invoke_structured(
        model=ENV.LITELLM.MODEL,
        prompt=render_prompt_format(
            RISK_FORMULATOR_USER_PROMPT,
            chapter=risk_formulator_input.chapter_text,
            quality_defects=risk_formulator_input.quality_defects,
        ),
        system_prompt=wrap_system_prompt(RISK_FORMULATOR_SYSTEM_PROMPT, lang="de"),
        output_class=RiskFormulatorResponse,
    )

    return response.risks


async def format_risk_findings(chapter_id: UUID, risk_findings: list[RiskFormulatorFinding]) -> RiskFinderOutput:
    """Verknüpfe Risikohinweise mit der Kapitel-ID."""
    formatted_findings = []
    for finding in risk_findings:
        formatted_findings.append(
            RiskFinding(
                risk_id=uuid4(),
                chapter_id=chapter_id,
                quote=finding.quote,
                description=finding.description,
                implications=finding.implications,
                recommendation=finding.recommendation,
                severity=finding.severity,
            )
        )
    return RiskFinderOutput(risks=formatted_findings)


def _relevant_criteria(quality_output: CriteriaDefinitionResponse) -> list[CriterionRatingItem]:
    threshold = config.RISK_CHECKER_WORKFLOW.RELEVANCE_RATING_THRESHOLD
    return [item for item in quality_output.criterion_ratings if item.relevance_rating >= threshold]


def _quality_analysis_request(
    chapter_text: str,
    intention_output: IntentionAnalysisResponse,
    item: CriterionRatingItem,
) -> QualityAnalysisRequest:
    return QualityAnalysisRequest(
        chapter=chapter_text,
        analysis_focus=item.criterion,
        main_part=intention_output.main_part,
        subpart=intention_output.subpart,
        purpose=intention_output.purpose,
        structure=intention_output.structure,
        exclusions=intention_output.exclusions,
        dependencies=intention_output.dependencies,
        fullfilment_minimal=item.fullfilment_minimal,
        fullfilment_optimal=item.fullfilment_optimal,
        fullfilment_negative=item.fullfilment_negative,
    )


def _quality_defects(quality_check_results: list[QualityAnalysisResponse]) -> dict[int, QualityCheckItem]:
    threshold = config.RISK_CHECKER_WORKFLOW.QUALITY_DEFECT_RATING_THRESHOLD
    defect_results = [
        item
        for result in quality_check_results
        for item in result.quality_check_results
        if item.rating < threshold
    ]
    return {
        i: QualityCheckItem(
            quote=result.quote,
            rating=result.rating,
            rating_rationale=result.rating_rationale,
            breached_standard_negative=result.breached_standard_negative,
        )
        for i, result in enumerate(defect_results, start=1)
    }


@workflow.defn(name=RISIKOHINWEISER_WORKFLOW_NAME)
class RiskCheckerWorkflow:
    @workflow.run
    async def run(self, chapter: PFBChapter) -> RiskFinderOutput:
        intention_output = await analyze_intention(chapter.text)
        quality_output = await rate_criteria_relevance(intention_output)

        quality_check_results = await workflow.asyncio.gather(
            *(
                analyze_quality(
                    _quality_analysis_request(chapter.text, intention_output, item)
                )
                for item in _relevant_criteria(quality_output)
            )
        )

        quality_defects = _quality_defects(quality_check_results)

        if not quality_defects:
            return await format_risk_findings(chapter_id=chapter.id, risk_findings=[])

        risk_findings = await formulate_risks(
            RiskFormulatorInput(chapter_text=chapter.text, quality_defects=quality_defects)
        )

        return await format_risk_findings(chapter_id=chapter.id, risk_findings=risk_findings)
