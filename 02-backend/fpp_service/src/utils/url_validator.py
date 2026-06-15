"""URL validation utilities for secure file downloads."""

import ipaddress
import re
from urllib.parse import urlparse

from pydantic import HttpUrl

from src.config.settings import settings
from src.exceptions.exceptions import ValidationError


def is_private_ip(hostname: str) -> bool:
    """
    Check if hostname resolves to a private IP address.

    Blocks:
    - Private IP ranges (RFC 1918): 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
    - Loopback: 127.0.0.0/8
    - Link-local: 169.254.0.0/16
    - Localhost

    Args:
        hostname: Hostname or IP address to check

    Returns:
        True if hostname is a private/internal IP, False otherwise
    """
    # Check for localhost
    if hostname.lower() in ("localhost", "localhost.localdomain"):
        return True

    try:
        # Try to parse as IP address
        ip = ipaddress.ip_address(hostname)

        # Check if it's a private, loopback, or link-local address
        return ip.is_private or ip.is_loopback or ip.is_link_local
    except ValueError:
        # Not a valid IP address, could be a hostname
        # Check if it looks like an internal hostname pattern
        internal_patterns = [
            r"^localhost",
            r"\.local$",
            r"\.internal$",
            r"^10\.",
            r"^172\.(1[6-9]|2[0-9]|3[0-1])\.",
            r"^192\.168\.",
            r"^127\.",
            r"^169\.254\.",
        ]

        for pattern in internal_patterns:
            if re.search(pattern, hostname, re.IGNORECASE):
                return True

        return False


def is_domain_allowed(hostname: str, allowed_domains: list[str]) -> bool:
    """
    Check if hostname matches any domain in the allowlist.

    Supports:
    - Exact matches: "example.com"
    - Wildcard subdomains: "*.example.com" matches "sub.example.com" but not "example.com"
    - Wildcard all subdomains: "**.example.com" matches "sub.example.com" and "example.com"

    Args:
        hostname: Hostname to check
        allowed_domains: List of allowed domain patterns

    Returns:
        True if hostname matches allowlist, False otherwise
    """
    if not allowed_domains:
        # If no allowlist configured, reject all (fail-secure)
        return False

    hostname_lower = hostname.lower()

    for allowed in allowed_domains:
        allowed_lower = allowed.lower()

        # Exact match
        if hostname_lower == allowed_lower:
            return True

        # Wildcard subdomain match: *.example.com
        if allowed_lower.startswith("*."):
            base_domain = allowed_lower[2:]  # Remove "*."
            if hostname_lower.endswith(f".{base_domain}"):
                return True

        # Wildcard all subdomains match: **.example.com
        if allowed_lower.startswith("**."):
            base_domain = allowed_lower[3:]  # Remove "**."
            if hostname_lower == base_domain or hostname_lower.endswith(f".{base_domain}"):
                return True

    return False


def validate_file_url(url: str | HttpUrl) -> str:
    """
    Validate file URL for security compliance.

    Security checks:
    1. HTTPS only (no HTTP, FTP, file://, etc.)
    2. Block private/internal IP addresses
    3. Domain must be in allowlist
    4. No credentials in URL
    5. Valid URL structure

    Args:
        url: URL to validate (string or HttpUrl)

    Returns:
        Validated URL as string

    Raises:
        ValidationError: If URL fails any security check
    """
    # Convert HttpUrl to string if needed
    url_str = str(url)

    # Parse URL
    try:
        parsed = urlparse(url_str)
    except Exception as e:
        raise ValidationError(f"Invalid URL format: {e}") from e

    # 1. Enforce HTTPS only
    if parsed.scheme != "https":
        raise ValidationError(f"Only HTTPS URLs are allowed. Received scheme: {parsed.scheme}")

    # 2. Check for credentials in URL (security risk)
    if parsed.username or parsed.password:
        raise ValidationError(
            "URLs with embedded credentials are not allowed. Use proper authentication mechanisms instead."
        )

    # 3. Extract hostname
    hostname = parsed.hostname
    if not hostname:
        raise ValidationError("URL must contain a valid hostname")

    # 4. Block private IP addresses
    if settings.FPP_BLOCK_PRIVATE_IPS and is_private_ip(hostname):
        raise ValidationError(f"Private/internal IP addresses are not allowed: {hostname}")

    # 5. Check against allowlist
    if not is_domain_allowed(hostname, settings.FPP_ALLOWED_DOMAINS):
        raise ValidationError(
            f"Domain '{hostname}' is not in the allowlist. "
            f"Allowed domains: {', '.join(settings.FPP_ALLOWED_DOMAINS) if settings.FPP_ALLOWED_DOMAINS else 'none configured'}"
        )

    return url_str
