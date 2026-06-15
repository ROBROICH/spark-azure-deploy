"""API tests for objection management routes."""

import uuid

import pytest
from fastapi import status
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.db_models import Argument, BeteiligungsEingang, BeteiligungsEingangMarkdown
from src.models.schemas.ewms_schemas import (
    ArgumentExtractionRequest,
    ChunkArguments,
    ChunkInfo,
    ClassificationFailedRequest,
    ClassificationRequest,
    ClassifiedArgument,
    DocumentArguments,
    ExtractedArgument,
    Span,
    TextSegment,
)
from src.models.schemas.objection_schemas import (
    ArgumentStatus,
    BeteiligungTyp,
    ClassificationStatus,
    ExtractionStatus,
)


def _argument_extraction_payload(
    document_id: uuid.UUID,
    document_name: str,
    argument_texts: list[str],
) -> ArgumentExtractionRequest:
    return ArgumentExtractionRequest(
        document_arguments=[
            DocumentArguments(
                document_id=document_id,
                document_name=document_name,
                beteiligungs_eingang_markdown=f"# {document_name}",
                chunk_arguments=[
                    ChunkArguments(
                        chunk=ChunkInfo(
                            chunk_id="chunk-1",
                            page_content="\n".join(argument_texts),
                            page_numbers=[1],
                        ),
                        arguments=[
                            ExtractedArgument(
                                argument=TextSegment(
                                    text=text,
                                    span=Span(start_idx=idx * 100, end_idx=idx * 100 + len(text)),
                                ),
                                description=f"Description {idx}",
                                context=TextSegment(
                                    text=f"Context for {text}",
                                    span=Span(start_idx=idx * 100, end_idx=idx * 100 + len(f"Context for {text}")),
                                ),
                            )
                            for idx, text in enumerate(argument_texts)
                        ],
                    )
                ],
            )
        ]
    )


@pytest.mark.asyncio
async def test_insert_argument_extraction_results_creates_nodes(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    document_id = uuid.uuid4()
    document_name = "Einwendung Müller"

    payload = ArgumentExtractionRequest(
        document_arguments=[
            DocumentArguments(
                document_id=document_id,
                document_name=document_name,
                chunk_arguments=[
                    ChunkArguments(
                        chunk=ChunkInfo(
                            chunk_id="chunk-1",
                            page_content="Argument text in surrounding context.",
                            page_numbers=[1],
                        ),
                        arguments=[
                            ExtractedArgument(
                                argument=TextSegment(
                                    text="Argument text",
                                    span=Span(start_idx=0, end_idx=13),
                                ),
                                description="Argument description",
                                context=TextSegment(
                                    text="Argument text in surrounding context.",
                                    span=Span(start_idx=0, end_idx=37),
                                ),
                            )
                        ],
                    )
                ],
            )
        ]
    )

    response = await client.post(
        f"/{project_id}/ewms/argument-extraction?project_version=1",
        json=payload.model_dump(mode="json"),
    )

    assert response.status_code == status.HTTP_200_OK
    body = response.json()
    assert body["results"][0]["document_id"] == str(document_id)
    assert len(body["results"][0]["arguments"]) == 1
    assert body["results"][0]["arguments"][0]["argument_id"]

    beteiligungs_eingaenge = (await db_session.execute(select(BeteiligungsEingang))).scalars().all()
    markdown_nodes = (await db_session.execute(select(BeteiligungsEingangMarkdown))).scalars().all()
    arguments = (await db_session.execute(select(Argument))).scalars().all()

    assert len(beteiligungs_eingaenge) == 1
    assert beteiligungs_eingaenge[0].file_id == document_id
    assert beteiligungs_eingaenge[0].beteiligungs_eingang_markdown_id is None
    assert markdown_nodes == []
    assert len(arguments) == 1
    assert arguments[0].text == "Argument text"
    assert arguments[0].argument_id == f"A1-{document_name}"
    assert beteiligungs_eingaenge[0].classification_status == ClassificationStatus.LOADING


@pytest.mark.asyncio
async def test_insert_argument_extraction_results_stores_markdown_as_separate_node(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    document_id = uuid.uuid4()
    payload = _argument_extraction_payload(document_id, "markdown.pdf", ["Argument"])

    response = await client.post(
        f"/{project_id}/ewms/argument-extraction?project_version=1",
        json=payload.model_dump(mode="json"),
    )

    assert response.status_code == status.HTTP_200_OK
    beteiligungs_eingang = (await db_session.execute(select(BeteiligungsEingang))).scalar_one()
    markdown = (await db_session.execute(select(BeteiligungsEingangMarkdown))).scalar_one()
    assert beteiligungs_eingang.beteiligungs_eingang_markdown_id == markdown.id
    assert markdown.beteiligungs_eingang_id == beteiligungs_eingang.id
    assert markdown.text == "# markdown.pdf"


@pytest.mark.asyncio
async def test_insert_argument_extraction_results_uses_workflow_project_version(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    document_id = uuid.uuid4()
    project_version = 2
    payload = _argument_extraction_payload(document_id, "versioned.pdf", ["Argument"])

    response = await client.post(
        f"/{project_id}/ewms/argument-extraction?project_version={project_version}",
        json=payload.model_dump(mode="json"),
    )

    assert response.status_code == status.HTTP_200_OK
    beteiligungs_eingang = (await db_session.execute(select(BeteiligungsEingang))).scalar_one()
    argument = (await db_session.execute(select(Argument))).scalar_one()
    assert beteiligungs_eingang.project_version == project_version
    assert argument.project_version == project_version


@pytest.mark.asyncio
async def test_insert_argument_extraction_results_skips_existing_document(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    document_id = uuid.uuid4()

    first_payload = _argument_extraction_payload(document_id, "rerun.pdf", ["Old argument"])
    first_response = await client.post(
        f"/{project_id}/ewms/argument-extraction?project_version=1",
        json=first_payload.model_dump(mode="json"),
    )
    assert first_response.status_code == status.HTTP_200_OK
    first_body = first_response.json()
    beteiligungs_eingang_id = uuid.UUID(first_body["results"][0]["beteiligungs_eingang_id"])
    first_argument_id = uuid.UUID(first_body["results"][0]["arguments"][0]["argument_id"])

    second_payload = _argument_extraction_payload(
        document_id,
        "rerun.pdf",
        ["New argument one", "New argument two"],
    )
    second_response = await client.post(
        f"/{project_id}/ewms/argument-extraction?project_version=1",
        json=second_payload.model_dump(mode="json"),
    )

    assert second_response.status_code == status.HTTP_200_OK
    second_body = second_response.json()
    second_result = second_body["results"][0]
    assert second_result == {
        "document_id": str(document_id),
        "beteiligungs_eingang_id": str(beteiligungs_eingang_id),
        "arguments": [],
        "skipped": True,
    }

    active_arguments = (
        (
            await db_session.execute(
                select(Argument)
                .where(
                    Argument.beteiligungs_eingang_id == beteiligungs_eingang_id,
                    Argument.is_deleted.is_(False),
                )
                .order_by(Argument.argument_id)
            )
        )
        .scalars()
        .all()
    )
    assert len(active_arguments) == 1
    assert active_arguments[0].id == first_argument_id
    assert active_arguments[0].text == "Old argument"
    assert active_arguments[0].argument_id == "A1-rerun.pdf"

    beteiligungs_eingang = (
        await db_session.execute(select(BeteiligungsEingang).where(BeteiligungsEingang.id == beteiligungs_eingang_id))
    ).scalar_one()
    assert beteiligungs_eingang is not None
    await db_session.refresh(beteiligungs_eingang)
    assert beteiligungs_eingang.classification_status == ClassificationStatus.LOADING
    markdown_nodes = (
        (
            await db_session.execute(
                select(BeteiligungsEingangMarkdown).where(
                    BeteiligungsEingangMarkdown.beteiligungs_eingang_id == beteiligungs_eingang_id,
                    BeteiligungsEingangMarkdown.is_deleted.is_(False),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(markdown_nodes) == 1
    assert markdown_nodes[0].id == beteiligungs_eingang.beteiligungs_eingang_markdown_id
    assert markdown_nodes[0].text == "# rerun.pdf"


@pytest.mark.asyncio
async def test_insert_argument_extraction_results_skips_done_document(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    document_id = uuid.uuid4()
    topic_id = uuid.uuid4()

    first_payload = _argument_extraction_payload(document_id, "done-rerun.pdf", ["Persisted argument"])
    first_response = await client.post(
        f"/{project_id}/ewms/argument-extraction?project_version=1",
        json=first_payload.model_dump(mode="json"),
    )
    assert first_response.status_code == status.HTTP_200_OK
    first_result = first_response.json()["results"][0]
    beteiligungs_eingang_id = uuid.UUID(first_result["beteiligungs_eingang_id"])
    argument_id = uuid.UUID(first_result["arguments"][0]["argument_id"])

    response = await client.patch(
        f"/{project_id}/ewms/classification?project_version=1",
        json={"classified_arguments": [{"argument_id": str(argument_id), "topic_id": str(topic_id)}]},
    )
    assert response.status_code == status.HTTP_200_OK

    second_payload = _argument_extraction_payload(document_id, "done-rerun.pdf", ["Different argument"])
    second_response = await client.post(
        f"/{project_id}/ewms/argument-extraction?project_version=1",
        json=second_payload.model_dump(mode="json"),
    )

    assert second_response.status_code == status.HTTP_200_OK
    second_result = second_response.json()["results"][0]
    assert second_result == {
        "document_id": str(document_id),
        "beteiligungs_eingang_id": str(beteiligungs_eingang_id),
        "arguments": [],
        "skipped": True,
    }

    active_arguments = (
        (
            await db_session.execute(
                select(Argument).where(
                    Argument.beteiligungs_eingang_id == beteiligungs_eingang_id,
                    Argument.is_deleted.is_(False),
                )
            )
        )
        .scalars()
        .all()
    )
    assert len(active_arguments) == 1
    assert active_arguments[0].id == argument_id
    assert active_arguments[0].text == "Persisted argument"
    assert active_arguments[0].topic_id == topic_id

    beteiligungs_eingang = (
        await db_session.execute(select(BeteiligungsEingang).where(BeteiligungsEingang.id == beteiligungs_eingang_id))
    ).scalar_one()
    assert beteiligungs_eingang is not None
    await db_session.refresh(beteiligungs_eingang)
    assert beteiligungs_eingang.classification_status == ClassificationStatus.DONE


@pytest.mark.asyncio
async def test_insert_argument_extraction_zero_arguments_marks_done(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    """A doc with no extracted arguments has nothing to classify → DONE up front."""
    document_id = uuid.uuid4()
    payload = ArgumentExtractionRequest(
        document_arguments=[
            DocumentArguments(
                document_id=document_id,
                document_name="empty.pdf",
                chunk_arguments=[],
            )
        ]
    )

    response = await client.post(
        f"/{project_id}/ewms/argument-extraction?project_version=1",
        json=payload.model_dump(mode="json"),
    )
    assert response.status_code == status.HTTP_200_OK

    beteiligungs_eingaenge = (await db_session.execute(select(BeteiligungsEingang))).scalars().all()
    assert len(beteiligungs_eingaenge) == 1
    assert beteiligungs_eingaenge[0].classification_status == ClassificationStatus.DONE


@pytest.mark.asyncio
async def test_list_processed_file_ids_returns_distinct_project_file_ids(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    # Within a single project, the partial unique index on
    # ``(project_id, file_id, project_version) WHERE is_deleted IS false``
    # rules out the legacy "same file twice" scenario. Distinctness still
    # matters across projects sharing a file_id.
    file_id = uuid.uuid4()
    other_file_id = uuid.uuid4()

    db_session.add_all(
        [
            BeteiligungsEingang(
                id=uuid.uuid4(),
                project_id=project_id,
                file_id=file_id,
                beteiligung_typ=BeteiligungTyp.EINWENDUNG,
                extraction_status=ExtractionStatus.SUCCESS,
                classification_status=ClassificationStatus.DONE,
            ),
            BeteiligungsEingang(
                id=uuid.uuid4(),
                project_id=uuid.uuid4(),
                file_id=file_id,
                beteiligung_typ=BeteiligungTyp.EINWENDUNG,
                extraction_status=ExtractionStatus.SUCCESS,
                classification_status=ClassificationStatus.DONE,
            ),
            BeteiligungsEingang(
                id=uuid.uuid4(),
                project_id=uuid.uuid4(),
                file_id=other_file_id,
                beteiligung_typ=BeteiligungTyp.EINWENDUNG,
                extraction_status=ExtractionStatus.SUCCESS,
                classification_status=ClassificationStatus.DONE,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get(f"/{project_id}/ewms/processed-file-ids?project_version=1")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"file_ids": [str(file_id)]}


@pytest.mark.asyncio
async def test_list_processed_file_ids_uses_latest_version(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    old_file_id = uuid.uuid4()
    latest_file_id = uuid.uuid4()
    db_session.add_all(
        [
            BeteiligungsEingang(
                id=uuid.uuid4(),
                project_id=project_id,
                project_version=1,
                file_id=old_file_id,
                beteiligung_typ=BeteiligungTyp.EINWENDUNG,
                extraction_status=ExtractionStatus.SUCCESS,
                classification_status=ClassificationStatus.DONE,
            ),
            BeteiligungsEingang(
                id=uuid.uuid4(),
                project_id=project_id,
                project_version=2,
                file_id=latest_file_id,
                beteiligung_typ=BeteiligungTyp.EINWENDUNG,
                extraction_status=ExtractionStatus.SUCCESS,
                classification_status=ClassificationStatus.LOADING,
            ),
        ]
    )
    await db_session.commit()

    response = await client.get(f"/{project_id}/ewms/processed-file-ids?project_version=2")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"file_ids": []}


@pytest.mark.asyncio
async def test_list_processed_file_ids_excludes_unfinished_documents(
    client: AsyncClient,
    project_id: uuid.UUID,
) -> None:
    done_file_id = uuid.uuid4()
    loading_file_id = uuid.uuid4()
    failed_file_id = uuid.uuid4()

    done_payload = _argument_extraction_payload(done_file_id, "done.pdf", [])
    loading_payload = _argument_extraction_payload(loading_file_id, "loading.pdf", ["Needs classification"])
    failed_payload = _argument_extraction_payload(failed_file_id, "failed.pdf", ["Failed classification"])

    failed_response = None
    for payload in (done_payload, loading_payload, failed_payload):
        response = await client.post(
            f"/{project_id}/ewms/argument-extraction?project_version=1",
            json=payload.model_dump(mode="json"),
        )
        assert response.status_code == status.HTTP_200_OK
        if payload is failed_payload:
            failed_response = response

    assert failed_response is not None
    failed_beteiligungs_eingang_id = failed_response.json()["results"][0]["beteiligungs_eingang_id"]
    response = await client.patch(
        f"/{project_id}/ewms/classification-failed?project_version=1",
        json={"beteiligungs_eingang_ids": [failed_beteiligungs_eingang_id]},
    )
    assert response.status_code == status.HTTP_200_OK

    response = await client.get(f"/{project_id}/ewms/processed-file-ids?project_version=1")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"file_ids": [str(done_file_id)]}


@pytest.mark.asyncio
async def test_list_processed_file_ids_returns_empty_list(
    client: AsyncClient,
    project_id: uuid.UUID,
) -> None:
    response = await client.get(f"/{project_id}/ewms/processed-file-ids?project_version=1")

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"file_ids": []}


@pytest.mark.asyncio
async def test_update_classification_results_persists_topic_id(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_argument: Argument,
) -> None:
    topic_id = uuid.uuid4()
    create_test_argument.sub_topic_id = uuid.uuid4()
    await db_session.commit()

    payload = ClassificationRequest(
        classified_arguments=[
            ClassifiedArgument(
                argument_id=create_test_argument.id,
                topic_id=topic_id,
            )
        ]
    )

    response = await client.patch(
        f"/{create_test_argument.project_id}/ewms/classification?project_version=1",
        json=payload.model_dump(mode="json"),
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 1}

    updated_argument = (
        await db_session.execute(select(Argument).where(Argument.id == create_test_argument.id))
    ).scalar_one()
    await db_session.refresh(updated_argument)
    assert updated_argument.topic_id == topic_id
    assert updated_argument.sub_topic_id is None

    be = (
        await db_session.execute(
            select(BeteiligungsEingang).where(BeteiligungsEingang.id == create_test_argument.beteiligungs_eingang_id)
        )
    ).scalar_one()
    assert be is not None
    await db_session.refresh(be)
    assert be.classification_status == ClassificationStatus.DONE


@pytest.mark.asyncio
async def test_update_classification_results_updates_latest_version_only(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_argument: Argument,
) -> None:
    topic_id = uuid.uuid4()
    old_be = (
        await db_session.execute(
            select(BeteiligungsEingang).where(BeteiligungsEingang.id == create_test_argument.beteiligungs_eingang_id)
        )
    ).scalar_one()
    latest_be = BeteiligungsEingang(
        id=old_be.id,
        project_id=old_be.project_id,
        project_version=2,
        beteiligung_typ=old_be.beteiligung_typ,
        file_id=old_be.file_id,
        extraction_status=old_be.extraction_status,
        classification_status=ClassificationStatus.LOADING,
    )
    latest_argument = Argument(
        id=create_test_argument.id,
        project_id=create_test_argument.project_id,
        project_version=2,
        beteiligungs_eingang_id=old_be.id,
        text=create_test_argument.text,
        status=ArgumentStatus.OPEN,
    )
    db_session.add_all([latest_be, latest_argument])
    await db_session.commit()

    response = await client.patch(
        f"/{create_test_argument.project_id}/ewms/classification?project_version=2",
        json={"classified_arguments": [{"argument_id": str(create_test_argument.id), "topic_id": str(topic_id)}]},
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 1}
    await db_session.refresh(create_test_argument)
    await db_session.refresh(old_be)
    await db_session.refresh(latest_argument)
    await db_session.refresh(latest_be)
    assert create_test_argument.topic_id is None
    assert old_be.classification_status == ClassificationStatus.LOADING
    assert latest_argument.topic_id == topic_id
    assert latest_be.classification_status == ClassificationStatus.DONE


@pytest.mark.asyncio
async def test_update_classification_results_persists_sub_topic_id(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_argument: Argument,
) -> None:
    topic_id = uuid.uuid4()
    sub_topic_id = uuid.uuid4()

    payload = ClassificationRequest(
        classified_arguments=[
            ClassifiedArgument(
                argument_id=create_test_argument.id,
                topic_id=topic_id,
                sub_topic_id=sub_topic_id,
            )
        ]
    )

    response = await client.patch(
        f"/{create_test_argument.project_id}/ewms/classification?project_version=1",
        json=payload.model_dump(mode="json"),
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 1}

    updated_argument = (
        await db_session.execute(
            select(Argument).where(
                Argument.id == create_test_argument.id,
                Argument.project_version == create_test_argument.project_version,
            )
        )
    ).scalar_one()
    await db_session.refresh(updated_argument)
    assert updated_argument.topic_id == topic_id
    assert updated_argument.sub_topic_id == sub_topic_id


@pytest.mark.asyncio
async def test_update_classification_results_marks_document_done_with_unclassified_argument(
    client: AsyncClient,
    db_session: AsyncSession,
    project_id: uuid.UUID,
) -> None:
    mixed_document_id = uuid.uuid4()
    done_document_id = uuid.uuid4()
    topic_id = uuid.uuid4()

    mixed_response = await client.post(
        f"/{project_id}/ewms/argument-extraction?project_version=1",
        json=_argument_extraction_payload(
            mixed_document_id,
            "mixed-classification.pdf",
            ["Classified argument", "Unclassified argument"],
        ).model_dump(mode="json"),
    )
    assert mixed_response.status_code == status.HTTP_200_OK
    mixed_result = mixed_response.json()["results"][0]
    mixed_be_id = uuid.UUID(mixed_result["beteiligungs_eingang_id"])
    mixed_classified_arg_id = uuid.UUID(mixed_result["arguments"][0]["argument_id"])
    mixed_unclassified_arg_id = uuid.UUID(mixed_result["arguments"][1]["argument_id"])

    done_response = await client.post(
        f"/{project_id}/ewms/argument-extraction?project_version=1",
        json=_argument_extraction_payload(
            done_document_id,
            "done-classification.pdf",
            ["Done argument"],
        ).model_dump(mode="json"),
    )
    assert done_response.status_code == status.HTTP_200_OK
    done_result = done_response.json()["results"][0]
    done_be_id = uuid.UUID(done_result["beteiligungs_eingang_id"])
    done_arg_id = uuid.UUID(done_result["arguments"][0]["argument_id"])

    response = await client.patch(
        f"/{project_id}/ewms/classification?project_version=1",
        json={
            "classified_arguments": [
                {"argument_id": str(mixed_classified_arg_id), "topic_id": str(topic_id)},
                {"argument_id": str(done_arg_id), "topic_id": str(topic_id)},
            ],
            "unclassified_argument_ids": [str(mixed_unclassified_arg_id)],
        },
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 2}

    mixed_be = (
        await db_session.execute(select(BeteiligungsEingang).where(BeteiligungsEingang.id == mixed_be_id))
    ).scalar_one()
    done_be = (
        await db_session.execute(select(BeteiligungsEingang).where(BeteiligungsEingang.id == done_be_id))
    ).scalar_one()
    assert mixed_be is not None
    assert done_be is not None
    await db_session.refresh(mixed_be)
    await db_session.refresh(done_be)
    assert mixed_be.classification_status == ClassificationStatus.DONE
    assert done_be.classification_status == ClassificationStatus.DONE

    mixed_classified_arg = (
        await db_session.execute(select(Argument).where(Argument.id == mixed_classified_arg_id))
    ).scalar_one()
    mixed_unclassified_arg = (
        await db_session.execute(select(Argument).where(Argument.id == mixed_unclassified_arg_id))
    ).scalar_one()
    done_arg = (await db_session.execute(select(Argument).where(Argument.id == done_arg_id))).scalar_one()
    assert mixed_classified_arg is not None
    assert mixed_unclassified_arg is not None
    assert done_arg is not None
    await db_session.refresh(mixed_classified_arg)
    await db_session.refresh(mixed_unclassified_arg)
    await db_session.refresh(done_arg)
    assert mixed_classified_arg.topic_id == topic_id
    assert mixed_unclassified_arg.topic_id is None
    assert done_arg.topic_id == topic_id


@pytest.mark.parametrize(
    "classified_argument",
    [
        {"argument_id": str(uuid.uuid4())},
        {"argument_id": str(uuid.uuid4()), "topic_id": None},
        {"argument_id": str(uuid.uuid4()), "category": {"uid": str(uuid.uuid4())}},
    ],
)
@pytest.mark.asyncio
async def test_update_classification_results_rejects_missing_or_skewed_topic_id(
    client: AsyncClient,
    project_id: uuid.UUID,
    classified_argument: dict[str, object],
) -> None:
    response = await client.patch(
        f"/{project_id}/ewms/classification?project_version=1",
        json={"classified_arguments": [classified_argument]},
    )

    assert response.status_code == status.HTTP_422_UNPROCESSABLE_ENTITY


@pytest.mark.asyncio
async def test_mark_classification_failed_flips_status(
    client: AsyncClient,
    db_session: AsyncSession,
    create_test_beteiligungs_eingang: BeteiligungsEingang,
) -> None:
    payload = ClassificationFailedRequest(
        beteiligungs_eingang_ids=[create_test_beteiligungs_eingang.id],
    )

    response = await client.patch(
        f"/{create_test_beteiligungs_eingang.project_id}/ewms/classification-failed?project_version=1",
        json=payload.model_dump(mode="json"),
    )

    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 1}

    await db_session.refresh(create_test_beteiligungs_eingang)
    assert create_test_beteiligungs_eingang.classification_status == ClassificationStatus.FAILED


@pytest.mark.asyncio
async def test_mark_classification_failed_with_empty_list_is_noop(
    client: AsyncClient,
    project_id: uuid.UUID,
) -> None:
    response = await client.patch(
        f"/{project_id}/ewms/classification-failed?project_version=1",
        json={"beteiligungs_eingang_ids": []},
    )
    assert response.status_code == status.HTTP_200_OK
    assert response.json() == {"updated_count": 0}
