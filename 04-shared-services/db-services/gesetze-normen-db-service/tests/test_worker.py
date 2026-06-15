from db_pipelines.constants import Bundesland, Hierarchy
from db_pipelines.schemas.db import DocType
from db_pipelines.schemas.temporal import NormSpec, ParseNormInput, ParseNormResult
from db_pipelines.workflows.update_rechtsgrundlage import UpdateRechtsgrundlageWorkflow
from db_pipelines.workflows.update_rechtsgrundlage_source import UpdateRechtsgrundlageSourceWorkflow
from temporal.workflows.gesetze_normen.types import (
    BaseRelevantLaws,
    RelevantLaws,
    StateRelevantLaws,
    UpdateRechtsgrundlageInput,
    UpdateRechtsgrundlageOutput,
)
from temporal.workflows.gesetze_normen.update_rechtsgrundlage import (
    TASK_QUEUE,
    UPDATE_RECHTSGRUNDLAGE_WORKFLOW_ID,
)
from temporalio import activity
from temporalio.contrib.pydantic import pydantic_data_converter
from temporalio.testing import WorkflowEnvironment
from temporalio.worker import UnsandboxedWorkflowRunner, Worker


async def test_update_rechtsgrundlage_workflow_expands_config_and_aggregates_results() -> None:
    """End-to-end test: workflow flattens RelevantLaws into NormSpecs, runs
    download + parse for each, and counts written vs skipped per activity result.
    """
    downloaded_specs: list[NormSpec] = []
    parse_inputs: list[ParseNormInput] = []

    @activity.defn(name="query_existing_norms")
    async def fake_query_existing_norms() -> list[str]:
        return ["ExistingJurabk"]

    @activity.defn(name="parse_norm")
    async def fake_parse_norm(input: ParseNormInput) -> ParseNormResult:
        downloaded_specs.append(input.spec)
        parse_inputs.append(input)
        # Mark a single slug as "skipped" so we can verify the count aggregation.
        status = "skipped" if input.spec.slug == "skip_me" else "written"
        return ParseNormResult(
            slug=input.spec.slug,
            jurabk=input.spec.slug.upper(),
            status=status,
        )

    pipeline_config = RelevantLaws(
        eu=BaseRelevantLaws(parser="XmlProcessor2", base_url="http://test", gesetz=["eu_g"], verordnung=["eu_vo"]),
        bund=BaseRelevantLaws(parser="XmlProcessor1", base_url="http://test", gesetz=["bund_g"]),
        bundeslaender=[
            StateRelevantLaws(name=Bundesland.BY, parser="XmlProcessor2", base_url="http://test", gesetz=["by_g"], richtlinie=["skip_me"]),
        ],
    )

    async with await WorkflowEnvironment.start_local(data_converter=pydantic_data_converter) as env:
        async with Worker(
            env.client,
            task_queue=TASK_QUEUE,
            workflows=[UpdateRechtsgrundlageWorkflow, UpdateRechtsgrundlageSourceWorkflow],
            activities=[fake_query_existing_norms, fake_parse_norm],
            workflow_runner=UnsandboxedWorkflowRunner(),
        ):
            result = await env.client.execute_workflow(
                UPDATE_RECHTSGRUNDLAGE_WORKFLOW_ID,
                UpdateRechtsgrundlageInput(pipeline_config=pipeline_config, overwrite=False),
                id=f"test-{UPDATE_RECHTSGRUNDLAGE_WORKFLOW_ID}",
                task_queue=TASK_QUEUE,
                result_type=UpdateRechtsgrundlageOutput,
            )

    expected_specs = {
        ("eu_g", Hierarchy.EU, DocType.GESETZ, None),
        ("eu_vo", Hierarchy.EU, DocType.VERORDNUNG, None),
        ("bund_g", Hierarchy.BUND, DocType.GESETZ, None),
        ("by_g", Hierarchy.BUNDESLAND, DocType.GESETZ, Bundesland.BY),
        ("skip_me", Hierarchy.BUNDESLAND, DocType.RICHTLINIE, Bundesland.BY),
    }
    actual_specs = {(s.slug, s.source, s.doctype, s.bundesland) for s in downloaded_specs}
    assert actual_specs == expected_specs
    assert {(p.spec.slug, p.spec.source, p.spec.doctype, p.spec.bundesland) for p in parse_inputs} == expected_specs

    # Every parse activity receives the snapshot returned by query_existing_norms.
    assert all(p.overwrite is False for p in parse_inputs)

    assert result.written == 4
    assert result.skipped == 1
