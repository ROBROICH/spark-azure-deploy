"""base class for processing documents"""

import shutil
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Any

from pydantic import BaseModel
from db_services_shared.utils.logging import get_logger
from event_logging import EventLogger
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)

from begruendungen_db.schemas.db import (
    Document
)

from db_services_shared.utils.gesetze_normen import GNDoc


class SkippedDocumentException(Exception):
    """
    Exception to raise when a document is actively
    skipped during processing (for Temporal status reporting)
    """
    pass



class BaseProcessor(ABC):
    """
    Abstract class for implementation to
    process legal texts from public sources
    """

    base_url: str
    base_path: Path
    logger: EventLogger

    def __init__(self, base_url: str, base_path: Path, logger: EventLogger | None = None, **kwargs: Any) -> None:
        self.base_url = base_url
        self.base_path = base_path / self.__class__.__name__
        self.logger = logger or get_logger("begruendungen.parsers.default")

    @classmethod
    @abstractmethod
    def doc_meta_from_dict(cls, d: dict[str, Any]) -> BaseModel:
        """Reconstruct a document-metadata object from its serialized dict form."""
        raise NotImplementedError

    @abstractmethod
    def _fetch_docs(self, gn_doc: GNDoc, **kwargs: Any) -> list[BaseModel]:
        """
        fetches a list of relevant documents to download, the output is
        passed to `_fetch_doc` to get the actual document content

        Returns:
            list[BaseModel]: List of document metadata to fetch
        """
        raise NotImplementedError

    def _fetch_doc(self, jurabk: str, document_meta: BaseModel) -> Path:
        """
        fetches a single document by id and returns a parse.
        Args:
            jurabk (str): jurabk of the law document
            document_meta (BaseModel): metadata to identify and fetch the document, output of `_fetch_docs`

        Returns:
            Path: Path to the parseable file
        """
        raise NotImplementedError

    @abstractmethod
    def parse_doc(self, jurabk: str, filename: Path) -> Document:
        """
        Parses the given content and returns
        a Document object.

        Args:
            jurabk (str): jurabk of the law document
            filename (Path): path to the file being parsed

        Returns:
            Document: Document-object to be written to the Database
        """
        raise NotImplementedError


    def fetch_docs(self, gn_doc: GNDoc, overwrite: bool = False, **kwargs: dict[str, Any]) -> list[BaseModel]:
        """
        Fetches relevant documents from the source for given `jurabk`.
        handles caching results (use `overwrite=True` to redownload)
        """
        norm_dir = self.base_path / gn_doc.jurabk
        if norm_dir.exists():
            if overwrite:
                shutil.rmtree(norm_dir)
                norm_dir.mkdir(parents=True, exist_ok=True)
            # if directory is not empty
            elif any(norm_dir.iterdir()):
                self.logger.warn(
                    action=EventAction.NOTIFY,
                    outcome=EventOutcome.UNKNOWN,
                    category=EventCategory.DATABASE,
                    default_event=LogEventDefault.GENERAL,
                    message=f"{norm_dir} exists, skipping download",
                )
        else:
            norm_dir.mkdir(parents=True, exist_ok=True)

        return self._fetch_docs(gn_doc, **kwargs)
