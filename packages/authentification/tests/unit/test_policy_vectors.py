import json
from pathlib import Path
from typing import Any

import pytest
from authentification.enums import AuthMode, Permission, Relation, Resource, Subject
from authentification.exceptions import InvalidTokenError
from authentification.machine_identity import (
    is_allowed_machine_identity,
    machine_identity_from_xfcc,
)
from authentification.models import OidcUserInfo
from authentification.verifier import KeycloakVerifier

POLICY_VECTORS_PATH = Path(__file__).parents[1] / "fixtures" / "auth_policy_vectors.json"
SUBJECT_ID = "00000000-0000-0000-0000-000000000042"


@pytest.fixture(scope="module")
def policy_vectors() -> dict[str, Any]:
    return json.loads(POLICY_VECTORS_PATH.read_text())


@pytest.mark.parametrize("vector_index", range(9))
def test_auth_mode_decisions(policy_vectors: dict[str, Any], vector_index: int, monkeypatch: pytest.MonkeyPatch) -> None:
    vector = policy_vectors["mode_decisions"][vector_index]
    outcome = vector["verification_outcome"]
    verifier = KeycloakVerifier(
        base_url="https://identity.invalid",
        realm="oidc-test",
        audience="oidc-test-client",
        auth_mode=AuthMode(vector["mode"]),
    )
    payload = {
        "sub": SUBJECT_ID,
        "realm_access": {"roles": ["user"]},
    }

    def verified(_credential: str) -> dict[str, object]:
        if outcome == "must_not_run":
            pytest.fail("credential verification must not run for this vector")
        if outcome in {"verified", "inactive_identity"}:
            return {**payload, "enabled": outcome != "inactive_identity"}
        raise InvalidTokenError("verification failed")

    def unverified(_credential: str) -> dict[str, object]:
        if outcome == "unverified_claims":
            return payload
        raise InvalidTokenError("credentials are not readable")

    monkeypatch.setattr(verifier, "_decode_verified", verified)
    monkeypatch.setattr(verifier, "_decode_unverified", unverified)
    credential = "opaque-test-token" if vector["credential_state"] == "present" else None

    if "expected_error" in vector:
        with pytest.raises(InvalidTokenError, match=vector["expected_error"]):
            verifier.resolve_user(credential)
        return

    resolution = verifier.resolve_user(credential)

    assert resolution.status == vector["expected_status"]
    assert (resolution.user is not None) is vector["expected_identity"]


@pytest.mark.parametrize("vector_index", range(5))
def test_claim_and_primary_role_decisions(policy_vectors: dict[str, Any], vector_index: int) -> None:
    vector = policy_vectors["claim_decisions"][vector_index]

    user = OidcUserInfo.from_payload(
        {
            "sub": SUBJECT_ID,
            "realm_access": {"roles": vector["roles"]},
        }
    )

    assert user.realm_roles == vector["expected_roles"]
    assert user.role == vector["expected_primary_role"]


def test_typed_policy_vocabulary_is_closed_and_readable(policy_vectors: dict[str, Any]) -> None:
    assert [item.value for item in Permission] == policy_vectors["permission_vocabulary"]
    assert [item.value for item in Resource] == policy_vectors["resource_vocabulary"]
    assert [item.value for item in Subject] == policy_vectors["subject_vocabulary"]
    assert [item.value for item in Relation] == policy_vectors["relation_vocabulary"]


@pytest.mark.parametrize("vector_index", range(7))
def test_machine_identity_decisions(policy_vectors: dict[str, Any], vector_index: int) -> None:
    vector = policy_vectors["machine_decisions"][vector_index]

    identity = machine_identity_from_xfcc(vector["xfcc"])

    assert (identity.spiffe if identity else None) == vector["expected_spiffe"]
    assert (identity is not None and is_allowed_machine_identity(identity, vector["allowlist"])) is vector[
        "expected_allowed"
    ]
