from typing import Any

from db_pipelines import config
from db_pipelines.constants import Bundesland, Hierarchy
from db_pipelines.norm_specs import INGESTED_DOCTYPES, collect_norm_specs, norm_specs_for_block, state_law_blocks
from db_pipelines.schemas.db import DocType
from db_pipelines.schemas.temporal import NormSpec
from db_pipelines.workflows.update_rechtsgrundlage.workflow import _build_source_inputs
from temporal import contracts

ALL_DOCTYPES_BLOCK: dict[str, Any] = {
    "parser": "XmlProcessor1",
    "base_url": "http://test",
    "extra": {"key": "value"},
    "gesetz": [" g1 "],
    "verordnung": ["vo1"],
    "richtlinie": ["rl1"],
    "verwaltungsvorschrift": ["vv1"],
    "technische_norm": ["tn1"],
}

RAW_CONFIG: dict[str, Any] = {
    "eu": {"parser": "XmlProcessor2", "base_url": "http://eu.test", "verordnung": ["eu_vo"]},
    "bund": ALL_DOCTYPES_BLOCK,
    "bundeslaender": [
        {"name": "Bayern", "parser": "XmlProcessor2", "base_url": "http://by.test", "verwaltungsvorschrift": ["by_vv"]},
    ],
}


def _key(spec: Any) -> tuple[Any, ...]:
    return (spec.source, spec.parser, str(spec.base_url), spec.extra, spec.slug, spec.doctype, spec.bundesland)


def test_block_expands_every_law_doctype_but_not_technische_norm() -> None:
    specs = norm_specs_for_block(config.BaseRelevantLaws(**ALL_DOCTYPES_BLOCK), Hierarchy.BUND, None, INGESTED_DOCTYPES)

    assert [(s.slug, s.doctype) for s in specs] == [
        ("g1", DocType.GESETZ),
        ("vo1", DocType.VERORDNUNG),
        ("rl1", DocType.RICHTLINIE),
        ("vv1", DocType.VERWALTUNGSVORSCHRIFT),
    ]
    assert all(s.parser == "XmlProcessor1" and s.extra == {"key": "value"} for s in specs)


def test_plural_bundeslaender_wins_over_legacy_singular() -> None:
    by = {"name": "Bayern", "parser": "p", "base_url": "http://by.test"}
    be = {"name": "Berlin", "parser": "p", "base_url": "http://be.test"}

    both = contracts.RelevantLaws.model_validate({"bundesland": be, "bundeslaender": [by]})
    legacy = contracts.RelevantLaws.model_validate({"bundesland": be})

    assert [s.name for s in state_law_blocks(both)] == [contracts.Bundesland.BY]
    assert [s.name for s in state_law_blocks(legacy)] == [contracts.Bundesland.BE]
    assert state_law_blocks(contracts.RelevantLaws()) == []


def test_cli_and_workflow_ingest_the_same_norms() -> None:
    cli_specs = collect_norm_specs(config.RelevantLaws(**RAW_CONFIG))

    workflow_specs: list[NormSpec] = []
    for src_input in _build_source_inputs(contracts.RelevantLaws.model_validate(RAW_CONFIG), overwrite=False):
        location = Bundesland(src_input.location.value) if src_input.location is not None else None
        workflow_specs += norm_specs_for_block(
            src_input.laws, Hierarchy(src_input.source.value), location, INGESTED_DOCTYPES
        )

    assert [_key(s) for s in cli_specs] == [_key(s) for s in workflow_specs]
    assert [(s.slug, s.doctype, s.bundesland) for s in workflow_specs] == [
        ("eu_vo", DocType.VERORDNUNG, None),
        ("g1", DocType.GESETZ, None),
        ("vo1", DocType.VERORDNUNG, None),
        ("rl1", DocType.RICHTLINIE, None),
        ("vv1", DocType.VERWALTUNGSVORSCHRIFT, None),
        ("by_vv", DocType.VERWALTUNGSVORSCHRIFT, Bundesland.BY),
    ]


def test_technische_norm_slugs_are_never_fetched_as_laws() -> None:
    cli_specs = collect_norm_specs(config.RelevantLaws(**RAW_CONFIG))
    workflow_specs = collect_norm_specs(contracts.RelevantLaws.model_validate(RAW_CONFIG))

    assert DocType.TECHNISCHE_NORM not in {s.doctype for s in cli_specs + workflow_specs}
    assert "tn1" not in {s.slug for s in cli_specs + workflow_specs}
