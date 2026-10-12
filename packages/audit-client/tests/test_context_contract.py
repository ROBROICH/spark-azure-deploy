from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from audit_client.changes import build_audit_change, build_audit_changes
from audit_client.context import (
    audit_context_from_identity,
    audit_context_scope,
    audit_identity_context,
    parse_audit_headers,
    resolve_audit_context,
)
from audit_client.forwarding import audit_headers
from audit_client.middleware import audit_context_kwargs
from audit_client.workflow import workflow_propagation_values
from authentification.models import OidcUserInfo
from starlette.requests import Request

FIXTURE = json.loads((Path(__file__).parents[1] / "fixtures" / "audit-context-vectors.json").read_text())


@pytest.mark.parametrize(
    "case", [*FIXTURE["validHeaders"], *FIXTURE["malformedHeaders"]], ids=lambda case: case["name"]
)
def test_shared_header_vectors(case: dict[str, Any]) -> None:
    assert audit_headers(parse_audit_headers(case["headers"])) == case["expected"]


def test_shared_precedence_vector() -> None:
    case = FIXTURE["precedence"]
    resolved = resolve_audit_context(
        explicit=parse_audit_headers(case["explicit"]),
        active=parse_audit_headers(case["active"]),
        forwarded=parse_audit_headers(case["forwarded"]),
    )

    assert audit_headers(resolved) == case["expected"]


def test_normalized_auth_identity_is_the_only_attribution_input() -> None:
    case = FIXTURE["identity"]
    sentinel = "private-material-must-not-flow"
    identity = OidcUserInfo.from_payload({**case, "access_token": sentinel, "private_claim": sentinel})

    propagated = audit_headers(audit_context_from_identity(identity))
    assert propagated == case["expected"]
    assert sentinel not in json.dumps(propagated)


def test_workflow_adapter_exposes_the_same_validated_values() -> None:
    case = FIXTURE["validHeaders"][0]

    assert workflow_propagation_values(parse_audit_headers(case["headers"])) == case["expected"]


def test_normalized_identity_is_active_and_wins_over_forwarded_actor() -> None:
    forwarded = parse_audit_headers(FIXTURE["precedence"]["forwarded"])
    identity = OidcUserInfo.from_payload(FIXTURE["identity"])
    request = Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [],
            "query_string": b"",
        }
    )
    request.state.audit_context = forwarded

    with audit_context_scope(forwarded=forwarded), audit_identity_context(identity):
        resolved = audit_context_kwargs(request)

    assert str(resolved["actor_user_id"]) == identity.sub
    assert resolved["triggered_by_user_id"] == forwarded.triggered_by_user_id


@pytest.mark.parametrize("case", FIXTURE["changes"])
def test_shared_change_vectors(case: dict[str, Any]) -> None:
    assert build_audit_change(case["input"]).to_dict() == case["expected"]


@pytest.mark.parametrize("case", FIXTURE["invalidChanges"], ids=lambda case: case["name"])
def test_invalid_changes_fail_before_persistence(case: dict[str, Any]) -> None:
    with pytest.raises(ValueError):
        build_audit_change(case["input"])


def test_empty_and_non_empty_bulk_construction() -> None:
    bulk = FIXTURE["bulk"]

    assert build_audit_changes(bulk["empty"]) == ()
    assert [change.to_dict() for change in build_audit_changes(bulk["nonEmpty"])] == bulk["nonEmpty"]
