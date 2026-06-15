"""cli testing"""
import pytest

from jura_db.cli import app


@pytest.mark.skip("errors in ci only")
def test_cli_main(cli_client):
    """Test the main CLI command with a cached sample document name."""
    result = cli_client.invoke(
        app, ["main", "jb-TESTDOC0001"]
    )
    assert result.exit_code == 0
    assert "Document processing completed successfully" in result.output


def test_resolve_toc_path_exists(cli_client):
    """Test that the TOC is downloaded and cached correctly."""
    # Ensure the cache directory is set to a test path
    result = cli_client.invoke(app, ["download-toc"])
    assert result.exit_code == 0
    assert "TOC downloaded successfully" in result.output
