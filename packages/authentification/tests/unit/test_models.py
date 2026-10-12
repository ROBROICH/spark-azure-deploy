import pytest
from authentification.exceptions import InvalidTokenError
from authentification.models import OidcUserInfo


def test_from_payload_minimal():
    payload = {"sub": "00000000-00000000-00000000-00000000"}
    info = OidcUserInfo.from_payload(payload)
    assert info.sub == "00000000-00000000-00000000-00000000"
    assert info.preferred_username is None


def test_from_payload_full():
    payload = {
        "sub": "00000000-00000000-00000000-00000000",
        "preferred_username": "bob",
        "realm_access": {"roles": ["admin"]},
    }
    info = OidcUserInfo.from_payload(payload)
    assert info.sub == "00000000-00000000-00000000-00000000"
    assert info.preferred_username == "bob"
    assert info.realm_roles == ["admin"]
    assert info.role == "admin"


def test_from_payload_prefers_admin_role():
    payload = {
        "sub": "00000000-00000000-00000000-00000000",
        "realm_access": {"roles": ["user", "admin"]},
    }
    info = OidcUserInfo.from_payload(payload)
    assert info.role == "admin"


def test_from_list_payload_reconciles_admin_api_user_list_shape():
    sub = "00000000-0000-0000-0000-000000000000"
    payload = [
        {
            "id": sub,
            "email": "bob@example.com",
            "username": "bob",
            "firstName": "Bob",
            "lastName": "Builder",
            "enabled": True,
            "realm_access": {"roles": ["user"]},
        }
    ]
    users = OidcUserInfo.from_list_payload(payload)
    assert len(users) == 1
    info = users[0]
    assert info.sub == sub
    assert info.email == "bob@example.com"
    assert info.name == "bob"
    assert info.given_name == "Bob"
    assert info.family_name == "Builder"
    assert info.enabled is True
    assert info.realm_roles == ["user"]
    assert info.role == "user"


_VALID_SUB = "00000000-0000-0000-0000-000000000000"


def test_from_payload_parses_email():
    payload = {"sub": _VALID_SUB, "email": "bob@example.com"}
    info = OidcUserInfo.from_payload(payload)
    assert info.email == "bob@example.com"


def test_from_payload_parses_name():
    payload = {"sub": _VALID_SUB, "name": "Bob Builder"}
    info = OidcUserInfo.from_payload(payload)
    assert info.name == "Bob Builder"


def test_from_payload_parses_given_and_family_name():
    payload = {"sub": _VALID_SUB, "given_name": "Bob", "family_name": "Builder"}
    info = OidcUserInfo.from_payload(payload)
    assert info.given_name == "Bob"
    assert info.family_name == "Builder"


def test_from_payload_identity_claims_default_to_none():
    payload = {"sub": _VALID_SUB}
    info = OidcUserInfo.from_payload(payload)
    assert info.email is None
    assert info.name is None
    assert info.given_name is None
    assert info.family_name is None


def test_from_payload_parses_disabled_user():
    payload = {"sub": _VALID_SUB, "enabled": False}

    info = OidcUserInfo.from_payload(payload)

    assert info.enabled is False


def test_from_payload_missing_sub_raises():
    with pytest.raises(InvalidTokenError):
        OidcUserInfo.from_payload({})
