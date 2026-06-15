"""shared utils"""

import logging
import re

logger = logging.getLogger(__name__)


def split_paragraph_nr_str(paragraph_nr: str) -> tuple[int | float, str]:
    """helper function to create a sort key for paragraph_nr"""
    # split numeric and alphabetic parts
    match = re.match(r"^(\d+)\s?([a-zA-Z]*)$", paragraph_nr.strip())

    if match:
        numeric_part = int(match.group(1))
        alpha_part = match.group(2).strip() if match.group(2) is not None else None
        return (numeric_part, alpha_part)
    else:
        # Handle edge cases - treat as string
        logger.warning(f"could not split paragraph_nr {paragraph_nr}")
        return (float("inf"), paragraph_nr.strip())
