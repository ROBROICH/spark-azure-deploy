"""tests for gesetze-normen-db interactions"""

import json

import pytest
from db_services_shared.constants import Hierarchy
from db_services_shared.utils.gesetze_normen import GesetzeNormenDB
from httpx import HTTPError, Response
from pydantic import HttpUrl

GN_URL = HttpUrl("http://gesetze-normen.test/")


def test_gn_not_found(respx_mock):
    """should return None when no relevant Law is found"""
    respx_mock.get(f"{GN_URL}documents/search/Nonexistant").mock(
        return_value=Response(404)
    )
    gn_client = GesetzeNormenDB(GN_URL)
    gn_client.find_jurabk("Nonexistant", Hierarchy.BUND)


def test_gn_raise_for_status(respx_mock):
    """should raise exception for failing statuses other than 404"""
    respx_mock.get(f"{GN_URL}documents/search/Nonexistant").mock(
        return_value=Response(500)
    )
    gn_client = GesetzeNormenDB(GN_URL)
    with pytest.raises(HTTPError):
        gn_client.find_jurabk("Nonexistant", Hierarchy.BUND)


def test_gn_wrong_hierarchy(respx_mock):
    """should"""
    content = [
        {
            "hierarchy": "EU",
            "bundesland": None,
            "jurabk": "TG",
            "kurzue": "Testgesetz",
            "langue": "Testgesetz",
        },
        {
            "hierarchy": "Bundesland",
            "bundesland": None,
            "jurabk": "TG",
            "kurzue": "Testgesetz",
            "langue": "Testgesetz",
        },
    ]
    respx_mock.get(f"{GN_URL}documents/search/TestGesetz").mock(
        return_value=Response(200, content=json.dumps(content))
    )

    gn_client = GesetzeNormenDB(GN_URL)
    with pytest.raises(StopIteration):
        gn_client.find_jurabk("TestGesetz", Hierarchy.BUND)
