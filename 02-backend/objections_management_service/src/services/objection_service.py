"""Business logic for objection management."""

import csv
import io
import re
import uuid
from datetime import datetime
from pathlib import PurePosixPath, PureWindowsPath
from uuid import UUID
from zoneinfo import ZoneInfo

from audit_client import AuditEntry, audit_context_kwargs, record_audit_entries
from audit_client import record_audit_entry as _record_audit_entry
from audit_client.enums import ChangeType
from fastapi import Request
from sqlalchemy import and_, case, insert, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db_models import Argument, BeteiligungsEingang, BeteiligungsEingangMarkdown
from src.models.schemas.ewms_schemas import (
    ArgumentExtractionRequest,
    ArgumentExtractionResponse,
    ArgumentInsertResult,
    ClassificationFailedRequest,
    ClassificationFailedResponse,
    ClassificationRequest,
    ClassificationResponse,
    DocumentArguments,
    DocumentInsertResult,
    InjectionDetectedRequest,
    InjectionDetectedResponse,
    ProcessedFileIdsResponse,
)
from src.models.schemas.objection_schemas import (
    BeteiligungTyp,
    ClassificationStatus,
    ErwiderungImportResponse,
    ExtractionStatus,
    FileIdResponse,
)
from src.services.external_clients import (
    DocumentManagementClient,
    ProjectLogicClient,
    TopicMetadata,
)

ERWIDERUNGS_EXPORT_FILE_TYPE = "erwiderungs_export"
ERWIDERUNGS_IMPORT_FILE_TYPE = "erwiderungs_import"
_SOURCE_FILE_TYPES = ("ewms_document", "document")
ARGUMENT_BULK_INSERT_BATCH_SIZE = 5000
EXTRACTION_BULK_INSERT_BATCH_SIZE = 5000

CSV_COLUMNS = [
    "Argument-ID",
    "Thema",
    "Unterthema",
    "Argument",
    "Kontext",
    "Erwiderung",
    "Einordnung",
    "Datei",
]
CSV_DELIMITER = ";"
CSV_IMPORT_DELIMITERS = CSV_DELIMITER + ","
CSV_ENCODING = "utf-8-sig"
CSV_LINETERMINATOR = "\r\n"


async def export_arguments_to_dms(
    project_id: UUID,
    db: AsyncSession,
    dms_client: DocumentManagementClient | None = None,
    project_logic_client: ProjectLogicClient | None = None,
) -> FileIdResponse:
    project_logic_client = project_logic_client or ProjectLogicClient()
    csv_bytes = await build_erwiderung_export_csv(
        project_id=project_id,
        db=db,
        dms_client=dms_client,
        project_logic_client=project_logic_client,
    )
    date_prefix = datetime.now(ZoneInfo("Europe/Berlin")).strftime("%Y%m%d")
    project_name = re.sub(
        r'[<>:"/\\|?*\x00-\x1f]',
        "_",
        await project_logic_client.get_project_name(project_id),
    ).strip()
    project_name = project_name.rstrip(".") or "Verfahren"
    dms = dms_client or DocumentManagementClient()
    file_id = await dms.upload_internal_file(
        project_id=project_id,
        file_type=ERWIDERUNGS_EXPORT_FILE_TYPE,
        filename=f"{date_prefix}_Synopse_{project_name}.csv",
        content=csv_bytes,
    )
    return FileIdResponse(file_id=file_id)


async def build_erwiderung_export_csv(
    project_id: UUID,
    db: AsyncSession,
    dms_client: DocumentManagementClient | None = None,
    project_logic_client: ProjectLogicClient | None = None,
) -> bytes:
    project_logic = project_logic_client or ProjectLogicClient()
    project_version = await project_logic.get_latest_project_version(project_id)
    rows = await _load_export_rows(project_id=project_id, project_version=project_version, db=db)
    source_file_ids = {be_file_id for _, be_file_id in rows}

    dms = dms_client or DocumentManagementClient()
    filenames_by_file_id = await _fetch_filenames_by_file_id(
        project_id=project_id,
        project_version=project_version,
        source_file_ids=source_file_ids,
        dms_client=dms,
    )
    topics_by_id = await _fetch_topics_by_id(
        rows=rows,
        project_logic_client=project_logic,
    )

    return _serialize_export_csv(
        rows=rows,
        filenames_by_file_id=filenames_by_file_id,
        topics_by_id=topics_by_id,
    )


async def _load_export_rows(
    *,
    project_id: UUID,
    project_version: int,
    db: AsyncSession,
) -> list[tuple[Argument, UUID]]:
    stmt = (
        select(Argument, BeteiligungsEingang.file_id.label("be_file_id"))
        .join(
            BeteiligungsEingang,
            and_(
                Argument.beteiligungs_eingang_id == BeteiligungsEingang.id,
                Argument.project_version == BeteiligungsEingang.project_version,
            ),
        )
        .where(
            and_(
                Argument.project_id == project_id,
                Argument.project_version == project_version,
                Argument.is_deleted.is_(False),
                BeteiligungsEingang.project_id == project_id,
                BeteiligungsEingang.project_version == project_version,
                BeteiligungsEingang.is_deleted.is_(False),
            )
        )
        .order_by(Argument.argument_id.asc(), Argument.id.asc())
    )
    result = await db.execute(stmt)
    return [(arg, file_id) for arg, file_id in result.all()]


def _serialize_export_csv(
    *,
    rows: list[tuple[Argument, UUID]],
    filenames_by_file_id: dict[UUID, str],
    topics_by_id: dict[UUID, TopicMetadata],
) -> bytes:
    buf = io.StringIO()
    writer = csv.DictWriter(
        buf,
        fieldnames=CSV_COLUMNS,
        delimiter=CSV_DELIMITER,
        lineterminator=CSV_LINETERMINATOR,
    )
    writer.writeheader()

    for argument, be_file_id in rows:
        topic_name, subtopic_name = _resolve_topic_names(argument, topics_by_id)
        writer.writerow(
            {
                "Argument-ID": argument.argument_id or "",
                "Thema": topic_name,
                "Unterthema": subtopic_name,
                "Argument": argument.text or "",
                "Kontext": argument.context or "",
                "Erwiderung": argument.erwiderung or "",
                "Einordnung": argument.einordnung or "",
                "Datei": filenames_by_file_id.get(be_file_id, str(be_file_id)),
            }
        )

    return buf.getvalue().encode(CSV_ENCODING)


async def import_arguments_from_dms(
    project_id: UUID,
    file_id: UUID,
    db: AsyncSession,
    dms_client: DocumentManagementClient | None = None,
    project_logic_client: ProjectLogicClient | None = None,
    request: Request | None = None,
) -> ErwiderungImportResponse:
    project_logic = project_logic_client or ProjectLogicClient()
    project_version = await project_logic.get_latest_project_version(project_id)
    dms = dms_client or DocumentManagementClient()
    metadata = await dms.get_file(file_id, project_version=project_version)
    if metadata.project_id != project_id:
        raise ValueError("CSV file does not belong to this project")
    if metadata.type != ERWIDERUNGS_IMPORT_FILE_TYPE:
        raise ValueError("CSV file must have type 'erwiderungs_import'")

    content = await dms.download_file(file_id, project_version=metadata.project_version)
    result = await import_arguments_csv(
        project_id=project_id,
        project_version=metadata.project_version,
        file_content=content,
        db=db,
        project_logic_client=project_logic,
        request=request,
    )
    return ErwiderungImportResponse(**result)


async def import_arguments_csv(
    project_id: UUID,
    file_content: bytes,
    db: AsyncSession,
    *,
    project_version: int | None = None,
    project_logic_client: ProjectLogicClient | None = None,
    request: Request | None = None,
) -> dict[str, int]:
    try:
        text = file_content.decode(CSV_ENCODING)
    except UnicodeDecodeError as err:
        raise ValueError("CSV file must be UTF-8 encoded") from err

    reader = csv.DictReader(io.StringIO(text), dialect=_detect_import_csv_dialect(text))

    fieldnames = set(reader.fieldnames or ())
    if not {"Argument-ID", "argument id"} & fieldnames or not {"Erwiderung", "erwiderung"} & fieldnames:
        raise ValueError("CSV must contain 'Argument-ID' and 'Erwiderung' columns")

    total_rows = 0
    updates_by_argument_id: dict[str, str] = {}
    for row in reader:
        total_rows += 1
        erwiderung = (row.get("Erwiderung") or row.get("erwiderung") or "").strip()
        argument_id = (row.get("Argument-ID") or row.get("argument id") or "").strip()
        if not erwiderung or not argument_id:
            continue

        updates_by_argument_id[argument_id] = erwiderung

    if not updates_by_argument_id:
        return {"updated": 0, "skipped": total_rows}

    project_logic = project_logic_client or ProjectLogicClient()
    if project_version is None:
        project_version = await project_logic.get_latest_project_version(project_id)
    await project_logic.validate_project_write_version(project_id, project_version)

    result = await db.execute(
        update(Argument)
        .where(
            Argument.argument_id.in_(updates_by_argument_id.keys()),
            Argument.project_id == project_id,
            Argument.project_version == project_version,
            Argument.is_deleted.is_(False),
        )
        .values(
            erwiderung=case(
                updates_by_argument_id,
                value=Argument.argument_id,
            )
        )
        .returning(Argument.id)
        .execution_options(synchronize_session=False)
    )
    updated_ids = list(result.scalars().all())
    updated = len(updated_ids)

    if updated_ids:
        audit_ctx = audit_context_kwargs(request)
        await record_audit_entries(
            db,
            project_id=project_id,
            entries=[
                AuditEntry(
                    entity_type="argument",
                    change_type=ChangeType.UPDATE,
                    entity_id=arg_id,
                    action_type="ERWIDERUNG_IMPORT",
                )
                for arg_id in updated_ids
            ],
            **audit_ctx,
        )

    await db.commit()
    skipped = total_rows - updated
    return {"updated": updated, "skipped": skipped}


def _detect_import_csv_dialect(text: str) -> type[csv.Dialect]:
    sample = text.splitlines()[0] if text else ""
    try:
        return csv.Sniffer().sniff(sample, delimiters=CSV_IMPORT_DELIMITERS)
    except csv.Error:
        return csv.Sniffer().sniff(
            "argument id;erwiderung\n",
            delimiters=CSV_IMPORT_DELIMITERS,
        )


async def _fetch_filenames_by_file_id(
    *,
    project_id: UUID,
    project_version: int,
    source_file_ids: set[UUID],
    dms_client: DocumentManagementClient,
) -> dict[UUID, str]:
    if not source_file_ids:
        return {}

    filenames_by_file_id: dict[UUID, str] = {}
    for file_type in _SOURCE_FILE_TYPES:
        files = await dms_client.list_project_files(
            project_id=project_id,
            project_version=project_version,
            file_type=file_type,
        )
        filenames_by_file_id.update({file.id: file.filename for file in files if file.id in source_file_ids})
        if len(filenames_by_file_id) == len(source_file_ids):
            break

    return filenames_by_file_id


async def _fetch_topics_by_id(
    *,
    rows: list[tuple[Argument, UUID]],
    project_logic_client: ProjectLogicClient,
) -> dict[UUID, TopicMetadata]:
    topic_ids = {
        topic_id
        for argument, _ in rows
        for topic_id in (argument.topic_id, argument.sub_topic_id)
        if topic_id is not None
    }
    topics_by_id = await project_logic_client.get_topics(topic_ids)
    parent_topic_ids = {
        topic.parent_topic_id
        for topic in topics_by_id.values()
        if topic.parent_topic_id is not None and topic.parent_topic_id not in topics_by_id
    }
    if parent_topic_ids:
        topics_by_id.update(await project_logic_client.get_topics(parent_topic_ids))
    return topics_by_id


def _resolve_topic_names(
    argument: Argument,
    topics_by_id: dict[UUID, TopicMetadata],
) -> tuple[str, str]:
    if argument.sub_topic_id is not None:
        subtopic = topics_by_id.get(argument.sub_topic_id)
        topic = (
            topics_by_id.get(subtopic.parent_topic_id)
            if subtopic is not None and subtopic.parent_topic_id is not None
            else None
        )
        if topic is None and argument.topic_id is not None:
            topic = topics_by_id.get(argument.topic_id)
        return (
            topic.name if topic is not None else "",
            subtopic.name if subtopic is not None else "",
        )

    if argument.topic_id is not None:
        topic = topics_by_id.get(argument.topic_id)
        return (topic.name if topic is not None else "", "")

    return ("", "")


async def list_processed_file_ids(
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int | None = None,
    project_logic_client: ProjectLogicClient | None = None,
) -> ProcessedFileIdsResponse:
    """Return EWMS document file IDs whose extraction/classification finished."""
    if project_version is None:
        project_logic = project_logic_client or ProjectLogicClient()
        project_version = await project_logic.get_latest_project_version(project_id)
    if project_version is None:
        return ProcessedFileIdsResponse(file_ids=[])

    result = await db.execute(
        select(BeteiligungsEingang.file_id)
        .where(
            BeteiligungsEingang.project_id == project_id,
            BeteiligungsEingang.project_version == project_version,
            BeteiligungsEingang.is_deleted.is_(False),
            BeteiligungsEingang.classification_status == ClassificationStatus.DONE,
        )
        .distinct()
    )
    return ProcessedFileIdsResponse(file_ids=list(result.scalars().all()))


async def insert_argument_extraction_results(
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    body: ArgumentExtractionRequest,
    request: Request | None = None,
) -> ArgumentExtractionResponse:
    """Persist extraction output as one BeteiligungsEingang + one Argument per extracted arg."""
    results = await _insert_document_arguments_bulk(
        db, project_id, project_version, body.document_arguments, request=request
    )
    await db.commit()
    return ArgumentExtractionResponse(results=results)


async def update_classification_results(
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    body: ClassificationRequest,
    request: Request | None = None,
) -> ClassificationResponse:
    """Apply classification topic and subtopic IDs to existing Argument rows.

    Note: an empty payload is a no-op. Documents whose extraction produced
    zero arguments are already moved to DONE at insert time (see
    `_insert_document_arguments_bulk`) — they are never part of a classification
    payload, so no BeteiligungsEingang ever stays stuck in LOADING because of
    an empty list here.
    """
    argument_ids_by_topic: dict[tuple[uuid.UUID, uuid.UUID | None], list[uuid.UUID]] = {}
    for classified_argument in body.classified_arguments:
        argument_ids_by_topic.setdefault(
            (classified_argument.topic_id, classified_argument.sub_topic_id),
            [],
        ).append(classified_argument.argument_id)

    updated_count = 0
    for (topic_id, sub_topic_id), argument_ids in argument_ids_by_topic.items():
        stmt = (
            update(Argument)
            .where(
                Argument.id.in_(argument_ids),
                Argument.project_id == project_id,
                Argument.project_version == project_version,
                Argument.is_deleted.is_(False),
            )
            .values(topic_id=topic_id, sub_topic_id=sub_topic_id)
            .returning(Argument.id)
        )
        result = await db.execute(stmt)
        updated_count += len(result.scalars().all())

    classified_argument_ids = [aid for ids in argument_ids_by_topic.values() for aid in ids]
    completed_argument_ids = classified_argument_ids + body.unclassified_argument_ids
    completed_be_ids = await _beteiligungs_eingang_ids_for_arguments(
        db, project_id, project_version, completed_argument_ids
    )
    # Unclassified arguments still mean classification completed for the document;
    # they remain topic-less so a human can assign the topic in the UI.
    await _set_classification_status_for_beteiligungs_eingaenge(
        db,
        project_id,
        project_version,
        completed_be_ids,
        ClassificationStatus.DONE,
    )

    all_affected_argument_ids = classified_argument_ids + body.unclassified_argument_ids
    if all_affected_argument_ids:
        audit_ctx = audit_context_kwargs(request)
        await record_audit_entries(
            db,
            project_id=project_id,
            entries=[
                AuditEntry(
                    entity_type="argument",
                    change_type=ChangeType.UPDATE,
                    entity_id=arg_id,
                )
                for arg_id in all_affected_argument_ids
            ],
            **audit_ctx,
        )

    await db.commit()
    return ClassificationResponse(updated_count=updated_count)


async def mark_classification_failed(
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    body: ClassificationFailedRequest,
    request: Request | None = None,
) -> ClassificationFailedResponse:
    """Set classification_status=FAILED on the given BeteiligungsEingangs.

    Used by the EWMS workflow when the classification step has exhausted retries
    so the FE stops showing those documents as still loading.
    """
    if not body.beteiligungs_eingang_ids:
        return ClassificationFailedResponse(updated_count=0)

    stmt = (
        update(BeteiligungsEingang)
        .where(
            BeteiligungsEingang.id.in_(body.beteiligungs_eingang_ids),
            BeteiligungsEingang.project_id == project_id,
            BeteiligungsEingang.project_version == project_version,
            BeteiligungsEingang.is_deleted.is_(False),
        )
        .values(classification_status=ClassificationStatus.FAILED)
        .returning(BeteiligungsEingang.id)
    )
    result = await db.execute(stmt)
    updated_count = len(result.scalars().all())

    if updated_count > 0:
        audit_ctx = audit_context_kwargs(request)
        await record_audit_entries(
            db,
            project_id=project_id,
            entries=[
                AuditEntry(
                    entity_type="beteiligungs_eingang",
                    change_type=ChangeType.UPDATE,
                    entity_id=be_id,
                )
                for be_id in body.beteiligungs_eingang_ids
            ],
            **audit_ctx,
        )

    await db.commit()
    return ClassificationFailedResponse(updated_count=updated_count)


async def mark_injection_detected(
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    body: InjectionDetectedRequest,
    request: Request | None = None,
) -> InjectionDetectedResponse:
    """Upsert BeteiligungsEingang rows for injection-detected documents.

    Sets extraction_status=PROMPT_INJECTION_ERROR and classification_status=DONE
    so these files appear as processed and are skipped on workflow retries.
    Idempotent: upserts on (project_id, file_id).
    """
    audit_ctx = audit_context_kwargs(request)
    updated = 0
    for doc in body.documents:
        async with db.begin_nested():
            existing = await _find_existing_beteiligungs_eingang(db, project_id, project_version, doc.file_id)
            if existing is not None and existing.classification_status == ClassificationStatus.DONE:
                continue
            if existing is None:
                be = BeteiligungsEingang(
                    id=uuid.uuid4(),
                    project_id=project_id,
                    project_version=project_version,
                    file_id=doc.file_id,
                    filename=_extract_filename(doc.document_name),
                    beteiligung_typ=_infer_beteiligung_typ(doc.document_name),
                    beteiligungs_eingang_markdown_id=None,
                    extraction_status=ExtractionStatus.PROMPT_INJECTION_ERROR,
                    classification_status=ClassificationStatus.DONE,
                )
                db.add(be)
                await _record_audit_entry(
                    db,
                    project_id=project_id,
                    entity_type="beteiligungs_eingang",
                    change_type=ChangeType.CREATE,
                    entity_id=be.id,
                    **audit_ctx,
                )
            else:
                if existing.beteiligungs_eingang_markdown_id is not None:
                    await db.execute(
                        update(BeteiligungsEingangMarkdown)
                        .where(
                            BeteiligungsEingangMarkdown.id == existing.beteiligungs_eingang_markdown_id,
                            BeteiligungsEingangMarkdown.project_id == project_id,
                            BeteiligungsEingangMarkdown.project_version == project_version,
                            BeteiligungsEingangMarkdown.is_deleted.is_(False),
                        )
                        .values(is_deleted=True)
                    )
                await db.execute(
                    update(BeteiligungsEingang)
                    .where(
                        BeteiligungsEingang.id == existing.id,
                        BeteiligungsEingang.project_id == project_id,
                        BeteiligungsEingang.project_version == project_version,
                        BeteiligungsEingang.is_deleted.is_(False),
                    )
                    .values(
                        extraction_status=ExtractionStatus.PROMPT_INJECTION_ERROR,
                        beteiligungs_eingang_markdown_id=None,
                        classification_status=ClassificationStatus.DONE,
                    )
                )
                await _record_audit_entry(
                    db,
                    project_id=project_id,
                    entity_type="beteiligungs_eingang",
                    change_type=ChangeType.UPDATE,
                    entity_id=existing.id,
                    **audit_ctx,
                )
            updated += 1
    await db.commit()
    return InjectionDetectedResponse(updated_count=updated)


async def _beteiligungs_eingang_ids_for_arguments(
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    argument_ids: list[uuid.UUID],
) -> set[uuid.UUID]:
    if not argument_ids:
        return set()
    result = await db.execute(
        select(Argument.beteiligungs_eingang_id)
        .where(
            Argument.id.in_(argument_ids),
            Argument.project_id == project_id,
            Argument.project_version == project_version,
            Argument.is_deleted.is_(False),
        )
        .distinct()
    )
    return set(result.scalars().all())


async def _set_classification_status_for_beteiligungs_eingaenge(
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    beteiligungs_eingang_ids: set[uuid.UUID],
    status: ClassificationStatus,
) -> None:
    if not beteiligungs_eingang_ids:
        return
    stmt = (
        update(BeteiligungsEingang)
        .where(
            BeteiligungsEingang.id.in_(beteiligungs_eingang_ids),
            BeteiligungsEingang.project_id == project_id,
            BeteiligungsEingang.project_version == project_version,
            BeteiligungsEingang.is_deleted.is_(False),
        )
        .values(classification_status=status)
    )
    await db.execute(stmt)


async def _insert_document_arguments_bulk(
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    docs: list[DocumentArguments],
    request: Request | None = None,
) -> list[DocumentInsertResult]:
    """Persist only missing EWMS documents with bulk inserts.

    Existing BeteiligungsEingang rows are treated as already owned by OMS and
    are skipped. This keeps retries idempotent and avoids replacing arguments
    for documents that were already inserted by a previous workflow attempt.
    """
    if not docs:
        return []

    existing_by_file_id = await _find_existing_beteiligungs_eingaenge(
        db,
        project_id,
        project_version,
        [doc.document_id for doc in docs],
    )
    inserted_be_id_by_file_id: dict[uuid.UUID, uuid.UUID] = {}

    results: list[DocumentInsertResult] = []
    beteiligungs_eingang_rows: list[dict[str, object]] = []
    markdown_rows: list[dict[str, object]] = []
    argument_rows: list[dict[str, object]] = []
    new_be_ids: list[uuid.UUID] = []
    new_argument_ids: list[uuid.UUID] = []

    for doc in docs:
        existing_be = existing_by_file_id.get(doc.document_id)
        if existing_be is not None or doc.document_id in inserted_be_id_by_file_id:
            beteiligungs_eingang_id = (
                existing_be.id if existing_be is not None else inserted_be_id_by_file_id[doc.document_id]
            )
            results.append(
                DocumentInsertResult(
                    document_id=doc.document_id,
                    beteiligungs_eingang_id=beteiligungs_eingang_id,
                    arguments=[],
                    skipped=True,
                )
            )
            continue

        flat_args = [extracted for chunk_arg in doc.chunk_arguments for extracted in chunk_arg.arguments]
        beteiligungs_eingang_id = uuid.uuid4()
        markdown_id = uuid.uuid4() if doc.beteiligungs_eingang_markdown is not None else None
        initial_classification_status = ClassificationStatus.LOADING if flat_args else ClassificationStatus.DONE

        inserted_be_id_by_file_id[doc.document_id] = beteiligungs_eingang_id
        new_be_ids.append(beteiligungs_eingang_id)
        beteiligungs_eingang_rows.append(
            {
                "id": beteiligungs_eingang_id,
                "project_id": project_id,
                "project_version": project_version,
                "file_id": doc.document_id,
                "filename": _extract_filename(doc.document_name),
                "beteiligung_typ": _infer_beteiligung_typ(doc.document_name),
                "beteiligungs_eingang_markdown_id": markdown_id,
                "extraction_status": ExtractionStatus.SUCCESS,
                "classification_status": initial_classification_status,
            }
        )

        if markdown_id is not None:
            markdown_rows.append(
                {
                    "id": markdown_id,
                    "project_id": project_id,
                    "project_version": project_version,
                    "beteiligungs_eingang_id": beteiligungs_eingang_id,
                    "text": doc.beteiligungs_eingang_markdown or "",
                }
            )

        argument_results: list[ArgumentInsertResult] = []
        for local_idx, extracted in enumerate(flat_args):
            argument_db_id = uuid.uuid4()
            new_argument_ids.append(argument_db_id)
            argument_rows.append(
                {
                    "id": argument_db_id,
                    "project_id": project_id,
                    "project_version": project_version,
                    "beteiligungs_eingang_id": beteiligungs_eingang_id,
                    "argument_id": _generate_argument_id(local_idx + 1, doc.document_name),
                    "text": extracted.argument.text,
                    "start_idx": extracted.argument.span.start_idx,
                    "end_idx": extracted.argument.span.end_idx,
                    "context": extracted.context.text,
                    "context_start_idx": extracted.context.span.start_idx,
                    "context_end_idx": extracted.context.span.end_idx,
                }
            )
            argument_results.append(ArgumentInsertResult(argument_id=argument_db_id))

        results.append(
            DocumentInsertResult(
                document_id=doc.document_id,
                beteiligungs_eingang_id=beteiligungs_eingang_id,
                arguments=argument_results,
            )
        )

    if beteiligungs_eingang_rows:
        await _execute_bulk_insert(db, BeteiligungsEingang, beteiligungs_eingang_rows)
    if markdown_rows:
        await _execute_bulk_insert(db, BeteiligungsEingangMarkdown, markdown_rows)
    if argument_rows:
        await _execute_bulk_insert(db, Argument, argument_rows, batch_size=ARGUMENT_BULK_INSERT_BATCH_SIZE)

    audit_ctx = audit_context_kwargs(request)
    audit_entries: list[AuditEntry] = [
        AuditEntry(
            entity_type="beteiligungs_eingang",
            change_type=ChangeType.CREATE,
            entity_id=be_id,
            action_type="EWMS_EXTRACTION",
        )
        for be_id in new_be_ids
    ] + [
        AuditEntry(
            entity_type="argument",
            change_type=ChangeType.CREATE,
            entity_id=arg_id,
            action_type="EWMS_EXTRACTION",
        )
        for arg_id in new_argument_ids
    ]
    if audit_entries:
        await record_audit_entries(db, project_id=project_id, entries=audit_entries, **audit_ctx)

    return results


async def _find_existing_beteiligungs_eingaenge(
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    file_ids: list[uuid.UUID],
) -> dict[uuid.UUID, BeteiligungsEingang]:
    if not file_ids:
        return {}

    result = await db.execute(
        select(BeteiligungsEingang).where(
            BeteiligungsEingang.project_id == project_id,
            BeteiligungsEingang.project_version == project_version,
            BeteiligungsEingang.file_id.in_(file_ids),
            BeteiligungsEingang.is_deleted.is_(False),
        )
    )
    return {be.file_id: be for be in result.scalars().all()}


async def _execute_bulk_insert(
    db: AsyncSession,
    model: type[BeteiligungsEingang] | type[BeteiligungsEingangMarkdown] | type[Argument],
    rows: list[dict[str, object]],
    *,
    batch_size: int = EXTRACTION_BULK_INSERT_BATCH_SIZE,
) -> None:
    for start in range(0, len(rows), batch_size):
        await db.execute(insert(model), rows[start : start + batch_size])


async def _find_existing_beteiligungs_eingang(
    db: AsyncSession,
    project_id: uuid.UUID,
    project_version: int,
    file_id: uuid.UUID,
) -> BeteiligungsEingang | None:
    result = await db.execute(
        select(BeteiligungsEingang)
        .where(
            BeteiligungsEingang.project_id == project_id,
            BeteiligungsEingang.project_version == project_version,
            BeteiligungsEingang.file_id == file_id,
            BeteiligungsEingang.is_deleted.is_(False),
        )
        .limit(1)
    )
    return result.scalar_one_or_none()


def _extract_filename(document_name: str) -> str:
    filename = PureWindowsPath(PurePosixPath(document_name).name).name
    return filename or document_name


_FILENAME_PREFIX_TO_TYP: dict[str, BeteiligungTyp] = {
    "S": BeteiligungTyp.STELLUNGNAHME,
    "N": BeteiligungTyp.NATURSCHUTZ,
    "E": BeteiligungTyp.EINWENDUNG,
}


def _infer_beteiligung_typ(document_name: str) -> BeteiligungTyp | None:
    filename = _extract_filename(document_name)
    return _FILENAME_PREFIX_TO_TYP.get(filename[0]) if filename else None


def _generate_argument_id(position: int, document_name: str) -> str:
    return f"A{position}-{_extract_filename(document_name)}"
