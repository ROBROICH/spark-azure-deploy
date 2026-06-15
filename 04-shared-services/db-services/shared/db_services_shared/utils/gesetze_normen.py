
"""utility class for interacting with the gesetze-normen-db"""

from db_services_shared.constants import BundeslandParam, Hierarchy

import httpx
from internal_auth import internal_api_key_headers
from pydantic import BaseModel, HttpUrl

from cachetools import TTLCache, cachedmethod


class GNDoc(BaseModel):
    """metadata subset of a law document from gesetze-normen-db"""

    hierarchy: Hierarchy
    bundesland: BundeslandParam | None
    jurabk: str
    kurzue: str
    langue: str


class Norm(BaseModel):
    """a norm affected by a norm change"""

    jurabk: str
    paragraph_nr: str
    paragraph_text: str


class GesetzeNormenDB:
    """gesetze-normen-db client"""

    client: httpx.Client
    all_documents: list[GNDoc] = []
    # short cache TTL (in seconds), only used for
    # repeated calls within the same workflow
    ttl: int

    def __init__(self, gn_url: HttpUrl, ttl: int = 300) -> None:
        """initialise class"""
        self.client = httpx.Client(
            base_url=gn_url.encoded_string(),
            headers=internal_api_key_headers(),
        )
        self.ttl = ttl
        self._all_docs_cache = TTLCache(maxsize=1, ttl=self.ttl)
        self._single_doc_cache = TTLCache(maxsize=100, ttl=self.ttl)
        self._jurabk_cache = TTLCache(maxsize=100, ttl=self.ttl)
        self._norm_cache = TTLCache(maxsize=100, ttl=self.ttl)

    @cachedmethod(lambda self: self._all_docs_cache)
    def _refresh_all_docs(self) -> list[GNDoc]:
        """refresh the cached list of all document metadata in the db"""
        all_docs_response = self.client.get("documents/")
        all_docs_response.raise_for_status()
        self.all_documents = [GNDoc(**doc) for doc in all_docs_response.json()]
        return self.all_documents

    def get_all_docs(self, hierarchy: Hierarchy, bundesland: BundeslandParam | None = None) -> list[GNDoc]:
        """get jurabk, kurzue and langue for a particular hierarchy (and optionally bundesland)"""
        self._refresh_all_docs()
        return [
            doc
            for doc in self.all_documents
            if doc.hierarchy == hierarchy
            and doc.bundesland == bundesland
        ]

    @cachedmethod(lambda self: self._single_doc_cache)
    def get_doc(self, jurabk: str, hierarchy: Hierarchy = Hierarchy.BUND) -> GNDoc | None:
        """find jurabk, kurzue and langue given a jurabk"""
        response = self.client.get(f"documents/{jurabk}")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        json_response = response.json()

        return GNDoc(**json_response)

    @cachedmethod(lambda self: self._jurabk_cache)
    def find_jurabk(self, search_term: str, hierarchy: Hierarchy) -> str | None:
        """tries to find an entry for parsed law text title"""
        response = self.client.get(f"documents/search/{search_term}")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        json_response = response.json()
        if len(json_response) > 1:
            result = filter(
                lambda x: x["hierarchy"] == hierarchy, json_response
            ).__next__()
            return GNDoc(**result).jurabk
        elif json_response != []:
            return GNDoc(**json_response[0]).jurabk
        else:
            return None


    @cachedmethod(lambda self: self._norm_cache)
    def get_norm_text(self, jurabk: str, paragraph_nr: str) -> str | None:
        """get the current text of a norm given its jurabk"""
        response = self.client.get(f"norms/{jurabk}/{paragraph_nr}")
        if response.status_code == 404:
            return None
        response.raise_for_status()
        return Norm(**response.json()).paragraph_text
