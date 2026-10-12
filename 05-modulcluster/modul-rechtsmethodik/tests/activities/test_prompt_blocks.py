import importlib
import re
import string
from pathlib import Path

import pytest
from prompt_injection.prompt_defense import EXT_DATA_TAG_CLOSE, EXT_DATA_TAG_OPEN, render_prompt_format

from src.activities.prompt_blocks import (
    JSON_FORMAT_INSTRUCTION,
    JSON_FORMAT_REMINDER,
    closing_block,
    external_data_block,
    format_section,
)

_MODULE_ROOT = Path(__file__).resolve().parents[2]
_MIN_TEMPLATE_COUNT = 30
_TAG_FIELDS = {"external_data_tag_open", "external_data_tag_close"}


def _prompt_templates() -> list[tuple[str, str]]:
    templates: list[tuple[str, str]] = []
    for path in sorted((_MODULE_ROOT / "src").rglob("*_prompt.py")):
        module_name = ".".join(path.relative_to(_MODULE_ROOT).with_suffix("").parts)
        module = importlib.import_module(module_name)
        templates.extend(
            (f"{module_name}.{name}", value)
            for name, value in vars(module).items()
            if not name.startswith("_") and isinstance(value, str)
        )
    return templates


_TEMPLATES = _prompt_templates()


def _fields(template: str) -> set[str]:
    return {field for _, field, _, _ in string.Formatter().parse(template) if field} - _TAG_FIELDS


class TestClosingBlock:
    def test_external_data_block_encloses_lines(self) -> None:
        assert external_data_block("a: {a}", "", "b: {b}") == (
            "{external_data_tag_open}\na: {a}\n\nb: {b}\n{external_data_tag_close}"
        )

    def test_format_section_default(self) -> None:
        assert format_section() == f"**Formatierung**\n{JSON_FORMAT_INSTRUCTION} {JSON_FORMAT_REMINDER}\n"

    def test_format_section_with_rules_and_constraint(self) -> None:
        assert format_section(format_rules="Regel.", output_constraint="Nur Schlüssel `x`.") == (
            f"**Formatierung**\nRegel.\n{JSON_FORMAT_INSTRUCTION} Nur Schlüssel `x`. {JSON_FORMAT_REMINDER}\n"
        )

    def test_closing_block_layout(self) -> None:
        assert closing_block("{a}", notes="Hinweis") == (
            f"{{external_data_tag_open}}\n{{a}}\n{{external_data_tag_close}}\n\nHinweis\n\n{format_section()}"
        )

    def test_closing_block_renders_data_marking(self) -> None:
        rendered = render_prompt_format(closing_block("Satz: {satz_text}"), satz_text="Text")
        assert rendered.startswith(f"{EXT_DATA_TAG_OPEN}\nSatz: Text\n{EXT_DATA_TAG_CLOSE}\n\n**Formatierung**\n")


def test_all_prompt_templates_are_discovered() -> None:
    assert len(_TEMPLATES) >= _MIN_TEMPLATE_COUNT


@pytest.mark.parametrize(("name", "template"), _TEMPLATES, ids=[name for name, _ in _TEMPLATES])
def test_prompt_template_uses_shared_closing_block(name: str, template: str) -> None:
    fields = _fields(template)
    assert fields, f"{name} has no inputs"
    rendered = render_prompt_format(template, **{field: f"WERT_{field}" for field in fields})

    marked_spans = re.findall(f"{re.escape(EXT_DATA_TAG_OPEN)}(.*?){re.escape(EXT_DATA_TAG_CLOSE)}", rendered, re.S)
    assert rendered.count(EXT_DATA_TAG_OPEN) == rendered.count(EXT_DATA_TAG_CLOSE) == len(marked_spans)
    unmarked = re.sub(f"{re.escape(EXT_DATA_TAG_OPEN)}.*?{re.escape(EXT_DATA_TAG_CLOSE)}", "", rendered, flags=re.S)
    for field in fields:
        assert f"WERT_{field}" in marked_spans[-1], f"{name}: input {field} is missing in the closing data block"
        assert f"WERT_{field}" not in unmarked, f"{name}: input {field} appears outside the data marking"

    end = rendered.rindex(EXT_DATA_TAG_CLOSE)
    assert "\n\n**Formatierung**\n" in rendered[end:]
    assert JSON_FORMAT_INSTRUCTION in rendered[end:]
    assert JSON_FORMAT_REMINDER in rendered[end:]
