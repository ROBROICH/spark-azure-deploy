"""test config setup"""

import os

from db_pipelines.config import PipelineConfig, Settings


def test_env_aliases():
    """test configs from env var"""
    os.environ["DB_USER"] = "test"
    os.environ["DB_HOST"] = "test.test"

    # init config because it's already called in conftest
    config = Settings()
    assert config.db.user == "test"
    assert config.db.host == "test.test"


def test_pipeline_config_from_file():
    """tets if pipeline config entries are populated from json file"""
    pipeline_config: PipelineConfig = PipelineConfig(json_location="tests/data/nonexistant_laws.json")

    assert "foo" in pipeline_config.relevant_laws.bund.gesetz
    assert "bar" in pipeline_config.relevant_laws.bund.verordnung
