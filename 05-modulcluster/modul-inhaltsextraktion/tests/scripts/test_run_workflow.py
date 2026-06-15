"""Unit tests for the run_workflow script."""

import json
import pytest
from uuid import uuid4

from run_workflow import load_topics_from_file

def test_load_topics_from_file_none():
    """Giving None as topics file should return None safely."""
    assert load_topics_from_file(None) is None

def test_load_topics_from_file_success(tmp_path):
    """Providing a valid topics file should successfully parse and return DocumentTopic list."""
    uid = str(uuid4())
    data = {
        "themen": [
            {"id": uid, "name": "Topic A"}
        ]
    }
    file_path = tmp_path / "topics.json"
    file_path.write_text(json.dumps(data))
    
    topics = load_topics_from_file(str(file_path))
    assert topics is not None
    assert len(topics) == 1
    assert str(topics[0].id) == uid
    assert topics[0].name == "Topic A"

def test_load_topics_from_file_missing():
    """Providing a non-existent file should exit with 1."""
    with pytest.raises(SystemExit) as exc:
        load_topics_from_file("this_file_does_not_exist_12345.json")
    assert exc.value.code == 1

def test_load_topics_from_file_missing_key(tmp_path):
    """Providing JSON without 'themen' key should exit."""
    data = {"wrong_key": []}
    file_path = tmp_path / "topics.json"
    file_path.write_text(json.dumps(data))
    
    with pytest.raises(SystemExit) as exc:
        load_topics_from_file(str(file_path))
    assert exc.value.code == 1

def test_load_topics_from_file_invalid_json(tmp_path):
    """Providing invalid JSON should exit."""
    file_path = tmp_path / "topics.json"
    file_path.write_text("invalid json format")
    
    with pytest.raises(SystemExit) as exc:
        load_topics_from_file(str(file_path))
    assert exc.value.code == 1
