from authentification.machine_identity import (
    MachineIdentity,
    extract_spiffe_uri_from_xfcc,
    is_allowed_machine_identity,
    machine_identity_from_headers,
    machine_identity_from_xfcc,
    parse_allowed_machine_identities,
)
from starlette.datastructures import Headers


def test_machine_identity_from_sanitized_xfcc():
    xfcc = (
        "By=spiffe://cluster.local/ns/xfcc-test/sa/httpbin;Hash=abc123;URI=spiffe://cluster.local/ns/xfcc-test/sa/sleep"
    )

    assert machine_identity_from_xfcc(xfcc) == MachineIdentity(
        spiffe="spiffe://cluster.local/ns/xfcc-test/sa/sleep",
        trust_domain="cluster.local",
        namespace="xfcc-test",
        service_account="sleep",
    )


def test_machine_identity_from_headers_accepts_case_insensitive_header_names():
    xfcc = "URI=spiffe://cluster.local/ns/backend/sa/caller"

    assert machine_identity_from_headers({}) is None
    assert machine_identity_from_headers({"X-Forwarded-Client-Cert": xfcc}) == MachineIdentity(
        spiffe="spiffe://cluster.local/ns/backend/sa/caller",
        trust_domain="cluster.local",
        namespace="backend",
        service_account="caller",
    )
    assert machine_identity_from_headers(Headers({"X-Forwarded-Client-Cert": xfcc})) == MachineIdentity(
        spiffe="spiffe://cluster.local/ns/backend/sa/caller",
        trust_domain="cluster.local",
        namespace="backend",
        service_account="caller",
    )


def test_extract_spiffe_uri_from_xfcc_accepts_quoted_uri():
    xfcc = 'Hash=abc123;URI="spiffe://cluster.local/ns/jobs/sa/runner"'

    assert extract_spiffe_uri_from_xfcc(xfcc) == "spiffe://cluster.local/ns/jobs/sa/runner"


def test_machine_identity_from_xfcc_ignores_uri_text_inside_quoted_values():
    xfcc = 'Subject="CN=caller;URI=spiffe://evil/ns/bad/sa/fake";URI=spiffe://cluster.local/ns/jobs/sa/runner'

    assert machine_identity_from_xfcc(xfcc) == MachineIdentity(
        spiffe="spiffe://cluster.local/ns/jobs/sa/runner",
        trust_domain="cluster.local",
        namespace="jobs",
        service_account="runner",
    )


def test_machine_identity_from_xfcc_rejects_missing_or_malformed_uri():
    assert machine_identity_from_xfcc(None) is None
    assert machine_identity_from_xfcc("") is None
    assert machine_identity_from_xfcc("Hash=abc123") is None
    assert machine_identity_from_xfcc("URI=https://example.test/ns/jobs/sa/runner") is None
    assert machine_identity_from_xfcc("URI=spiffe://cluster.local/ns/jobs") is None


def test_machine_identity_from_xfcc_rejects_ambiguous_uri_values():
    xfcc = (
        "URI=spiffe://evil/ns/bad/sa/fake,"
        "By=spiffe://cluster.local/ns/server/sa/api;"
        "URI=spiffe://cluster.local/ns/jobs/sa/runner"
    )

    assert machine_identity_from_xfcc(xfcc) is None


def test_is_allowed_machine_identity_uses_spiffe_allowlist_patterns():
    identity = MachineIdentity(
        spiffe="spiffe://cluster.local/ns/jobs/sa/runner",
        trust_domain="cluster.local",
        namespace="jobs",
        service_account="runner",
    )

    assert parse_allowed_machine_identities(" spiffe://cluster.local/ns/jobs/sa/runner , ") == frozenset(
        {"spiffe://cluster.local/ns/jobs/sa/runner"}
    )
    assert is_allowed_machine_identity(identity, "spiffe://cluster.local/ns/jobs/sa/runner")
    assert is_allowed_machine_identity(identity, "spiffe://cluster.local/ns/jobs/sa/*")
    assert not is_allowed_machine_identity(identity, "spiffe://cluster.local/ns/jobs/sa/other")
    assert not is_allowed_machine_identity(identity, "spiffe://cluster.local/ns/other/sa/*")
