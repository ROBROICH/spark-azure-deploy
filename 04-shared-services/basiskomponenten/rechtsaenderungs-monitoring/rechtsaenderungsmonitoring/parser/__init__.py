"""parser classes for various sources"""

from .base import RSSParser, Entry
from .bgbl import BGBLParser
from .bayern import BayParser

from db_services_shared.constants import Bundesland

__all__ = [
    Entry,
    RSSParser,
    BGBLParser,
    # EUParser,
]


def get_parser(bundesland: Bundesland) -> RSSParser:
    """return a valid parser for a given name string"""
    state_parser_map = {Bundesland.BY: BayParser}

    if bundesland not in state_parser_map.keys():
        raise ValueError(f"could not find {bundesland} in {state_parser_map.keys()}")
    else:
        return state_parser_map[bundesland]
