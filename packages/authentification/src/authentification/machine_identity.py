import re
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from fnmatch import fnmatchcase

XFCC_HEADER = "x-forwarded-client-cert"
_MIN_QUOTED_VALUE_LENGTH = 2

_SPIFFE_RE = re.compile(r"^spiffe://(?P<trust_domain>[^/]+)/ns/(?P<namespace>[^/]+)/sa/(?P<service_account>[^/]+)$")


@dataclass(frozen=True)
class MachineIdentity:
    spiffe: str
    trust_domain: str
    namespace: str
    service_account: str


def _split_unquoted(value: str, separator: str) -> list[str]:
    parts: list[str] = []
    start = 0
    in_quotes = False
    escaped = False

    for index, char in enumerate(value):
        if escaped:
            escaped = False
            continue
        if in_quotes and char == "\\":
            escaped = True
            continue
        if char == '"':
            in_quotes = not in_quotes
            continue
        if char == separator and not in_quotes:
            parts.append(value[start:index])
            start = index + 1

    parts.append(value[start:])
    return parts


def _unquote(value: str) -> str:
    stripped = value.strip()
    if len(stripped) >= _MIN_QUOTED_VALUE_LENGTH and stripped[0] == '"' and stripped[-1] == '"':
        return stripped[1:-1].replace(r"\\", "\\").replace(r"\"", '"')
    return stripped


def _iter_xfcc_pairs(xfcc: str) -> Iterator[tuple[str, str]]:
    for entry in _split_unquoted(xfcc, ","):
        for pair in _split_unquoted(entry, ";"):
            key, separator, value = pair.partition("=")
            if separator and key.strip():
                yield key.strip(), _unquote(value)


def extract_spiffe_uri_from_xfcc(xfcc: str) -> str | None:
    uri_values = [value for key, value in _iter_xfcc_pairs(xfcc) if key.lower() == "uri"]
    if len(uri_values) != 1:
        return None

    uri = uri_values[0]
    if not _SPIFFE_RE.match(uri):
        return None
    return uri


def machine_identity_from_xfcc(xfcc: str | None) -> MachineIdentity | None:
    if not xfcc:
        return None

    spiffe = extract_spiffe_uri_from_xfcc(xfcc)
    if spiffe is None:
        return None

    match = _SPIFFE_RE.match(spiffe)
    if match is None:
        return None

    return MachineIdentity(
        spiffe=spiffe,
        trust_domain=match.group("trust_domain"),
        namespace=match.group("namespace"),
        service_account=match.group("service_account"),
    )


def machine_identity_from_headers(headers: Mapping[str, str]) -> MachineIdentity | None:
    xfcc = headers.get(XFCC_HEADER) or headers.get("X-Forwarded-Client-Cert")
    if xfcc is None:
        for name, value in headers.items():
            if name.lower() == XFCC_HEADER:
                xfcc = value
                break

    return machine_identity_from_xfcc(xfcc)


def parse_allowed_machine_identities(value: str) -> frozenset[str]:
    return frozenset(identity.strip() for identity in value.split(",") if identity.strip())


def is_allowed_machine_identity(identity: MachineIdentity, allowed_identities: str) -> bool:
    return any(fnmatchcase(identity.spiffe, pattern) for pattern in parse_allowed_machine_identities(allowed_identities))
