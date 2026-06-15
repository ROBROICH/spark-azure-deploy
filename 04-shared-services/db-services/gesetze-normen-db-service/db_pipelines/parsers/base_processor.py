"""init base classes for processing state laws"""

import re
import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any
from pydantic import HttpUrl

from db_services_shared.utils.logging import get_logger
from event_logging import EventLogger
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)

from db_pipelines.config import app_config
from db_pipelines.constants import Bundesland
from db_pipelines.schemas.db import Hierarchy, DocType, Document
from db_pipelines.parsers.utils.jurabk import clean_jurabk

app_logger = get_logger(app_config.SERVICE_NAME)


class BaseProcessor(ABC):
    """
    Abstract class for implementation to
    process legal texts from public sources
    """

    slug: str
    doctype: DocType
    hierarchy: Hierarchy
    _base_path: Path
    logger: EventLogger

    target_dir: Path
    norm_dir: Path

    # injected from the pipeline config (NormSpec.base_url); never hardcoded
    base_url: str
    bundesland: Bundesland | None = None

    @abstractmethod
    def _get_doc(self) -> Any:
        """
        returns the Document to parse
        """
        raise NotImplementedError

    @abstractmethod
    def _fetch_doc(self):
        """
        fetches the document to local storage
        """
        raise NotImplementedError

    @abstractmethod
    def _parse_doc(self, doc: Any = None) -> Document:
        """
        Parses the given content and returns
        a Document object.

        Args:
            doc (Any): document object to parse
        """
        raise NotImplementedError

    @classmethod
    def parser_dirname(cls) -> str:
        """snake_case cache directory name, matching BaseProcessor.__init__"""
        return re.sub(r"(?<!^)(?=[A-Z\d])", "_", cls.__name__).lower()

    def __init__(
        self,
        slug: str,
        doctype: DocType,
        hierarchy: Hierarchy,
        base_url: HttpUrl | str,
        base_path: Path | str = app_config.cache_dir,
        bundesland: Bundesland | None = None,
        logger: EventLogger = app_logger,
        **kwargs: dict[str, Any],
    ) -> None:
        """processor initialisation"""
        self.slug = slug
        self.doctype = DocType(doctype)
        self.hierarchy = Hierarchy(hierarchy)
        if self.hierarchy == Hierarchy.BUNDESLAND and bundesland is None:
            raise ValueError("bundesland must be supplied for bundesland-level documents")
        if self.hierarchy == Hierarchy.KOMMUNE:
            raise NotImplementedError("kommune hierarchy is not yet supported")
        # base_url is supplied by the pipeline config; only fetching needs it,
        # so parse-only flows may leave it unset
        base_url_ = base_url.encoded_string() if isinstance(base_url, HttpUrl) else HttpUrl(base_url).encoded_string()
        self.base_url = base_url_.rstrip("/")

        self.logger = logger
        self._base_path = Path(base_path)
        parser_dirname = self.__class__.parser_dirname()
        self.target_dir = self._base_path / parser_dirname
        path = self.target_dir / self.hierarchy.name
        if bundesland is not None:
            self.bundesland = bundesland
            path = path / self.bundesland.name
        self.norm_dir = path / self.slug

    def fetch_doc(self, overwrite: bool = False) -> None:
        """
        Fetches a legal document from the source and writes to local storage.
        handles caching results (use `overwrite=True` to redownload)
        """
        if self.norm_dir.exists():
            if overwrite:
                shutil.rmtree(self.norm_dir)
                self.norm_dir.mkdir(parents=True, exist_ok=True)
            # if directory is not empty
            elif any(self.norm_dir.iterdir()):
                self.logger.warn(
                    action=EventAction.NOTIFY,
                    outcome=EventOutcome.UNKNOWN,
                    category=EventCategory.DATABASE,
                    default_event=LogEventDefault.GENERAL,
                    message=f"{self.norm_dir} exists, skipping download",
                )
                return self._get_doc()
        else:
            self.norm_dir.mkdir(parents=True, exist_ok=True)

        self._fetch_doc()

    def parse_doc(self, doc: Any | None = None, **kwargs) -> Document:
        """
        Parses a document and returns a Document object.
        fetches the document if not already present

        Returns:
            Document: Document-object to be written to the Database
        """
        self.fetch_doc(
            overwrite=kwargs["overwrite"] if "overwrite" in kwargs else False
        )
        return self._parse_doc(doc or self._get_doc())

    def suffixed_jurabk(
            self,
            jurabk: str,
            known_prefixes: list[str] | None = None,
            known_suffixes: str | None = None
        ) -> str:
        """Append legal suffix to make jurabk unique across states.

        Skips if the jurabk already contains the state identifier
        (e.g. "BayAbmG" contains "Bay", "LNatSchG RhPf" contains "RhPf").
        and fixes some common non-standard suffixes
        (e.g. "LJagdG M-V" -> "LJagdG MV", "JagdG HA" -> "JagdG Hmb").
        """
        if self.bundesland is None:
            raise ValueError("bundesland must be set for jurabk suffixing")
        return clean_jurabk(jurabk, self.bundesland, known_prefixes, known_suffixes)