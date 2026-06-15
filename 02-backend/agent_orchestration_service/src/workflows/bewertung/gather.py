"""Activity: _gather_norm_context + workflow wrapper.

Fetches the full norm tree from the examination service graph and
reconstructs typed NormContext with shared AtomaresTBM/Rechtsfolge types.
"""

from collections import defaultdict
from datetime import timedelta
from typing import Any
from uuid import UUID

from temporal.workflows.rechtsmethodik.types import (
    AtomaresTBM,
    Auslegungsvorschlag,
    BestimmterRechtsbegriff,
    ExplicitVerweiseInfo,
    Legaldefinition,
    Rechtsbegriffe,
    Rechtsfolge,
    Source,
    UnbestimmterRechtsbegriff,
    Untergliederung,
    Verweise,
)
from temporalio import activity, workflow
from temporalio.common import RetryPolicy

from src.services.api_clients import ExaminationServiceClient
from src.workflows.bewertung.types import (
    FundstelleContext,
    GatherNormContextInput,
    NormContext,
    SatzContext,
)


async def _batch_by_type(project_id: UUID, all_nodes: list[dict[str, Any]], node_type: str) -> list[dict[str, Any]]:
    refs = [{"node_type": node_type, "id": n["id"]} for n in all_nodes if n.get("node_type") == node_type]
    if not refs:
        return []
    batch = await ExaminationServiceClient.batch_get_nodes(project_id, refs)
    return batch.get("results", [])


def _group_by(nodes: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for node in nodes:
        val = node.get(key)
        if val:
            result[str(val)].append(node)
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _min_chunk_order(
    fs: dict[str, Any],
    chunk_order_map: dict[str, int],
) -> int:
    """Earliest chunk.order for a Fundstelle - gives document position."""
    orders = [chunk_order_map[str(cid)] for cid in fs.get("chunk_ids", []) if str(cid) in chunk_order_map]
    return min(orders) if orders else float("inf")  # type: ignore[return-value]


# ---------------------------------------------------------------------------
# Reconstruct AtomaresTBM nodes.
# ---------------------------------------------------------------------------


def _reconstruct_verweise(
    parent_id: str,
    explizite_by_parent: dict[str, list[dict[str, Any]]],
    implizite_by_parent: dict[str, list[dict[str, Any]]],
) -> Verweise:
    explizit = []
    for ev in explizite_by_parent.get(parent_id, []):
        raw_ug = ev.get("untergliederung") or []
        explizit.append(
            ExplicitVerweiseInfo(
                gesetz=ev.get("gesetz"),
                paragraph_nr=ev.get("paragraph_nr"),
                absatz_nr=ev.get("absatz_nr"),
                satz_nr=ev.get("satz_nr"),
                untergliederung=[Untergliederung(typ=u["typ"], wert=u["wert"]) for u in raw_ug] or None,
                verweis_typ=ev.get("verweis_typ"),
                kontext=ev.get("kontext"),
            )
        )
    implizit = [iv.get("rationale", "") for iv in implizite_by_parent.get(parent_id, [])]
    return Verweise(explizit=explizit, implizit=implizit)


def _reconstruct_atomares_tbm(
    tbm: dict[str, Any],
    brbs_by_tbm: dict[str, list[dict[str, Any]]],
    lds_by_brb: dict[str, list[dict[str, Any]]],
    urbs_by_tbm: dict[str, list[dict[str, Any]]],
    avs_by_urb: dict[str, list[dict[str, Any]]],
    explizite_by_tbm: dict[str, list[dict[str, Any]]],
    implizite_by_tbm: dict[str, list[dict[str, Any]]],
) -> AtomaresTBM:
    tbm_id = str(tbm["id"])

    # Bestimmte Rechtsbegriffe → Legaldefinitionen
    bestimmte = []
    for brb in brbs_by_tbm.get(tbm_id, []):
        brb_id = str(brb["id"])
        bestimmte.append(
            BestimmterRechtsbegriff(
                begriff=brb.get("begriff", ""),
                definitions=[
                    Legaldefinition(
                        begriff=ld.get("begriff", ""),
                        definition=ld.get("definition", ""),
                        source=Source(
                            jurabk=ld.get("source_jurabk", ""),
                            paragraph_nr=ld.get("source_paragraph_nr", ""),
                        ),
                    )
                    for ld in lds_by_brb.get(brb_id, [])
                ],
            )
        )

    # Unbestimmte Rechtsbegriffe → Auslegungsvorschläge
    unbestimmte = []
    for urb in urbs_by_tbm.get(tbm_id, []):
        urb_id = str(urb["id"])
        unbestimmte.append(
            UnbestimmterRechtsbegriff(
                begriff=urb.get("begriff", ""),
                auslegung=urb["auslegung"],
                auslegungsvorschläge=[
                    Auslegungsvorschlag(
                        auslegung_methode=av.get("methode", ""),
                        auslegungsvorschlag=av.get("text", ""),
                    )
                    for av in avs_by_urb.get(urb_id, [])
                ],
            )
        )

    return AtomaresTBM(
        id=UUID(tbm_id),
        text=tbm.get("text", ""),
        prueffrage=tbm.get("prueffrage", ""),
        pruefgegenstand=tbm.get("pruefgegenstand", ""),
        verweise=_reconstruct_verweise(tbm_id, explizite_by_tbm, implizite_by_tbm),
        rechtsbegriffe=Rechtsbegriffe(
            bestimmte_rechtsbegriffe=bestimmte,
            unbestimmte_rechtsbegriffe=unbestimmte,
        ),
    )


# ---------------------------------------------------------------------------
# Reconstruct Rechtsfolge nodes.
# ---------------------------------------------------------------------------


def _reconstruct_rechtsfolge(
    rf: dict[str, Any],
    sa_by_rf: dict[str, list[dict[str, Any]]],
    adr_by_rf: dict[str, list[dict[str, Any]]],
    esp_by_rf: dict[str, list[dict[str, Any]]],
    ea_by_rf: dict[str, list[dict[str, Any]]],
    explizite_by_rf: dict[str, list[dict[str, Any]]],
    implizite_by_rf: dict[str, list[dict[str, Any]]],
) -> Rechtsfolge | None:
    rf_id = str(rf["id"])

    sa_nodes = sa_by_rf.get(rf_id, [])
    adr_nodes = adr_by_rf.get(rf_id, [])
    if not sa_nodes or not adr_nodes:
        return None

    esp_nodes = esp_by_rf.get(rf_id, [])
    ea_nodes = ea_by_rf.get(rf_id, [])

    verweise = _reconstruct_verweise(rf_id, explizite_by_rf, implizite_by_rf)
    has_verweise = verweise.explizit or verweise.implizit

    return Rechtsfolge(
        text=rf.get("text", ""),
        sollensanordnungen=sa_nodes[0]["kategorie"],
        rechtsfolgen_adressat=adr_nodes[0]["entscheidung"],
        ermessensspielraum=esp_nodes[0].get("entscheidung") if esp_nodes else None,
        ermessensart=ea_nodes[0].get("art") if ea_nodes else None,
        verweise=verweise if has_verweise else None,
    )


# =============================================================================
# ACTIVITY
# =============================================================================


async def _build_chunk_order_map(
    project_id: UUID,
    fundstellen: list[dict[str, Any]],
) -> dict[str, int]:
    """Fetch chunk order for Fundstellen document-order sorting.

    Collect unique chunk_ids from all Fundstellen, batch-fetch their
    order field, and build a lookup map chunk_id → order.
    """
    all_chunk_ids: set[str] = set()
    for fs in fundstellen:
        for cid in fs.get("chunk_ids", []):
            all_chunk_ids.add(str(cid))
    chunk_order_map: dict[str, int] = {}
    if all_chunk_ids:
        chunk_refs = [{"node_type": "chunk", "id": cid} for cid in all_chunk_ids]
        chunk_batch = await ExaminationServiceClient.batch_get_nodes(project_id, chunk_refs)
        for ch in chunk_batch.get("results", []):
            chunk_order_map[str(ch["id"])] = ch.get("order", 0)
    return chunk_order_map


def _build_satz_context(
    satz: dict[str, Any],
    satz_id: str,
    tbms_by_satz: dict[str, list[dict[str, Any]]],
    rfs_by_satz: dict[str, list[dict[str, Any]]],
    fundstellen_by_satz: dict[str, list[dict[str, Any]]],
    chunk_order_map: dict[str, int],
    tbm_indices: dict[str, dict[str, list[dict[str, Any]]]],
    rf_indices: dict[str, dict[str, list[dict[str, Any]]]],
) -> SatzContext:
    """Reconstruct a single SatzContext from graph nodes."""
    # Reconstruct AtomaresTBM from graph nodes
    typed_tbms: list[AtomaresTBM] = [
        _reconstruct_atomares_tbm(
            tbm,
            tbm_indices["brbs_by_tbm"],
            tbm_indices["lds_by_brb"],
            tbm_indices["urbs_by_tbm"],
            tbm_indices["avs_by_urb"],
            tbm_indices["explizite_by_tbm"],
            tbm_indices["implizite_by_tbm"],
        )
        for tbm in tbms_by_satz.get(satz_id, [])
    ]

    # Reconstruct Rechtsfolge (first one if exists)
    typed_rechtsfolge: Rechtsfolge | None = None
    rf_nodes = rfs_by_satz.get(satz_id, [])
    if rf_nodes:
        typed_rechtsfolge = _reconstruct_rechtsfolge(
            rf_nodes[0],
            rf_indices["sa_by_rf"],
            rf_indices["adr_by_rf"],
            rf_indices["esp_by_rf"],
            rf_indices["ea_by_rf"],
            rf_indices["explizite_by_rf"],
            rf_indices["implizite_by_rf"],
        )

    # Collect Fundstellen for this Satz, sorted by document order.
    # Uses chunk.order (the definitive position within a document) so
    # that parent chapters always precede their sub-chapters.
    raw_fundstellen = fundstellen_by_satz.get(satz_id, [])
    raw_fundstellen.sort(
        key=lambda fs: (
            str(fs.get("dokument_id", "")),
            _min_chunk_order(fs, chunk_order_map),
            str(fs.get("id", "")),
        )
    )
    typed_fundstellen: list[FundstelleContext] = [
        FundstelleContext(
            id=str(fs["id"]),
            dokument_id=str(fs["dokument_id"]),
            title=fs.get("title", ""),
            text=fs.get("text", ""),
            chunk_ids=[str(c) for c in fs.get("chunk_ids", [])],
            page_numbers=fs.get("page_numbers", []),
        )
        for fs in raw_fundstellen
    ]

    return SatzContext(
        satz_id=satz_id,
        satz_text=satz.get("text", ""),
        norm_typ_lvl_1=satz.get("norm_typ_lvl_1"),
        norm_typ_lvl_2=satz.get("norm_typ_lvl_2"),
        atomare_tbm=typed_tbms,
        rechtsfolge=typed_rechtsfolge,
        fundstellen=typed_fundstellen,
    )


@activity.defn(name="gather_norm_context")
async def _gather_norm_context(input: GatherNormContextInput) -> NormContext:
    """Fetch the full norm tree from examination service and return as NormContext."""
    project_id = input.project_id

    # 1. List all node refs
    graph = await ExaminationServiceClient.list_nodes(project_id)
    all_nodes = graph.get("nodes", [])

    # 2. Batch-fetch all needed node types
    gesetze = await _batch_by_type(project_id, all_nodes, "gesetz")
    norms = await _batch_by_type(project_id, all_nodes, "norm")
    absaetze = await _batch_by_type(project_id, all_nodes, "absatz")
    saetze = await _batch_by_type(project_id, all_nodes, "satz")
    atomare_tbms = await _batch_by_type(project_id, all_nodes, "atomares_tbm")
    rechtsfolgen = await _batch_by_type(project_id, all_nodes, "rechtsfolge")
    fundstellen = await _batch_by_type(project_id, all_nodes, "fundstelle")

    # Child types for AtomaresTBM reconstruction
    bestimmte_rbs = await _batch_by_type(project_id, all_nodes, "bestimmter_rechtsbegriff")
    legaldefs = await _batch_by_type(project_id, all_nodes, "legaldefinition")
    unbestimmte_rbs = await _batch_by_type(project_id, all_nodes, "unbestimmter_rechtsbegriff")
    auslegungen = await _batch_by_type(project_id, all_nodes, "auslegungsvorschlag")
    explizite_verweise = await _batch_by_type(project_id, all_nodes, "expliziter_verweis")
    implizite_verweise = await _batch_by_type(project_id, all_nodes, "impliziter_verweis")

    # Child types for Rechtsfolge reconstruction
    sollensanordnungen = await _batch_by_type(project_id, all_nodes, "sollensanordnungen")
    adressaten = await _batch_by_type(project_id, all_nodes, "adressat")
    ermessensspielraeume = await _batch_by_type(project_id, all_nodes, "ermessensspielraum")
    ermessensarten = await _batch_by_type(project_id, all_nodes, "ermessensart")

    # 3. Build parent→children indices
    absaetze_by_norm = _group_by(absaetze, "norm_id")
    saetze_by_absatz = _group_by(saetze, "absatz_id")
    tbms_by_satz = _group_by(atomare_tbms, "satz_id")
    rfs_by_satz = _group_by(rechtsfolgen, "satz_id")
    fundstellen_by_satz = _group_by(fundstellen, "satz_id")

    # 3b. Fetch chunk order for Fundstellen document-order sorting.
    chunk_order_map = await _build_chunk_order_map(project_id, fundstellen)

    # AtomaresTBM child indices
    tbm_indices: dict[str, dict[str, list[dict[str, Any]]]] = {
        "brbs_by_tbm": _group_by(bestimmte_rbs, "atomares_tbm_id"),
        "lds_by_brb": _group_by(legaldefs, "bestimmter_rechtsbegriff_id"),
        "urbs_by_tbm": _group_by(unbestimmte_rbs, "atomares_tbm_id"),
        "avs_by_urb": _group_by(auslegungen, "unbestimmter_rechtsbegriff_id"),
        "explizite_by_tbm": _group_by(explizite_verweise, "atomares_tbm_id"),
        "implizite_by_tbm": _group_by(implizite_verweise, "atomares_tbm_id"),
    }

    # Rechtsfolge child indices
    rf_indices: dict[str, dict[str, list[dict[str, Any]]]] = {
        "sa_by_rf": _group_by(sollensanordnungen, "rechtsfolge_id"),
        "adr_by_rf": _group_by(adressaten, "rechtsfolge_id"),
        "esp_by_rf": _group_by(ermessensspielraeume, "rechtsfolge_id"),
        "ea_by_rf": _group_by(ermessensarten, "rechtsfolge_id"),
        "explizite_by_rf": _group_by(explizite_verweise, "rechtsfolge_id"),
        "implizite_by_rf": _group_by(implizite_verweise, "rechtsfolge_id"),
    }

    # 4. Find the target Norm
    norm = next(
        (n for n in norms if str(n["id"]) == str(input.norm_id)),
        None,
    )
    if not norm:
        msg = f"Norm {input.norm_id} not found in project {project_id}"
        raise ValueError(msg)

    # Resolve Gesetz
    gesetz = next(
        (g for g in gesetze if str(g["id"]) == str(norm["gesetz_id"])),
        None,
    )
    if not gesetz:
        msg = f"Gesetz {norm['gesetz_id']} not found for norm {input.norm_id}"
        raise ValueError(msg)

    # 5. Walk the tree: Norm → Absätze → Sätze
    norm_id = str(norm["id"])
    satz_contexts: list[SatzContext] = []

    for absatz in absaetze_by_norm.get(norm_id, []):
        absatz_id = str(absatz["id"])
        for satz in saetze_by_absatz.get(absatz_id, []):
            satz_id = str(satz["id"])
            satz_contexts.append(
                _build_satz_context(
                    satz,
                    satz_id,
                    tbms_by_satz,
                    rfs_by_satz,
                    fundstellen_by_satz,
                    chunk_order_map,
                    tbm_indices,
                    rf_indices,
                )
            )

    # 6. Build NormContext
    return NormContext(
        gesetz_name=gesetz.get("name", ""),
        jurabk=gesetz.get("jurabk", ""),
        paragraph_nr=norm.get("paragraph_nr", ""),
        paragraph_titel=norm.get("paragraph_titel", ""),
        paragraph_text=norm.get("text", ""),
        saetze=satz_contexts,
    )


# =============================================================================
# ACTIVITY WRAPPER (called from orchestrator)
# =============================================================================


async def gather_norm_context(project_id: UUID, norm_id: UUID) -> NormContext:
    raw = await workflow.execute_activity(
        _gather_norm_context,
        GatherNormContextInput(project_id=project_id, norm_id=norm_id),
        start_to_close_timeout=timedelta(minutes=10),
        retry_policy=RetryPolicy(maximum_attempts=5, maximum_interval=timedelta(minutes=1)),
    )
    return NormContext.model_validate(raw)
