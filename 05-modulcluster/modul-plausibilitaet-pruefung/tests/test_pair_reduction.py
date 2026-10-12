"""Tests for the project-wide reduction of symmetric claim pairs."""

from src.workflows.check_logic_wf.pair_reduction import reduce_pairs_project_wide
from src.workflows.check_logic_wf.schemas.risk_screener_schemas import (
    DocumentBundleResult,
    ScreeningCandidateBundle,
)


def _bundle(document_id: str, claim_id: str, references: list[str]) -> ScreeningCandidateBundle:
    return ScreeningCandidateBundle(
        project_id="proj-1",
        document_id=document_id,
        chunk_id=f"chunk-{claim_id}",
        claim_id=claim_id,
        reference_claims=references,
    )


def _references(result: DocumentBundleResult) -> dict[str, list[str]]:
    return {bundle.claim_id: bundle.reference_claims for bundle in result.bundles}


class TestScreeningPairs:
    def test_reverse_pair_across_documents_is_kept_once(self) -> None:
        """The defect: document 1 retrieved (A, B) and document 2 retrieved (B, A)."""
        doc_1 = DocumentBundleResult(bundles=[_bundle("doc-1", "claim-a", ["claim-b"])])
        doc_2 = DocumentBundleResult(bundles=[_bundle("doc-2", "claim-b", ["claim-a"])])

        first, second = reduce_pairs_project_wide([doc_1, doc_2])

        assert _references(first) == {"claim-a": ["claim-b"]}
        assert _references(second) == {"claim-b": []}

    def test_pair_only_one_document_retrieved_survives(self) -> None:
        """KNN is top-k and asymmetric: a pair the other side never saw must not be dropped."""
        doc_1 = DocumentBundleResult(bundles=[_bundle("doc-1", "claim-a", ["claim-c"])])
        doc_2 = DocumentBundleResult(bundles=[_bundle("doc-2", "claim-b", ["claim-a"])])

        first, second = reduce_pairs_project_wide([doc_1, doc_2])

        assert _references(first) == {"claim-a": ["claim-c"]}
        assert _references(second) == {"claim-b": ["claim-a"]}

    def test_owner_is_the_first_document_in_the_given_order(self) -> None:
        doc_1 = DocumentBundleResult(bundles=[_bundle("doc-1", "claim-a", ["claim-b"])])
        doc_2 = DocumentBundleResult(bundles=[_bundle("doc-2", "claim-b", ["claim-a"])])

        second, first = reduce_pairs_project_wide([doc_2, doc_1])

        assert _references(second) == {"claim-b": ["claim-a"]}
        assert _references(first) == {"claim-a": []}

    def test_reverse_pair_inside_one_document_still_collapses(self) -> None:
        document = DocumentBundleResult(
            bundles=[
                _bundle("doc-1", "claim-a", ["claim-b"]),
                _bundle("doc-1", "claim-b", ["claim-a"]),
            ]
        )

        (reduced,) = reduce_pairs_project_wide([document])

        assert _references(reduced) == {"claim-a": ["claim-b"], "claim-b": []}

    def test_distinct_pairs_are_untouched(self) -> None:
        doc_1 = DocumentBundleResult(bundles=[_bundle("doc-1", "claim-a", ["claim-b", "claim-c"])])
        doc_2 = DocumentBundleResult(bundles=[_bundle("doc-2", "claim-d", ["claim-b", "claim-e"])])

        first, second = reduce_pairs_project_wide([doc_1, doc_2])

        assert _references(first) == {"claim-a": ["claim-b", "claim-c"]}
        assert _references(second) == {"claim-d": ["claim-b", "claim-e"]}

    def test_duplicate_reference_inside_one_bundle_is_kept_once(self) -> None:
        document = DocumentBundleResult(bundles=[_bundle("doc-1", "claim-a", ["claim-b", "claim-b"])])

        (reduced,) = reduce_pairs_project_wide([document])

        assert _references(reduced) == {"claim-a": ["claim-b"]}

    def test_empty_input_returns_empty(self) -> None:
        assert reduce_pairs_project_wide([]) == []


class TestOverflowPairs:
    def test_reverse_overflow_pair_across_documents_is_kept_once(self) -> None:
        doc_1 = DocumentBundleResult(bundles=[], overflow_pairs=[("claim-a", "claim-b")])
        doc_2 = DocumentBundleResult(bundles=[], overflow_pairs=[("claim-b", "claim-a"), ("claim-b", "claim-c")])

        first, second = reduce_pairs_project_wide([doc_1, doc_2])

        assert first.overflow_pairs == [("claim-a", "claim-b")]
        assert second.overflow_pairs == [("claim-b", "claim-c")]

    def test_screening_and_overflow_pairs_are_tracked_separately(self) -> None:
        """The copied-sentence test above the cosine window is a different check of the same pair."""
        document = DocumentBundleResult(
            bundles=[_bundle("doc-1", "claim-a", ["claim-b"])],
            overflow_pairs=[("claim-a", "claim-b")],
        )

        (reduced,) = reduce_pairs_project_wide([document])

        assert _references(reduced) == {"claim-a": ["claim-b"]}
        assert reduced.overflow_pairs == [("claim-a", "claim-b")]


class TestResultShape:
    def test_order_and_unrelated_fields_are_preserved(self) -> None:
        doc_1 = DocumentBundleResult(bundles=[_bundle("doc-1", "claim-a", ["claim-b"])], verweis_bundles=2)
        doc_2 = DocumentBundleResult(bundles=[_bundle("doc-2", "claim-b", ["claim-a"])], verweis_bundles=3)

        reduced = reduce_pairs_project_wide([doc_1, doc_2])

        assert [result.verweis_bundles for result in reduced] == [2, 3]
        assert [bundle.document_id for result in reduced for bundle in result.bundles] == ["doc-1", "doc-2"]

    def test_input_is_not_mutated(self) -> None:
        doc_1 = DocumentBundleResult(bundles=[_bundle("doc-1", "claim-a", ["claim-b"])])
        doc_2 = DocumentBundleResult(
            bundles=[_bundle("doc-2", "claim-b", ["claim-a"])],
            overflow_pairs=[("claim-b", "claim-a")],
        )

        reduce_pairs_project_wide([doc_1, doc_2])

        assert _references(doc_2) == {"claim-b": ["claim-a"]}
        assert doc_2.overflow_pairs == [("claim-b", "claim-a")]
