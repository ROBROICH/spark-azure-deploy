from datetime import datetime, UTC
from anyascii import anyascii
from pathlib import Path
from typing import Any, override
import json

from pydantic import BaseModel
from event_logging.enums import (
    EventAction,
    EventCategory,
    EventOutcome,
    LogEventDefault,
)

from begruendungen_db.schemas.db import (
    Document,
    Fundstelle,
    Vorgangsbezug,
    AutorenAnzeige,
    Urheber,
    Drucksachetyp,
    Herausgeber,
    FullText,
    Chunk,
)
from begruendungen_db.parsers.base import BaseProcessor, SkippedDocumentException

from db_services_shared.utils.gesetze_normen import GNDoc
from authentification.client_credentials import ClientCredentialsTokenProvider
from db_services_shared.utils.docling import pdf_to_doc, load_cached_doc, DoclingConfig, DoclingException, docling_auth
from begruendungen_db.chunking import process_chunks, vectorise_chunks
import httpx
from httpx import HTTPError


def _load_cached_chunks(cache_path: Path) -> list[Chunk] | None:
    """read the json embeddings cache, legacy or broken caches count as a miss"""
    if not cache_path.exists():
        return None
    try:
        return [Chunk(**c) for c in json.loads(cache_path.read_text(encoding="utf-8"))]
    except (ValueError, TypeError):
        return None


class DocumentMeta(BaseModel):
    id: str
    drucksachetyp: str
    pdf_url: str | None = None


class DIPDruckProcessor(BaseProcessor):
    """Processor for parsing drucksache documents from the DIP API"""
    BASEURL = "https://search.dip.bundestag.de/api/v1/"
    ENDPOINT_TEXT = "drucksache-text/"
    ENDPOINT_DATA = "drucksache"
    HEADERS = {"accept": "application/json"}
    api_key: str
    docling_config: DoclingConfig
    docling_auth: ClientCredentialsTokenProvider | None

    def __init__(self, base_path: Path, **kwargs: Any) -> None:
        super().__init__(self.BASEURL, base_path, **kwargs)
        api_key: str | None = kwargs.get("api_key")
        if not api_key:
            raise ValueError(
                "API key for dip.bundestag.de is required to fetch data."
                + "see https://dip.bundestag.de/%C3%BCber-dip/hilfe/api"
            )
        self.api_key = api_key
        kwargs.pop("api_key")

        if "docling" not in kwargs:
            raise ValueError("Docling configuration is required to process documents")
        self.docling_config = DoclingConfig(**kwargs["docling"])
        self.docling_auth = docling_auth(self.docling_config)
        kwargs.pop("docling")


    @classmethod
    @override
    def doc_meta_from_dict(cls, d: dict[str, Any]) -> DocumentMeta:
        return DocumentMeta(**d)

    def _get_drucksache_results(self, payload: dict[str, Any]) -> dict[str, Any]:
        """
        get all search results for drucksache docs (including next pages).
        next page exists if request["cursor"] != response["cursor"],
        initial request contains no cursor

        for API-Key see https://dip.bundestag.de/%C3%BCber-dip/hilfe/api
        """
        # Load available documents
        # Endpoint limited to 100 documents
        api_path = self.BASEURL + self.ENDPOINT_DATA
        payload["apikey"] = self.api_key
        try:
            response = httpx.get(api_path, headers=self.HEADERS, params=payload)
            response.raise_for_status()
        except HTTPError as e:
            # self.logger.error("Could not fetch data from API")
            # self.logger.error(e)
            raise e

        # Sanity check
        data = json.loads(response.text)
        if data["numFound"] == 0:
            raise ValueError("Data could not be retrieved")

        if data["numFound"] > 100:
            cursor = None
            _data = data.copy()
            while cursor != _data["cursor"]:
                try:
                    cursor = _data["cursor"]
                    payload["cursor"] = cursor
                    response = httpx.get(api_path, headers=self.HEADERS, params=payload)
                    response.raise_for_status()
                    _data = json.loads(response.text)
                    data["documents"] += _data["documents"]
                except HTTPError as e:
                    # self.logger.error(
                    #     f"Could not fetch data from API for cursor: {cursor}\n{_data}"
                    # )
                    raise e

        # cleanup
        del data["cursor"]

        return data

    def _fetch_docs(self, gn_doc: GNDoc, **kwargs: Any) -> list[DocumentMeta]:
        """Fetches relevant docs for a given Law"""
        payload = {
            "f.titel": [gn_doc.jurabk, gn_doc.kurzue, gn_doc.langue], 
            "format": "json"
        }
    
        types = [
            "Gesetzentwurf",
            "Gesetzesantrag",
            "Gesetzesbeschluss",
        ]
        data = {"numFound": 0, "documents": []}
        for drucksachetyp in types:
            payload["f.drucksachetyp"] = drucksachetyp
            try:
                _data = self._get_drucksache_results(payload)
                data["numFound"] += _data["numFound"]
                data["documents"] += _data["documents"]
            except ValueError:
                self.logger.warn(
                    action=EventAction.DOWNLOAD,
                    outcome=EventOutcome.UNKNOWN,
                    category=EventCategory.API,
                    default_event=LogEventDefault.DATA_IMPORT,
                    message=f"no docs for {drucksachetyp}"
                )

        return [
            DocumentMeta(
                id=d["id"], 
                drucksachetyp=d["drucksachetyp"],
                pdf_url=d["fundstelle"]["pdf_url"] if "fundstelle" in d and "pdf_url" in d["fundstelle"] else None
                ) 
            for d in data["documents"]
            ]

    def _fetch_doc(self, jurabk: str, document_meta: DocumentMeta) -> Path:
        """
        fetch a single document (json and pdf) by id and return path to json file
        """
        if document_meta.pdf_url is None:
            self.logger.warn(
                action=EventAction.DOWNLOAD,
                outcome=EventOutcome.UNKNOWN,
                category=EventCategory.API,
                default_event=LogEventDefault.DATA_IMPORT,
                message=f"no pdf available for document {jurabk} - {document_meta.id}"
            )
            raise SkippedDocumentException(f"no pdf available for document {jurabk} - {document_meta.id}")

        target_dir = Path(f"{self.base_path}/{jurabk}")
        payload = {
            "format": "json"
        }
        payload["apikey"] = self.api_key
        api_path = self.BASEURL + self.ENDPOINT_TEXT + document_meta.id
        try:
            payload["f.drucksachetyp"] = document_meta.drucksachetyp
            response = httpx.get(api_path, headers=self.HEADERS, params=payload)
            response.raise_for_status()
            doc = json.loads(response.text)
        except HTTPError as e:
            self.logger.error(
                action=EventAction.DOWNLOAD,
                outcome=EventOutcome.UNKNOWN,
                category=EventCategory.API,
                default_event=LogEventDefault.DATA_IMPORT,
                message=f"Could not fetch data from API (doc_id: {document_meta.id})"
                )
            raise e 

        response = httpx.get(doc["fundstelle"]["pdf_url"])
        if response.status_code == 404:
            raise SkippedDocumentException(f"pdf not found for document {jurabk} - {document_meta.id}")
        else:
            response.raise_for_status()
        pdf_path = target_dir.joinpath(f"{jurabk}_{document_meta.id}.pdf")
        with open(pdf_path, "wb") as f:
            f.write(response.content)

        output_path = pdf_path.with_suffix(".json")
        with open(output_path, "w") as f:
            json.dump(doc, f, sort_keys=True, indent=2)
    
        return output_path

    def _get_paths(self, jurabk: str) -> list[Any]:
        """returns a list of parseable Documents to pass to `_parse_doc`"""
        return [d for d in (self.base_path / jurabk).glob("**/*.json") if d.is_file()]

    def parse_doc(self, jurabk: str, filename: Path) -> Document:
        """parses data fetched from dip.bundestag.de

        Arguments:
            law_identifier: jurabk
            doc: Data that is to be parsed

        Returns:
            Document: Document object to be written to the Database
        """
        doc = json.loads(filename.read_text())
        opt_args = {}

        if "fundstelle" in doc.keys():
            opt_args["fundstelle"] = Fundstelle(
                id=doc["fundstelle"]["id"],
                dokumentart=doc["fundstelle"]["dokumentart"],
                dokumentnummer=doc["fundstelle"]["dokumentnummer"],
                datum=datetime.strptime(doc["fundstelle"]["datum"], "%Y-%m-%d").date(),
                herausgeber=Herausgeber(doc["fundstelle"]["herausgeber"]),
                urheber=doc["fundstelle"].get("urheber", None),
                pdf_url=doc["fundstelle"].get("pdf_url", None),
                drucksachetyp=doc["fundstelle"].get("drucksachetyp", None),
            )

        if "urheber" in doc.keys():
            opt_args["urheber"] = []
            for urheber in doc["urheber"]:
                opt_args["urheber"].append(
                    Urheber(
                        bezeichnung=anyascii(urheber["bezeichnung"]),
                        rolle=urheber.get("rolle", "undefiniert"),
                        titel=anyascii(urheber["titel"]),
                        einbringer=urheber.get("einbringer", False),
                    )
                )

        if "vorgangsbezug" in doc.keys():
            opt_args["vorgangsbezug"] = []
            for vorgangsbezug in doc["vorgangsbezug"]:
                opt_args["vorgangsbezug"].append(
                    Vorgangsbezug(
                        vb_id=vorgangsbezug["id"],
                        titel=anyascii(vorgangsbezug["titel"]),
                        vorgangstyp=[
                            anyascii(typ.strip())
                            for typ in vorgangsbezug["vorgangstyp"].split(",")
                        ],
                    )
                )

        if "autoren_anzeige" in doc.keys():
            opt_args["autoren_anzeige"] = []
            for autor in doc["autoren_anzeige"]:
                opt_args["autoren_anzeige"].append(
                    AutorenAnzeige(
                        autor_titel=autor["autor_titel"],
                        id=autor["id"],
                        titel=autor["titel"],
                    )
                )

        if opt_args["fundstelle"].pdf_url is not None:
            pdf_path: Path = filename.with_suffix(".pdf")
            if pdf_path.with_suffix(".docling").exists():
                # self.logger.debug("loading cached docling document")
                docling_doc = load_cached_doc(pdf_path.with_suffix(".docling"))
            else:
                try:
                    docling_doc = pdf_to_doc(pdf_path, self.docling_config, self.docling_auth)
                except DoclingException as e:
                    # self.logger.warning(f"could not convert pdf {pdf_path}: {e}")
                    raise e
            text = docling_doc.export_to_markdown()
            if text is None or text.strip() == "":
                # self.logger.warning(f"could not extract text from {pdf_path}")
                raise SkippedDocumentException(f"could not extract text from {pdf_path}")

            # self.logger.debug("processing chunks")
            embeddings_cache_path = pdf_path.with_suffix(".embeddings")
            chunks = _load_cached_chunks(embeddings_cache_path)
            if chunks is None:
                raw_chunks = process_chunks(docling_doc, doc["dokumentnummer"])
                # self.logger.debug("vectorising chunks")
                chunks = vectorise_chunks(raw_chunks, jurabk)
                embeddings_cache_path.write_text(
                    json.dumps([c.model_dump() for c in chunks], ensure_ascii=False), encoding="utf-8"
                )
            opt_args["chunks"] = chunks

        optional_arguments = ["vorgangsbezug_anzahl", "wahlperiode", "pdf_hash"]

        for o_arg in optional_arguments:
            if o_arg in doc.keys():
                opt_args[o_arg] = doc[o_arg]

        document = Document(
            jurabk=jurabk,
            # force timezone-naive datetime objects by converting to UTC
            aktualisiert=datetime.fromisoformat(doc["aktualisiert"]).astimezone(UTC).replace(tzinfo=None),
            autoren_anzahl=doc["autoren_anzahl"],
            datum=datetime.strptime(doc["datum"], "%Y-%m-%d").date(),
            doknr=int(doc["id"]),
            dokumentart=doc["dokumentart"],
            dokumentnummer=doc["dokumentnummer"],
            drucksachetyp=Drucksachetyp(doc["drucksachetyp"]),
            herausgeber=doc["herausgeber"],
            titel=anyascii(doc["titel"]),
            typ=doc["typ"],
            text=FullText(
                doknr=int(doc["id"]),
                text=text
            ),
            **opt_args,
        )

        return document
