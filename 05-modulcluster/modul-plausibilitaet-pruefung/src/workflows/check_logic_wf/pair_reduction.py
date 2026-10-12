"""Project-wide reduction of symmetric claim pairs.

Retrieval runs per document, so a cross-document pair can be found from both sides.
Every unordered pair gets exactly one owner: the first document, in orchestrator
order, that retrieved it. KNN is asymmetric, so a pair found by only one side stays
with that side. Pure and deterministic, safe in workflow code.
"""

from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    DocumentBundleResult,
    ScreeningCandidateBundle,
)


def reduce_pairs_project_wide(results: list[DocumentBundleResult]) -> list[DocumentBundleResult]:
    """Strip from every result the claim pairs an earlier result already owns.

    Order is preserved; screening and overflow pairs are tracked separately because they are different checks.
    """
    screened: set[frozenset[str]] = set()
    overflowed: set[frozenset[str]] = set()
    reduced: list[DocumentBundleResult] = []

    for result in results:
        bundles = [_reduced_bundle(bundle, screened) for bundle in result.bundles]
        reduced.append(
            result.model_copy(
                update={
                    "bundles": bundles,
                    "overflow_pairs": _reduced_overflow_pairs(result.overflow_pairs, overflowed),
                }
            )
        )

    return reduced


def _reduced_bundle(bundle: ScreeningCandidateBundle, screened: set[frozenset[str]]) -> ScreeningCandidateBundle:
    """The bundle without the references whose pair is already owned."""
    kept: list[str] = []
    for reference_id in bundle.reference_claims:
        pair: frozenset[str] = frozenset({bundle.claim_id, reference_id})
        if pair in screened:
            continue
        screened.add(pair)
        kept.append(reference_id)
    return bundle.model_copy(update={"reference_claims": kept})


def _reduced_overflow_pairs(
    pairs: list[tuple[str, str]],
    overflowed: set[frozenset[str]],
) -> list[tuple[str, str]]:
    """The overflow pairs that are not owned yet, in their original order."""
    kept: list[tuple[str, str]] = []
    for claim_id, neighbour_id in pairs:
        pair: frozenset[str] = frozenset({claim_id, neighbour_id})
        if pair in overflowed:
            continue
        overflowed.add(pair)
        kept.append((claim_id, neighbour_id))
    return kept
