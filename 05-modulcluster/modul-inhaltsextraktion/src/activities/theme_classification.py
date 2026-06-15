""" Activities related to theme classification """

from prompt_injection.prompt_defense import render_prompt_format, wrap_system_prompt
from pydantic import BaseModel
from temporal.activities.llm import llm_invoke_structured

from src.env import ENV
from src.schemas import DocumentTopic
from src.workflows.theme_classification.output_format import _NAME_NO_THEME, ThemeClassificationOutput
from src.workflows.theme_classification.prompt import (
    _THEME_CLASSIFICATION_SYSTEM_PROMPT,
    _THEME_CLASSIFICATION_USER_TEMPLATE,
)


class ThemenListe(BaseModel):
    "A list of possible topics for a document. "
    topics : list[DocumentTopic]

class ThemeClassificationTaskInput(BaseModel):
    """ Input for the theme_classification_task activity. """
    theme_info : list[DocumentTopic] | None = None
    summary : str

class ThemeClassificationTaskOutput(BaseModel):
    """ Output for the theme_classification_task activity. """
    topic : DocumentTopic | None = None
    reasoning : str


async def theme_classification_task(theme_info : list[DocumentTopic] | None, summary : str) -> ThemeClassificationTaskOutput:
    return await _theme_classification_task(ThemeClassificationTaskInput(theme_info=theme_info, summary=summary))

def _sanitize_theme_selection(result : ThemeClassificationOutput, themes : list[DocumentTopic]) -> ThemeClassificationTaskOutput:
    """ Sanity test: verify that theme selected really exists in the list, correcting if possible. """
    selected_name: str = result.name
    lst_name_matches: list[DocumentTopic] = []
    topic_none_selected: DocumentTopic | None = None

    for possible_theme in themes:
        if possible_theme.name == selected_name:
            lst_name_matches.append(possible_theme)
        if possible_theme.name == _NAME_NO_THEME:
            topic_none_selected = possible_theme

    if len(lst_name_matches) == 1:
        # If there is only one match, all is good.
        safe_selection = ThemeClassificationTaskOutput(topic=lst_name_matches[0], reasoning=result.reasoning)
    elif len(lst_name_matches) == 0 and topic_none_selected is not None:
        # In case there was no exact match and there is an option for no theme selected, select "no theme."
        safe_selection = ThemeClassificationTaskOutput(topic=topic_none_selected,
                                                   reasoning=f"Document topic {selected_name} not found, selecting no theme.")
    else:
        # Otherwise there is something deeper wrong, and we will return None.
        safe_selection = ThemeClassificationTaskOutput(topic=None,
                                                   reasoning="ERROR in topic matching, going for Null topic.")
    return safe_selection

async def _theme_classification_task(input: ThemeClassificationTaskInput) -> ThemeClassificationTaskOutput:
    # Handle first edge cases.
    if input.theme_info is None:
        return ThemeClassificationTaskOutput(topic=None, reasoning="Null topic list provided, no topic selected.")
    if len(input.theme_info) == 0:
        return ThemeClassificationTaskOutput(topic=None, reasoning="Empty topic list provided, no topic selected.")
    if input.summary is None or len(input.summary) == 0:
        return ThemeClassificationTaskOutput(topic=None, reasoning="Empty or Null summary, no topic.")

    # There is enough information to try to select a topic.
    # Select the theme through LLM call.
    themes_json_str : str = ThemenListe(topics=input.theme_info).model_dump_json(indent=2)
    result : ThemeClassificationOutput = await llm_invoke_structured(
        render_prompt_format(_THEME_CLASSIFICATION_USER_TEMPLATE, themen_json=themes_json_str, summary=input.summary),
        wrap_system_prompt(_THEME_CLASSIFICATION_SYSTEM_PROMPT),
        ThemeClassificationOutput,
        model=ENV.SUMMARIZATION_MODEL_NAME,
        temperature=0.1,
    )

    # Correct selection if needed.
    safe_result : ThemeClassificationTaskOutput = _sanitize_theme_selection(result, input.theme_info)

    return safe_result
