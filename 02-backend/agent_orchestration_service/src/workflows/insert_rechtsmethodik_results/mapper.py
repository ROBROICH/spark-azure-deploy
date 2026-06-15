"""Pure mapping functions from RechtsmethodikWorkflowOutput to examination service insert payloads."""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

from temporal.workflows.rechtsmethodik.types import (
    Absatz,
    AtomaresTBM,
    Auslegungsvorschlag,
    BestimmterRechtsbegriff,
    ExplicitVerweiseInfo,
    Legaldefinition,
    Rechtsfolge,
    RechtsmethodikWorkflowOutput,
    RechtsmethodikWorkflowSatzOutput,
    UnbestimmterRechtsbegriff,
)
from temporalio import workflow


def _insert(node_type: str, node_id: str | UUID, payload: dict[str, Any]) -> dict[str, Any]:
    return {"node_type": node_type, "id": str(node_id), "payload": payload}


def _new_id() -> str:
    """
    Generate a new UUID string for use as a node ID.
    Uses workflow.uuid4 if inside a workflow, otherwise uses stdlib uuid4.
    """
    if workflow.in_workflow():
        return str(workflow.uuid4())
    return str(uuid4())


def _satz_key(absatz_id: str, satz: RechtsmethodikWorkflowSatzOutput) -> tuple[str, str, tuple[str, ...]]:
    """Content-based dedup key for a satz within an absatz."""
    return (absatz_id, satz.satz_nr, tuple(satz.markers or []))


def _map_standangaben(gesetz_id: str, standangaben: list[dict[str, Any]]) -> list[dict[str, Any]]:
    inserts = []
    for sa in standangaben:
        inserts.append(
            _insert(
                "standangabe",
                _new_id(),
                {
                    "gesetz_id": gesetz_id,
                    "standtyp": sa.get("standtyp", ""),
                    "standkommentar": sa.get("standkommentar", ""),
                    "doknr": sa.get("doknr"),
                    "external_id": sa.get("external_id"),
                },
            )
        )
    return inserts


def _map_auslegungsvorschlage(
    unbestimmter_rechtsbegriff_id: str,
    auslegungsvorschlage: list[Auslegungsvorschlag],
) -> list[dict[str, Any]]:
    return [
        _insert(
            "auslegungsvorschlag",
            _new_id(),
            {
                "unbestimmter_rechtsbegriff_id": unbestimmter_rechtsbegriff_id,
                "methode": av.auslegung_methode,
                "text": av.auslegungsvorschlag,
            },
        )
        for av in auslegungsvorschlage
    ]


def _map_unbestimmte_rechtsbegriffe(
    atomares_tbm_id: str,
    rechtsbegriffe: list[UnbestimmterRechtsbegriff],
) -> list[dict[str, Any]]:
    inserts = []
    for urb in rechtsbegriffe:
        urb_id = _new_id()
        inserts.append(
            _insert(
                "unbestimmter_rechtsbegriff",
                urb_id,
                {
                    "atomares_tbm_id": atomares_tbm_id,
                    "begriff": urb.begriff,
                    "auslegung": urb.auslegung,
                },
            )
        )
        inserts.extend(_map_auslegungsvorschlage(urb_id, urb.auslegungsvorschläge))
    return inserts


def _map_legaldefinitionen(
    bestimmter_rechtsbegriff_id: str,
    definitionen: list[Legaldefinition],
) -> list[dict[str, Any]]:
    return [
        _insert(
            "legaldefinition",
            _new_id(),
            {
                "bestimmter_rechtsbegriff_id": bestimmter_rechtsbegriff_id,
                "begriff": ld.begriff,
                "definition": ld.definition,
                "source_jurabk": ld.source.jurabk,
                "source_paragraph_nr": ld.source.paragraph_nr,
            },
        )
        for ld in definitionen
    ]


def _map_bestimmte_rechtsbegriffe(
    atomares_tbm_id: str,
    rechtsbegriffe: list[BestimmterRechtsbegriff],
) -> list[dict[str, Any]]:
    inserts = []
    for brb in rechtsbegriffe:
        brb_id = _new_id()
        inserts.append(
            _insert(
                "bestimmter_rechtsbegriff",
                brb_id,
                {
                    "atomares_tbm_id": atomares_tbm_id,
                    "begriff": brb.begriff,
                },
            )
        )
        inserts.extend(_map_legaldefinitionen(brb_id, brb.definitions))
    return inserts


def _map_technische_normen(atomares_tbm_id: str, verweise: list[ExplicitVerweiseInfo]) -> list[dict[str, Any]]:
    return [
        _insert(
            "technische_norm",
            _new_id(),
            {
                "atomares_tbm_id": atomares_tbm_id,
                "name": v.technische_norm.kurzbeschreibung,
                "confidence": 1.0,
            },
        )
        for v in verweise
        if v.technische_norm
    ]


def _map_verweise(
    parent_id: str,
    parent_type: str,
    verweise: list[ExplicitVerweiseInfo],
    implizite_verweise: list[str],
) -> list[dict[str, Any]]:
    inserts = []
    parent_id_key = f"{parent_type}_id"

    for v in verweise:
        if v.technische_norm:
            continue

        untergliederung: list[dict[str, Any]] = []
        if v.untergliederung:
            untergliederung = [{"typ": u.typ, "wert": u.wert} for u in v.untergliederung]

        inserts.append(
            _insert(
                "expliziter_verweis",
                _new_id(),
                {
                    parent_id_key: parent_id,
                    "gesetz": v.gesetz,
                    "paragraph_nr": v.paragraph_nr,
                    "absatz_nr": v.absatz_nr,
                    "satz_nr": v.satz_nr,
                    "untergliederung": untergliederung,
                    "verweis_typ": v.verweis_typ,
                    "kontext": v.kontext,
                },
            )
        )

    for iv in implizite_verweise:
        inserts.append(
            _insert(
                "impliziter_verweis",
                _new_id(),
                {
                    parent_id_key: parent_id,
                    "rationale": iv,
                },
            )
        )

    return inserts


def _map_rechtsfolge(satz_id: str, rechtsfolge: Rechtsfolge) -> list[dict[str, Any]]:
    inserts = []
    rechtsfolge_id = _new_id()

    inserts.append(
        _insert(
            "rechtsfolge",
            rechtsfolge_id,
            {
                "satz_id": satz_id,
                "text": rechtsfolge.text,
            },
        )
    )

    inserts.append(
        _insert(
            "sollensanordnungen",
            _new_id(),
            {
                "rechtsfolge_id": rechtsfolge_id,
                "kategorie": rechtsfolge.sollensanordnungen,
            },
        )
    )

    inserts.append(
        _insert(
            "adressat",
            _new_id(),
            {
                "rechtsfolge_id": rechtsfolge_id,
                "entscheidung": rechtsfolge.rechtsfolgen_adressat,
            },
        )
    )

    if rechtsfolge.ermessensspielraum:
        inserts.append(
            _insert(
                "ermessensspielraum",
                _new_id(),
                {
                    "rechtsfolge_id": rechtsfolge_id,
                    "entscheidung": rechtsfolge.ermessensspielraum,
                },
            )
        )

    if rechtsfolge.ermessensart:
        inserts.append(
            _insert(
                "ermessensart",
                _new_id(),
                {
                    "rechtsfolge_id": rechtsfolge_id,
                    "art": rechtsfolge.ermessensart,
                },
            )
        )

    if rechtsfolge.verweise:
        inserts.extend(
            _map_verweise(
                rechtsfolge_id,
                "rechtsfolge",
                rechtsfolge.verweise.explizit,
                rechtsfolge.verweise.implizit,
            )
        )

    return inserts


def _map_atomares_tbm(satz_id: str, atomares_tbm: AtomaresTBM) -> list[dict[str, Any]]:
    inserts = []
    tbm_id = _new_id()

    inserts.append(
        _insert(
            "atomares_tbm",
            tbm_id,
            {
                "satz_id": satz_id,
                "text": atomares_tbm.text,
                "prueffrage": atomares_tbm.prueffrage,
                "pruefgegenstand": atomares_tbm.pruefgegenstand,
            },
        )
    )

    inserts.extend(_map_technische_normen(tbm_id, atomares_tbm.verweise.explizit))
    inserts.extend(_map_bestimmte_rechtsbegriffe(tbm_id, atomares_tbm.rechtsbegriffe.bestimmte_rechtsbegriffe))
    inserts.extend(_map_unbestimmte_rechtsbegriffe(tbm_id, atomares_tbm.rechtsbegriffe.unbestimmte_rechtsbegriffe))
    inserts.extend(
        _map_verweise(
            tbm_id,
            "atomares_tbm",
            atomares_tbm.verweise.explizit,
            atomares_tbm.verweise.implizit,
        )
    )

    return inserts


def _map_satz(absatz_id: str, satz: RechtsmethodikWorkflowSatzOutput, position: int) -> list[dict[str, Any]]:
    inserts = []
    satz_id = _new_id()

    inserts.append(
        _insert(
            "satz",
            satz_id,
            {
                "absatz_id": absatz_id,
                "satz_nr": satz.satz_nr,
                "position": position,
                "markers": satz.markers or [],
                "text": satz.satz_text,
                "norm_typ_lvl_1": satz.norm_typ_lvl_1,
                "norm_typ_lvl_2": satz.norm_typ_lvl_2,
                "tatbestandsmerkmale": satz.tatbestandsmerkmale or [],
                "formel": satz.formel,
            },
        )
    )

    if satz.rechtsfolge:
        inserts.extend(_map_rechtsfolge(satz_id, satz.rechtsfolge))

    if satz.atomare_tatbestandsmerkmale:
        for atbm in satz.atomare_tatbestandsmerkmale:
            inserts.extend(_map_atomares_tbm(satz_id, atbm))

    return inserts


def _map_absatz(
    norm_id: str,
    absatz: Absatz[RechtsmethodikWorkflowSatzOutput],
    existing_absatz_id: str | None,
    existing_satz_keys: set[tuple[str, str, tuple[str, ...]]],
) -> list[dict[str, Any]]:
    inserts: list[dict[str, Any]] = []

    if existing_absatz_id is not None:
        absatz_id = existing_absatz_id
    else:
        absatz_id = _new_id()
        inserts.append(
            _insert(
                "absatz",
                absatz_id,
                {
                    "norm_id": norm_id,
                    "absatz_nr": absatz.absatz_nr,
                    "text": absatz.absatz_text,
                },
            )
        )

    for position, satz in enumerate(absatz.saetze):
        if _satz_key(absatz_id, satz) in existing_satz_keys:
            continue
        inserts.extend(_map_satz(absatz_id, satz, position))

    return inserts


def map_rechtsmethodik_result_grouped(
    project_id: UUID,
    norm_result: RechtsmethodikWorkflowOutput,
    existing_gesetz_id: UUID | None = None,
    existing_norm_id: UUID | None = None,
    existing_absatz_ids_by_nr: dict[str, str] | None = None,
    existing_satz_keys: set[tuple[str, str, tuple[str, ...]]] | None = None,
    gesetz_frontend_parent_ids: list[str] | None = None,
    norm_frontend_parent_ids: list[str] | None = None,
) -> tuple[list[dict[str, Any]], list[list[dict[str, Any]]], str, str]:
    """Map a rechtsmethodik result into grouped inserts.

    Returns ``(header_inserts, absatz_batches, gesetz_id, norm_id)``:
    - ``header_inserts``: gesetz (if new) + standangaben + norm (if new).
    - ``absatz_batches``: one list per absatz, independently postable.
    - ``gesetz_id`` / ``norm_id``: resolved IDs (existing or freshly generated).
    """
    header: list[dict[str, Any]] = []
    existing_satz_keys = existing_satz_keys or set()

    if existing_gesetz_id is not None:
        gesetz_id = str(existing_gesetz_id)
    else:
        gesetz_id = _new_id()
        gesetz_payload: dict[str, Any] = {
            "name": norm_result.gesetz,
            "jurabk": norm_result.jurabk,
        }
        if gesetz_frontend_parent_ids:
            gesetz_payload["frontend_parent_ids"] = gesetz_frontend_parent_ids
        header.append(_insert("gesetz", gesetz_id, gesetz_payload))

    if norm_result.standangaben and existing_gesetz_id is None:
        header.extend(_map_standangaben(gesetz_id, norm_result.standangaben))

    if existing_norm_id is not None:
        norm_id = str(existing_norm_id)
    else:
        norm_id = _new_id()
        norm_payload: dict[str, Any] = {
            "gesetz_id": gesetz_id,
            "paragraph_nr": norm_result.paragraph_nr,
            "paragraph_titel": norm_result.paragraph_titel,
            "text": norm_result.paragraph_text,
            "regelungsgegenstand": norm_result.regelungsgegenstand,
        }
        if norm_frontend_parent_ids:
            norm_payload["frontend_parent_ids"] = norm_frontend_parent_ids
        header.append(_insert("norm", norm_id, norm_payload))

    absatz_batches: list[list[dict[str, Any]]] = []
    for absatz in norm_result.absaetze:
        existing_absatz_id = existing_absatz_ids_by_nr.get(absatz.absatz_nr) if existing_absatz_ids_by_nr else None
        batch = _map_absatz(norm_id, absatz, existing_absatz_id, existing_satz_keys)
        if batch:
            absatz_batches.append(batch)

    return header, absatz_batches, gesetz_id, norm_id


def map_rechtsmethodik_result(
    project_id: UUID,
    norm_result: RechtsmethodikWorkflowOutput,
    existing_gesetz_id: UUID | None = None,
    existing_norm_id: UUID | None = None,
    existing_absatz_ids_by_nr: dict[str, str] | None = None,
    existing_satz_keys: set[tuple[str, str, tuple[str, ...]]] | None = None,
    gesetz_frontend_parent_ids: list[str] | None = None,
    norm_frontend_parent_ids: list[str] | None = None,
) -> tuple[list[dict[str, Any]], str, str]:
    """Flat version of :func:`map_rechtsmethodik_result_grouped`.

    Returns ``(inserts, gesetz_id, norm_id)``.
    """
    header, absatz_batches, gesetz_id, norm_id = map_rechtsmethodik_result_grouped(
        project_id=project_id,
        norm_result=norm_result,
        existing_gesetz_id=existing_gesetz_id,
        existing_norm_id=existing_norm_id,
        existing_absatz_ids_by_nr=existing_absatz_ids_by_nr,
        existing_satz_keys=existing_satz_keys,
        gesetz_frontend_parent_ids=gesetz_frontend_parent_ids,
        norm_frontend_parent_ids=norm_frontend_parent_ids,
    )
    flat: list[dict[str, Any]] = list(header)
    for batch in absatz_batches:
        flat.extend(batch)
    return flat, gesetz_id, norm_id
