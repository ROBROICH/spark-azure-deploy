"""bundesgesetzblatt parser tests"""

from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest
from httpx import HTTPError, Response
from rechtsaenderungsmonitoring.config import app_config
from rechtsaenderungsmonitoring.parser.base import Entry
from rechtsaenderungsmonitoring.parser.bgbl import BGBLParser
from rechtsaenderungsmonitoring.workflows.monitor_rechtsaenderungen.activities import _get_parser
from respx import MockRouter, Route
from temporal.contracts import Bundesland, RechtsaenderungenSource


@pytest.mark.usefixtures("respx_mock")
class TestBGBLParser:
    """BGBL Parser tests"""

    @pytest.fixture
    def mock_gn_client(self) -> MagicMock:
        """mock GesetzeNormenDB client - skips the real HTTP init"""
        return MagicMock()

    @pytest.fixture
    def mock_doc(self, respx_mock: MockRouter) -> Route:
        """mocked document (from local testdata)"""
        pdf_file_path = "tests/data/regelungstext.pdf"
        with open(pdf_file_path, "rb") as f:
            pdf_content = f.read()
        return respx_mock.get(f"https://recht.test/eli/bund/TGBl_1/2026/1/{BGBLParser.main_endpoint}").mock(
            return_value=Response(200, content=pdf_content)
        )

    @pytest.fixture
    def mock_gn_response(self, respx_mock: MockRouter) -> Route:
        """mocked response from gesetze-normen-db norms search"""
        content: list[dict[str, str | None]] = [
            {
                "doknr": "123",
                "doktyp": "verordnung",
                "hierarchy": "Bund",
                "builddate": "121212",
                "jurabk": "UTPV",
                "kurzue": "Unittestpflicht-Verordnung",
                "langue": "Verordnung zur Konkretisierung von Prüfpflichten zur Sicherstellung der Testabdeckung nach § 36 des Unittestaufsichtsgesetzes",
                "ausfertigung_datum": "2025-09-15",
                "fundstelle": "Bgbl. 1 2025",
                "eingangsformel": None,
            }
        ]
        return respx_mock.get(
            f"http://{app_config.gesetze_normen_url}/norms/search/Unittestpflicht-Verordnung%20%E2%80%93%20UTPV"
        ).mock(return_value=Response(200, json=content))

    @pytest.fixture
    def mock_doc_overview(self, respx_mock: MockRouter) -> Route:
        """mocked document overview response from gesetze-normen-db"""
        content: list[dict[str, str | None]] = [
            {
                "doknr": "123",
                "doktyp": "verordnung",
                "hierarchy": "Bund",
                "builddate": "121212",
                "jurabk": "UTPV",
                "kurzue": "Unittestpflicht-Verordnung",
                "langue": "Verordnung zur Konkretisierung von Prüfpflichten zur Sicherstellung der Testabdeckung nach § 36 des Unittestaufsichtsgesetzes",
                "ausfertigung_datum": "2025-09-15",
                "fundstelle": "Bgbl. 1 2025",
                "eingangsformel": None,
            }
        ]
        return respx_mock.get(f"http://{app_config.gesetze_normen_url}/documents/").mock(
            return_value=Response(200, json=content)
        )

    def test_fetch_feed(self, tmp_path: Path, mock_feed: Route, mock_gn_client: MagicMock) -> None:
        """test getting feed data to class var"""
        parser = BGBLParser(cache_dir=tmp_path, gesetze_normen_client=mock_gn_client)
        parser.get_entries()
        assert mock_feed.called
        assert len(parser._current_entries) > 0
        assert all(isinstance(x, Entry) for x in parser._current_entries)

    def test_get_data(self, tmp_path: Path, mock_feed: Route, mock_doc: Route, mock_gn_client: MagicMock) -> None:
        """test fetching data"""
        parser = BGBLParser(cache_dir=tmp_path, gesetze_normen_client=mock_gn_client)
        parser.get_entries()
        assert mock_feed.called
        assert len(parser._current_entries) > 0
        parser.get_data(parser._current_entries[0])
        # repeat to test the cached-file code path
        parser.get_data(parser._current_entries[0])
        assert mock_doc.called

    def test_fetch_data_failed(
        self, tmp_path: Path, mock_feed: Route, respx_mock: MockRouter, mock_gn_client: MagicMock
    ) -> None:
        """should raise an HTTPError if the server returns 5xx"""
        parser = BGBLParser(cache_dir=tmp_path, gesetze_normen_client=mock_gn_client)
        parser.get_entries()
        assert mock_feed.called
        entry = parser._current_entries[0]
        respx_mock.get(f"{entry.link}/{parser.main_endpoint}").mock(return_value=Response(500))
        with pytest.raises(HTTPError):
            parser.fetch_data(entry)

    def test_fetch_and_extract(
        self, tmp_path: Path, mock_feed: Route, mock_doc: Route, mock_gn_client: MagicMock
    ) -> None:
        """test downloading + extracting per-page text (LLM/persist split out)"""
        parser = BGBLParser(cache_dir=tmp_path, gesetze_normen_client=mock_gn_client)
        parser.get_entries()
        assert mock_feed.called
        pages = parser.fetch_and_extract(parser._current_entries[0])
        assert mock_doc.called
        assert all(isinstance(page_nr, int) and isinstance(text, str) for page_nr, text in pages)


def test_activity_parsers_use_configured_cache_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app_config, "cache_dir", tmp_path)

    with patch("rechtsaenderungsmonitoring.parser.bgbl.GesetzeNormenDB"):
        bund_parser = _get_parser(RechtsaenderungenSource.BUND)
    state_parser = _get_parser(RechtsaenderungenSource.BUNDESLAND, Bundesland.BY)

    assert bund_parser.cache_dir == tmp_path
    assert state_parser.cache_dir == tmp_path
