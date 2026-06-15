"""tests for gesetze-normen-db interactions"""

import pytest
from httpx import Response, HTTPError
from rechtsaenderungsmonitoring.gesetze_normen import GesetzeNormenDB
from rechtsaenderungsmonitoring.config import app_config


def test_gn_not_found(respx_mock):
    """should return None when no relevant Law is found"""
    respx_mock.get(f"{app_config.gesetze_normen_url}norms/search/Nonexistant").mock(
        return_value=Response(404)
    )
    gn_client = GesetzeNormenDB()
    gn_client.find_jurabk("Nonexistant", "Bund")


def test_gn_raise_for_status(respx_mock):
    """should raise exception for failing statuses other than 404"""
    respx_mock.get(f"{app_config.gesetze_normen_url}norms/search/Nonexistant").mock(
        return_value=Response(500)
    )
    gn_client = GesetzeNormenDB()
    with pytest.raises(HTTPError):
        gn_client.find_jurabk("Nonexistant", "Bund")


def test_gn_wrong_hierarchy(respx_mock):
    """should"""
    content = [
        {
            "hierarchy": "EU",
            "jurabk": "TG",
        },
        {
            "hierarchy": "Bundesland",
            "jurabk": "TG",
        },
    ]
    import json

    respx_mock.get(f"{app_config.gesetze_normen_url}norms/search/TestGesetz").mock(
        return_value=Response(200, content=json.dumps(content))
    )

    gn_client = GesetzeNormenDB()
    with pytest.raises(StopIteration):
        gn_client.find_jurabk("TestGesetz", "Bund")
