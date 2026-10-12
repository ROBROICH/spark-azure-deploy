from authentification.enums import AuthMode
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
        "realm_access": {"roles": ["admin", "editor"]},
    }
    info = OidcUserInfo.from_payload(payload)
    assert info.sub == "00000000-00000000-00000000-00000000"
    assert info.preferred_username == "bob"


def test_auth_mode(verifier, monkeypatch):
    before = verifier.auth_mode
    verifier.auth_mode = AuthMode.STRICT
    payload = {
        "sub": "00000000-00000000-00000000-00000000",
        "preferred_username": "bob",
        "realm_access": {"roles": ["admin", "editor"]},
    }
    monkeypatch.setattr(verifier, "_decode_verified", lambda x: payload)
    monkeypatch.setattr(verifier, "_decode_unverified", lambda x: payload)

    user_info = verifier.resolve_user("fake-token").user
    assert user_info.sub == "00000000-00000000-00000000-00000000"

    verifier.auth_mode = AuthMode.OPTIONAL_VERIFY_DRY_RUN
    user_info = verifier.resolve_user("fake-token").user
    assert user_info.sub == "00000000-00000000-00000000-00000000"

    verifier.auth_mode = AuthMode.DISABLED
    assert verifier.resolve_user("fake-token").user is None
    verifier.auth_mode = before


def test_optional_verify_dry_run_falls_back_to_unverified(verifier, monkeypatch):
    payload = {
        "sub": "00000000-00000000-00000000-00000000",
        "preferred_username": "bob",
        "realm_access": {"roles": ["admin", "editor"]},
    }
    verifier.auth_mode = AuthMode.OPTIONAL_VERIFY_DRY_RUN

    def raise_invalid(_token):
        raise InvalidTokenError("bad signature")

    monkeypatch.setattr(verifier, "_decode_verified", raise_invalid)
    monkeypatch.setattr(verifier, "_decode_unverified", lambda _token: payload)

    resolution = verifier.resolve_user("fake-token")

    assert resolution.user is not None
    assert resolution.user.sub == "00000000-00000000-00000000-00000000"
    assert resolution.status == "invalid_fallback_unverified"


def test_optional_verify_dry_run_allows_missing_token(verifier):
    verifier.auth_mode = AuthMode.OPTIONAL_VERIFY_DRY_RUN

    resolution = verifier.resolve_user(None)

    assert resolution.user is None
    assert resolution.status == "missing"
