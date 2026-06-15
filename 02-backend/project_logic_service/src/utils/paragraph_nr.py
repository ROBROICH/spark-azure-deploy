"""Normalization helpers for ``TopicNorm.paragraph_nr`` values."""


def normalize_paragraph_nr(raw: str | None) -> str | None:
    """Return ``raw`` without a leading ``§`` symbol and surrounding whitespace.

    The canonical stored form is the bare number (optionally followed by a
    letter suffix or ``Abs.`` qualifier), e.g. ``"44"``, ``"44a"``, or
    ``"44 Abs. 1"``. Input variants like ``"§ 44"``, ``"§44"``, ``" § 44 "``
    are all collapsed to ``"44"``. Letter suffixes are preserved as given
    (``"§ 44a" -> "44a"``).
    """
    if not raw:
        return raw

    stripped = raw.strip()
    while stripped.startswith("\u00a7"):
        stripped = stripped[1:].lstrip()
    return stripped.strip()
