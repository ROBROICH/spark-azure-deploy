from collections.abc import Mapping, Sequence
from enum import Enum
from typing import Any, Protocol

from db_pipelines.constants import Bundesland, Hierarchy
from db_pipelines.schemas.db import DocType
from db_pipelines.schemas.temporal import NormSpec

PRE_VERWALTUNGSVORSCHRIFT_DOCTYPES: tuple[DocType, ...] = (
    DocType.GESETZ,
    DocType.VERORDNUNG,
    DocType.RICHTLINIE,
)

INGESTED_DOCTYPES: tuple[DocType, ...] = (*PRE_VERWALTUNGSVORSCHRIFT_DOCTYPES, DocType.VERWALTUNGSVORSCHRIFT)


class LawsBlock(Protocol):
    @property
    def parser(self) -> str: ...

    @property
    def extra(self) -> Mapping[str, Any]: ...

    @property
    def base_url(self) -> Any: ...


class StateLawsBlock(LawsBlock, Protocol):
    @property
    def name(self) -> Enum: ...


class RelevantLawsConfig[B: LawsBlock, S: StateLawsBlock](Protocol):
    @property
    def eu(self) -> B | None: ...

    @property
    def bund(self) -> B | None: ...

    @property
    def bundesland(self) -> S | None: ...

    @property
    def bundeslaender(self) -> Sequence[S] | None: ...


def state_law_blocks[S: StateLawsBlock](relevant: RelevantLawsConfig[Any, S]) -> list[S]:
    if relevant.bundeslaender:
        return list(relevant.bundeslaender)
    if relevant.bundesland is not None:
        return [relevant.bundesland]
    return []


def norm_specs_for_block(
    block: LawsBlock,
    source: Hierarchy,
    location: Bundesland | None,
    doctypes: Sequence[DocType],
) -> list[NormSpec]:
    specs: list[NormSpec] = []
    for doctype in doctypes:
        slugs: Sequence[str] = getattr(block, doctype.value, None) or []
        for slug in slugs:
            specs.append(
                NormSpec(
                    source=source,
                    parser=block.parser,
                    base_url=block.base_url,
                    extra=dict(block.extra),
                    slug=slug.strip(),
                    doctype=doctype,
                    bundesland=location,
                )
            )
    return specs


def collect_norm_specs(relevant: RelevantLawsConfig[Any, Any]) -> list[NormSpec]:
    specs: list[NormSpec] = []
    if relevant.eu:
        specs += norm_specs_for_block(relevant.eu, Hierarchy.EU, None, INGESTED_DOCTYPES)
    if relevant.bund:
        specs += norm_specs_for_block(relevant.bund, Hierarchy.BUND, None, INGESTED_DOCTYPES)
    for state in state_law_blocks(relevant):
        specs += norm_specs_for_block(state, Hierarchy.BUNDESLAND, Bundesland(state.name.value), INGESTED_DOCTYPES)
    return specs
