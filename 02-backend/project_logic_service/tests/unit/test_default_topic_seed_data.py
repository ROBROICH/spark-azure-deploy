import pytest

from src.models.schemas.project_schemas import GermanState
from src.services.projects.default_topic_seed_data import (
    DEFAULT_PROJECT_TYPE_NAME,
    TopicEnum,
    get_default_topics_for_project_type_name,
)


@pytest.mark.parametrize(
    ("topic_name", "show_in_ewm", "show_in_beschluss"),
    (
        (TopicEnum.ZUSTAENDIGKEIT, False, True),
        (TopicEnum.VERFAHREN, False, True),
        (TopicEnum.SOFORTIGE_VOLLZIEHBARKEIT, False, True),
        (TopicEnum.KOSTENENTSCHEIDUNG, False, True),
        (TopicEnum.HOEHENPLAENE, True, False),
        (TopicEnum.REGELUNGSVERZEICHNIS, True, False),
        (TopicEnum.STRASSENQUERSCHNITT, True, False),
        (TopicEnum.LAGEPLAENE, True, False),
    ),
)
def test_default_topic_visibility_matches_fba_configuration(
    topic_name: TopicEnum,
    show_in_ewm: bool,
    show_in_beschluss: bool,
) -> None:
    topics = {
        topic.name: topic
        for topic in get_default_topics_for_project_type_name(
            project_type_name=DEFAULT_PROJECT_TYPE_NAME,
            state=GermanState.BY,
        )
    }

    topic = topics[topic_name]
    assert topic.show_in_ewm is show_in_ewm
    assert topic.show_in_beschluss is show_in_beschluss
