JSON_FORMAT_INSTRUCTION = (
    "Gib das Ergebnis ausschließlich im JSON-Format zurück. Es darf keine anderen Texte oder Erklärungen "
    "enthalten sein. Gib das JSON ohne Markdown-Code-Fences zurück (also ohne ``` oder ```json) - nur reines "
    "JSON-Objekt."
)
JSON_FORMAT_REMINDER = "Halte dich unbedingt an die Format-Anweisungen."


def external_data_block(*input_lines: str) -> str:
    return "\n".join(("{external_data_tag_open}", *input_lines, "{external_data_tag_close}"))


def format_section(*, format_rules: str | None = None, output_constraint: str | None = None) -> str:
    instruction = " ".join(part for part in (JSON_FORMAT_INSTRUCTION, output_constraint, JSON_FORMAT_REMINDER) if part)
    lines = ["**Formatierung**"]
    if format_rules:
        lines.append(format_rules)
    lines.append(instruction)
    return "\n".join(lines) + "\n"


def closing_block(
    *input_lines: str,
    notes: str | None = None,
    format_rules: str | None = None,
    output_constraint: str | None = None,
) -> str:
    parts = [external_data_block(*input_lines)]
    if notes:
        parts.append(notes)
    parts.append(format_section(format_rules=format_rules, output_constraint=output_constraint))
    return "\n\n".join(parts)
