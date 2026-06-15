"""Unit tests for URL validation utilities."""

import pytest

from src.exceptions.exceptions import ValidationError
from src.utils.url_validator import is_domain_allowed, is_private_ip, validate_file_url


class TestIsPrivateIP:
    """Tests for private IP detection."""

    def test_localhost_string(self):
        """Test localhost detection."""
        assert is_private_ip("localhost") is True
        assert is_private_ip("localhost.localdomain") is True

    def test_loopback_ip(self):
        """Test loopback IP detection."""
        assert is_private_ip("127.0.0.1") is True
        assert is_private_ip("127.0.0.100") is True

    def test_private_ip_ranges(self):
        """Test RFC 1918 private IP ranges."""
        assert is_private_ip("10.0.0.1") is True
        assert is_private_ip("10.255.255.255") is True
        assert is_private_ip("172.16.0.1") is True
        assert is_private_ip("172.31.255.255") is True
        assert is_private_ip("192.168.0.1") is True
        assert is_private_ip("192.168.255.255") is True

    def test_link_local(self):
        """Test link-local IP detection."""
        assert is_private_ip("169.254.0.1") is True
        assert is_private_ip("169.254.255.255") is True

    def test_public_ip(self):
        """Test public IP addresses are not flagged."""
        assert is_private_ip("8.8.8.8") is False
        assert is_private_ip("1.1.1.1") is False
        assert is_private_ip("93.184.216.34") is False

    def test_internal_hostname_patterns(self):
        """Test internal hostname pattern detection."""
        assert is_private_ip("server.local") is True
        assert is_private_ip("app.internal") is True

    def test_public_hostname(self):
        """Test public hostnames are not flagged."""
        assert is_private_ip("example.com") is False
        assert is_private_ip("www.google.com") is False


class TestIsDomainAllowed:
    """Tests for domain allowlist checking."""

    def test_exact_match(self):
        """Test exact domain matching."""
        allowed = ["example.com", "test.org"]
        assert is_domain_allowed("example.com", allowed) is True
        assert is_domain_allowed("test.org", allowed) is True
        assert is_domain_allowed("other.com", allowed) is False

    def test_wildcard_subdomain(self):
        """Test wildcard subdomain matching (*.example.com)."""
        allowed = ["*.example.com"]
        assert is_domain_allowed("sub.example.com", allowed) is True
        assert is_domain_allowed("deep.sub.example.com", allowed) is True
        assert is_domain_allowed("example.com", allowed) is False  # Base domain not matched

    def test_wildcard_all_subdomains(self):
        """Test wildcard all subdomains matching (**.example.com)."""
        allowed = ["**.example.com"]
        assert is_domain_allowed("sub.example.com", allowed) is True
        assert is_domain_allowed("deep.sub.example.com", allowed) is True
        assert is_domain_allowed("example.com", allowed) is True  # Base domain matched

    def test_case_insensitive(self):
        """Test case-insensitive matching."""
        allowed = ["Example.COM"]
        assert is_domain_allowed("example.com", allowed) is True
        assert is_domain_allowed("EXAMPLE.COM", allowed) is True
        assert is_domain_allowed("Example.Com", allowed) is True

    def test_empty_allowlist(self):
        """Test empty allowlist rejects all domains."""
        assert is_domain_allowed("example.com", []) is False
        assert is_domain_allowed("any.domain.com", []) is False


class TestValidateFileURL:
    """Tests for complete URL validation."""

    def test_valid_https_url(self, monkeypatch):
        """Test valid HTTPS URL passes validation."""
        # Mock settings
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["example.com"])
        monkeypatch.setattr(settings_module.settings, "FPP_BLOCK_PRIVATE_IPS", True)

        url = "https://example.com/files/document.pdf"
        result = validate_file_url(url)
        assert result == url

    def test_http_url_rejected(self, monkeypatch):
        """Test HTTP URLs are rejected."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["example.com"])

        with pytest.raises(ValidationError, match="Only HTTPS URLs are allowed"):
            validate_file_url("http://example.com/file.pdf")

    def test_ftp_url_rejected(self, monkeypatch):
        """Test FTP URLs are rejected."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["example.com"])

        with pytest.raises(ValidationError, match="Only HTTPS URLs are allowed"):
            validate_file_url("ftp://example.com/file.pdf")

    def test_url_with_credentials_rejected(self, monkeypatch):
        """Test URLs with embedded credentials are rejected."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["example.com"])

        with pytest.raises(ValidationError, match="credentials are not allowed"):
            validate_file_url("https://user:pass@example.com/file.pdf")

    def test_private_ip_rejected(self, monkeypatch):
        """Test private IP addresses are rejected."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["192.168.1.1"])
        monkeypatch.setattr(settings_module.settings, "FPP_BLOCK_PRIVATE_IPS", True)

        with pytest.raises(ValidationError, match="Private/internal IP addresses are not allowed"):
            validate_file_url("https://192.168.1.1/file.pdf")

    def test_localhost_rejected(self, monkeypatch):
        """Test localhost is rejected."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["localhost"])
        monkeypatch.setattr(settings_module.settings, "FPP_BLOCK_PRIVATE_IPS", True)

        with pytest.raises(ValidationError, match="Private/internal IP addresses are not allowed"):
            validate_file_url("https://localhost/file.pdf")

    def test_domain_not_in_allowlist(self, monkeypatch):
        """Test domain not in allowlist is rejected."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["allowed.com"])
        monkeypatch.setattr(settings_module.settings, "FPP_BLOCK_PRIVATE_IPS", True)

        with pytest.raises(ValidationError, match="not in the allowlist"):
            validate_file_url("https://notallowed.com/file.pdf")

    def test_subdomain_with_wildcard(self, monkeypatch):
        """Test subdomain matching with wildcard."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["*.example.com"])
        monkeypatch.setattr(settings_module.settings, "FPP_BLOCK_PRIVATE_IPS", True)

        url = "https://files.example.com/document.pdf"
        result = validate_file_url(url)
        assert result == url

    def test_empty_allowlist_rejects_all(self, monkeypatch):
        """Test empty allowlist rejects all URLs."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", [])
        monkeypatch.setattr(settings_module.settings, "FPP_BLOCK_PRIVATE_IPS", True)

        with pytest.raises(ValidationError, match="not in the allowlist"):
            validate_file_url("https://example.com/file.pdf")

    def test_url_with_port(self, monkeypatch):
        """Test URL with port number."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["example.com"])
        monkeypatch.setattr(settings_module.settings, "FPP_BLOCK_PRIVATE_IPS", True)

        url = "https://example.com:8443/file.pdf"
        result = validate_file_url(url)
        assert result == url

    def test_url_with_query_params(self, monkeypatch):
        """Test URL with query parameters."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["example.com"])
        monkeypatch.setattr(settings_module.settings, "FPP_BLOCK_PRIVATE_IPS", True)

        url = "https://example.com/file.pdf?token=abc123&version=2"
        result = validate_file_url(url)
        assert result == url

    def test_invalid_url_format(self, monkeypatch):
        """Test invalid URL format is rejected."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["example.com"])

        with pytest.raises(ValidationError, match="Only HTTPS URLs are allowed"):
            validate_file_url("not-a-valid-url")

    def test_url_without_hostname(self, monkeypatch):
        """Test URL without hostname is rejected."""
        from src.config import settings as settings_module

        monkeypatch.setattr(settings_module.settings, "FPP_ALLOWED_DOMAINS", ["example.com"])

        with pytest.raises(ValidationError, match="must contain a valid hostname"):
            validate_file_url("https:///file.pdf")
