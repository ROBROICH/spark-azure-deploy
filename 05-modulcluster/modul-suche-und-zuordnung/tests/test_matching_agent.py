"""
Test MatchingWorkflow
"""

from typing import Any

import pytest

from src.tbm_matching.query_building import extract_definition


@pytest.fixture
def atomare_tbm() -> dict[str, Any]:
    return {
        "rechtsbegriffe": {
            "bestimmte_rechtsbegriffe": [
                {
                    "selected_definition": None,
                    "definitions": [{"definition": "wild lebende Tiere wild lebender Arten"}],
                }
            ]
        }
    }


def test_get_definition(atomare_tbm: dict[str, Any]) -> None:
    """Test the definition extraction"""
    definition = extract_definition(atomare_tbm)
    assert isinstance(definition, str)
