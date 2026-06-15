"""Modules for downloading and parsing laws.

Parsers are discovered dynamically: every concrete ``BaseProcessor`` subclass
found in a subpackage of this package is registered automatically. Adding or
removing a parser therefore requires no changes to this file.
"""

import importlib
import inspect
import pkgutil

from db_pipelines.parsers.base_processor import BaseProcessor

# subpackages/modules that do not contain parsers
_EXCLUDE = {"base_processor", "utils"}


def _discover_parsers() -> dict[str, type[BaseProcessor]]:
    """Import every parser subpackage and collect concrete BaseProcessor subclasses."""
    parsers: dict[str, type[BaseProcessor]] = {}
    for module_info in pkgutil.iter_modules(__path__):
        if module_info.name in _EXCLUDE:
            continue
        module = importlib.import_module(f"{__name__}.{module_info.name}")
        for _, obj in inspect.getmembers(module, inspect.isclass):
            if (
                issubclass(obj, BaseProcessor)
                and obj is not BaseProcessor
                and not inspect.isabstract(obj)
            ):
                parsers[obj.__name__] = obj
    return parsers


parser_map: dict[str, type[BaseProcessor]] = _discover_parsers()

# expose discovered parsers as module attributes (e.g. `parsers.XmlProcessor1`)
globals().update(parser_map)

__all__ = [*parser_map, "parser_map"]
