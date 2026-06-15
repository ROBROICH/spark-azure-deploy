"""Map RechtsmethodikWorkflowOutput → NormData for suche-und-zuordnung.

Converts between the two type systems, preserving TBM UUIDs so they flow
through the search pipeline and are available at Fundstelle insertion time.
"""

from temporal.workflows.modul_suche_und_zuordnung import types as suz
from temporal.workflows.rechtsmethodik.types import (
    Absatz,
    Auslegungsvorschlag,
    Legaldefinition,
    Rechtsbegriffe,
    RechtsmethodikWorkflowOutput,
    RechtsmethodikWorkflowSatzOutput,
)
from temporal.workflows.rechtsmethodik.types import (
    AtomaresTBM as RMAtomaresTBM,
)
from temporal.workflows.rechtsmethodik.types import (
    BestimmterRechtsbegriff as RMBestimmterRechtsbegriff,
)
from temporal.workflows.rechtsmethodik.types import (
    UnbestimmterRechtsbegriff as RMUnbestimmterRechtsbegriff,
)


def _map_definition(ld: Legaldefinition) -> suz.Definition:
    source = None
    if ld.source:
        source = suz.DefinitionSource(
            jurabk=ld.source.jurabk,
            paragraph_nr=ld.source.paragraph_nr,
        )
    return suz.Definition(
        uuid=None,
        definition=ld.definition,
        source=source,
    )


def _map_bestimmter_rechtsbegriff(brb: RMBestimmterRechtsbegriff) -> suz.BestimmterRechtsbegriff:
    return suz.BestimmterRechtsbegriff(
        begriff=brb.begriff,
        selected_definition=None,
        definitions=[_map_definition(d) for d in brb.definitions],
    )


def _map_auslegungsvorschlag(av: Auslegungsvorschlag) -> suz.Auslegungsvorschlag:
    return suz.Auslegungsvorschlag(auslegungvorschlag=av.auslegungsvorschlag)


def _map_unbestimmter_rechtsbegriff(urb: RMUnbestimmterRechtsbegriff) -> suz.UnbestimmterRechtsbegriff:
    return suz.UnbestimmterRechtsbegriff(
        begriff=urb.begriff,
        auslegungsvorschlaege=[_map_auslegungsvorschlag(av) for av in urb.auslegungsvorschläge],
    )


def _map_rechtsbegriffe(rb: Rechtsbegriffe) -> suz.Rechtsbegriffe:
    return suz.Rechtsbegriffe(
        bestimmte_rechtsbegriffe=[_map_bestimmter_rechtsbegriff(b) for b in rb.bestimmte_rechtsbegriffe],
        unbestimmte_rechtsbegriffe=[_map_unbestimmter_rechtsbegriff(u) for u in rb.unbestimmte_rechtsbegriffe],
    )


def _map_tbm(tbm: RMAtomaresTBM) -> suz.AtomaresTBM:
    rb = _map_rechtsbegriffe(tbm.rechtsbegriffe) if tbm.rechtsbegriffe else None
    return suz.AtomaresTBM(
        id=tbm.id,
        prueffrage=tbm.prueffrage,
        rechtsbegriffe=rb,
    )


def _map_satz(satz: RechtsmethodikWorkflowSatzOutput, position: int) -> suz.Satz:
    return suz.Satz(
        satz_nr=satz.satz_nr,
        position=position,
        satz_text=satz.satz_text,
        tatbestandsmerkmale=satz.tatbestandsmerkmale or [],
        atomare_tatbestandsmerkmale=[_map_tbm(t) for t in (satz.atomare_tatbestandsmerkmale or [])],
    )


def _map_absatz(absatz: Absatz[RechtsmethodikWorkflowSatzOutput]) -> suz.Absatz:
    return suz.Absatz(
        absatz_nr=absatz.absatz_nr,
        absatz_text=absatz.absatz_text,
        saetze=[_map_satz(s, position) for position, s in enumerate(absatz.saetze)],
    )


def map_rm_to_norm_data(rm_output: RechtsmethodikWorkflowOutput) -> suz.NormData:
    """Convert RechtsmethodikWorkflowOutput to NormData for suche-und-zuordnung."""
    return suz.NormData(
        gesetz=rm_output.gesetz,
        jurabk=rm_output.jurabk,
        paragraph=rm_output.paragraph_text,
        paragraph_nr=rm_output.paragraph_nr,
        paragraph_titel=rm_output.paragraph_titel,
        absaetze=[_map_absatz(a) for a in rm_output.absaetze],
    )
